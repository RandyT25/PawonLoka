import { useState, useEffect } from "react"
import { supabase } from "../../../lib/supabase"
import SearchSelect from "../../components/SearchSelect"
import { toBaseUnit } from "../../../shared/unitConversion"
import DateRangePicker, { buildDateRange } from "../DateRangePicker"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }
const UNITS_FALLBACK = ["gr","kg","ml","L","Galon","pcs","Ekor","butir","biji","buah","ikat","lembar","bungkus","pack","sachet","botol","Can","tsp","tbsp","cup","porsi","portion"]

// Default a newly-selected ingredient's unit to its biggest packaging size (largest
// conversions[].qty multiplier), not the raw base unit, since that's almost never what
// staff actually mean to select when they don't touch the unit dropdown.
function biggestUnit(ing) {
  if (!ing) return ""
  const convs = ing.conversions || []
  if (!convs.length) return ing.unit
  return convs.reduce((max, c) => (parseFloat(c.qty)||0) > (parseFloat(max.qty)||0) ? c : max, convs[0]).unit || ing.unit
}

function computeWAC(ing, qtyBase, totalCostForBatch) {
  const oldStock     = parseFloat(ing.stock) || 0
  const oldCost      = parseFloat(ing.cost_per_unit) || 0
  const newTotalCost = (oldStock * oldCost) + totalCostForBatch
  const newStock     = oldStock + qtyBase
  const newWAC       = newStock > 0 ? newTotalCost / newStock : oldCost
  if (oldCost > 0 && (newWAC > oldCost * 5 || newWAC < oldCost * 0.2)) {
    console.warn(`WAC outlier for ${ing.name || ing.id}: ${oldCost} -> ${newWAC}`)
  }
  return { newStock, newWAC }
}

async function cascadeRecalc(updatedIngIds) {
  if (!updatedIngIds.length) return
  const { data: allIngs } = await supabase.from("ingredients").select("id,cost_per_unit,unit,conversions")
  const ingMap = {}
  for (const i of allIngs||[]) ingMap[i.id] = i

  const { data: subLines } = await supabase
    .from("sub_recipe_ingredients").select("sub_recipe_id,ingredient_id,qty,unit")
    .in("ingredient_id", updatedIngIds)
  const affectedSubIds = [...new Set((subLines||[]).map(l => l.sub_recipe_id))]

  // Each sub-recipe touches a distinct row, so they're independent — safe to compute/write
  // in parallel instead of one at a time. Cross-dependencies (a sub-recipe used as an
  // ingredient of another sub-recipe in this same batch) aren't ordering-guaranteed here
  // either way — the recursive cascadeRecalc(updatedSubIngIds) call below is what actually
  // resolves those, same as before this was parallelized.
  const subResults = await Promise.all(affectedSubIds.map(async subId => {
    const { data: allSubLines } = await supabase.from("sub_recipe_ingredients").select("*").eq("sub_recipe_id", subId)
    let totalCost = 0
    for (const line of allSubLines||[]) {
      const ing = ingMap[line.ingredient_id]
      if (!ing) continue
      totalCost += toBaseUnit(ing, parseFloat(line.qty)||0, line.unit) * (ing.cost_per_unit||0)
    }
    const { data: sub } = await supabase.from("sub_recipes").select("id,ingredient_id,yield_qty").eq("id", subId).single()
    if (!sub?.ingredient_id) return null
    const costPerYield = totalCost / (parseFloat(sub.yield_qty)||1)
    await Promise.all([
      supabase.from("ingredients").update({ cost_per_unit:costPerYield }).eq("id", sub.ingredient_id),
      supabase.from("sub_recipes").update({ cost_per_unit:costPerYield }).eq("id", subId),
    ])
    return { ingredientId:sub.ingredient_id, costPerYield }
  }))
  const updatedSubIngIds = []
  for (const r of subResults) {
    if (!r) continue
    ingMap[r.ingredientId] = { ...ingMap[r.ingredientId], cost_per_unit:r.costPerYield }
    updatedSubIngIds.push(r.ingredientId)
  }

  const allChangedIds = [...new Set([...updatedIngIds, ...updatedSubIngIds])]
  const { data: dishLines } = await supabase.from("recipes").select("product_id,ingredient_id,qty,unit").in("ingredient_id", allChangedIds)
  const affectedProductIds = [...new Set((dishLines||[]).map(l => l.product_id).filter(Boolean))]

  await Promise.all(affectedProductIds.map(async productId => {
    const { data: allDishLines } = await supabase.from("recipes").select("*").eq("product_id", productId)
    let totalCost = 0
    for (const line of allDishLines||[]) {
      const ing = ingMap[line.ingredient_id]
      if (!ing) continue
      totalCost += toBaseUnit(ing, parseFloat(line.qty)||0, line.unit) * (ing.cost_per_unit||0)
    }
    // products' PK is "sku", not "id" — and it has no "margin" column (Products.jsx computes
    // margin on the fly from cogs/price). Both were wrong here, so this cascade silently
    // no-op'd (PostgREST rejects unknown columns) and COGS never actually got recalculated
    // after a PO payment.
    await supabase.from("products").update({ cogs:Math.round(totalCost) }).eq("sku", productId)
  }))

  if (updatedSubIngIds.length) await cascadeRecalc(updatedSubIngIds)
}

// Pure/synchronous: mutates the shared in-memory ingMap exactly like the old sequential
// processPaidPO did (so WAC accumulation order across items/POs in one bulk batch is
// preserved), but collects the writes instead of awaiting each one — callers batch/
// parallelize the actual persistence themselves.
function computePaidPOChanges(po, ingMap) {
  const updatedIngIds = []
  const ingUpdates = {}
  const movements = []
  for (const item of po.po_items||[]) {
    const ing = ingMap[item.ingredient_id]
    if (!ing) continue
    const qtyBase = toBaseUnit(ing, parseFloat(item.qty), item.unit)
    const costPerBase = qtyBase > 0 ? (parseFloat(item.unit_cost)||0) * parseFloat(item.qty) / qtyBase : 0
    const updatedConvs = (ing.conversions||[]).map(c => c.unit===item.unit ? {...c,last_price:item.unit_cost} : c)
    const payload = { last_purchase_price:item.unit_cost, last_purchase_unit:item.unit, conversions:updatedConvs }
    if (ing.track_stock !== false) {
      const { newStock, newWAC } = computeWAC(ing, qtyBase, qtyBase * costPerBase)
      payload.stock = newStock
      payload.cost_per_unit = newWAC
      movements.push({
        id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
        type:"Purchase", ingredient_id:ing.id, ingredient_name:ing.name,
        qty:qtyBase, unit:ing.unit, ref:po.id,
        note:`Received: ${item.qty} ${item.unit} @ ${fmt(item.unit_cost)} → WAC: ${fmt(newWAC)}/${ing.unit}`,
        date:new Date().toISOString().slice(0,10),
        time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
      })
      ingMap[ing.id] = { ...ing, stock:newStock, cost_per_unit:newWAC }
      updatedIngIds.push(ing.id)
    }
    ingUpdates[ing.id] = payload
  }
  return { updatedIngIds, ingUpdates, movements }
}

// Fires the writes collected by one or more computePaidPOChanges() calls — ingredient
// updates in parallel (distinct rows), plus one bulk stock_movements insert.
async function persistPaidPOChanges(ingUpdates, movements) {
  await Promise.all([
    ...Object.entries(ingUpdates).map(([id, payload]) => supabase.from("ingredients").update(payload).eq("id", id)),
    ...(movements.length ? [supabase.from("stock_movements").insert(movements)] : []),
  ])
}

// Reverses the stock quantity a Paid PO added, for use when voiding it. Only quantity is
// reversed — WAC is not un-computed, since later purchases/sales may have already layered
// on top of it and there's no way to unwind that retroactively (same limitation every
// real inventory system has for void-after-later-activity).
function computeVoidPOChanges(po, ingMap) {
  const ingUpdates = {}
  const movements = []
  for (const item of po.po_items||[]) {
    const ing = ingMap[item.ingredient_id]
    if (!ing || ing.track_stock === false) continue
    const qtyBase = toBaseUnit(ing, parseFloat(item.qty), item.unit)
    const newStock = Math.max(0, (parseFloat(ing.stock)||0) - qtyBase)
    ingUpdates[ing.id] = { stock:newStock }
    movements.push({
      id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
      type:"Purchase", ingredient_id:ing.id, ingredient_name:ing.name,
      qty:-qtyBase, unit:ing.unit, ref:po.id,
      note:`Void ${po.id}: reversed ${item.qty} ${item.unit}`,
      date:new Date().toISOString().slice(0,10),
      time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
    })
    ingMap[ing.id] = { ...ing, stock:newStock }
  }
  return { ingUpdates, movements }
}

export default function InvPO() {
  const [pos,         setPOs]         = useState([])
  const [ingredients, setIngredients] = useState([])
  const [suppliers,   setSuppliers]   = useState([])
  const [filter,      setFilter]      = useState("all")
  const [viewModal,   setViewModal]   = useState(null)
  const [editModal,   setEditModal]   = useState(null)
  const [newPO,       setNewPO]       = useState(false)
  const [selected,    setSelected]    = useState(new Set())
  const [poForm,      setPOForm]      = useState({ supplier_id:"", invoice_no:"", order_date:new Date().toISOString().slice(0,10), due_date:"", notes:"" })
  const [poItems,     setPOItems]     = useState([{ ingredient_id:"", qty:"", unit:"gr", total_cost:"", unit_cost:"" }])
  const [saving,      setSaving]      = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [openMenu,    setOpenMenu]    = useState(null)
  const [bayarConfirm,setBayarConfirm]= useState(null)
  const [coaAccounts, setCoaAccounts] = useState([])
  const [payForm,     setPayForm]     = useState({
    payment_account_id: "",
    payment_account_name: "",
    transaction_type: "no_ref",
    transaction_date: new Date().toISOString().slice(0,10),
    transaction_no: "",
    notes: ""
  })
  const [payLines,    setPayLines]    = useState([])
  const [unitsList,   setUnitsList]   = useState(UNITS_FALLBACK)
  const today = new Date().toISOString().slice(0,10)
  const [range,        setRange]        = useState("month")
  const [customDate,   setCustomDate]   = useState(today)
  const [customDateTo, setCustomDateTo] = useState(today)

  useEffect(() => { load() }, [range, customDate, customDateTo])
  useEffect(() => {
    if (!openMenu) return
    const handler = () => setOpenMenu(null)
    document.addEventListener("click", handler)
    return () => document.removeEventListener("click", handler)
  }, [openMenu])
  useEffect(() => {
    supabase.from("app_settings").select("units").eq("id","main").maybeSingle()
      .then(({data}) => { if (data?.units?.length) setUnitsList(data.units.map(u=>u.name)) })
  }, [])

  async function load() {
    setLoading(true)
    const { fromStr, toStr } = buildDateRange(range, customDate, customDateTo)
    const fromDate = fromStr.slice(0, 10)
    const toDate   = (toStr || new Date().toISOString()).slice(0, 10)
    const [{ data:p }, { data:i }, { data:s }] = await Promise.all([
      supabase.from("purchase_orders").select("*").gte("date", fromDate).lte("date", toDate).order("created_at", { ascending:false }),
      supabase.from("ingredients").select("*"),
      supabase.from("suppliers").select("*").eq("active", true),
    ])
    const posNorm = (p||[]).map(po => ({
      ...po,
      supplier_name: po.supplierName || po.supplier_name || "",
      supplier_id:   po.supplierId   || po.supplier_id   || "",
      invoice_no:    po.invoiceNo    || po.invoice_no    || "",
      order_date:    po.date         || po.order_date    || "",
      due_date:      po.dueDate      || po.due_date      || "",
      po_items:      po.items        || po.po_items      || [],
    }))
    setPOs(posNorm); setIngredients(i||[]); setSuppliers(s||[])
    setLoading(false)
  }

  // Ingredient costs can be corrected elsewhere (e.g. the Ingredients tab) while a PO
  // form is already open — refetch just the ingredient list so the price-outlier check
  // in submitPO() compares against current data, without resetting the form itself.
  async function reloadIngredients() {
    const { data } = await supabase.from("ingredients").select("*")
    setIngredients(data || [])
  }

  const unpaid  = pos.filter(p => p.status==="Unpaid")
  const paid    = pos.filter(p => p.status==="Paid")
  const overdue = pos.filter(p => p.status==="Unpaid" && p.due_date && new Date(p.due_date)<new Date())
  const voided  = pos.filter(p => p.status==="Void")
  const filtered = filter==="all" ? pos : filter==="unpaid" ? unpaid : filter==="paid" ? paid : filter==="overdue" ? overdue : voided

  const selectedUnpaid = [...selected].filter(id => pos.find(p=>p.id===id&&p.status==="Unpaid"))
  const allFilteredUnpaid = filtered.filter(p=>p.status==="Unpaid")
  const allUnpaidSelected = allFilteredUnpaid.length > 0 && allFilteredUnpaid.every(p=>selected.has(p.id))

  function toggleSelect(id) {
    setSelected(prev => { const s=new Set(prev); s.has(id)?s.delete(id):s.add(id); return s })
  }
  function toggleSelectAll() {
    if (allUnpaidSelected) setSelected(prev => { const s=new Set(prev); allFilteredUnpaid.forEach(p=>s.delete(p.id)); return s })
    else setSelected(prev => { const s=new Set(prev); allFilteredUnpaid.forEach(p=>s.add(p.id)); return s })
  }

  async function bulkMarkPaid() {
    const targets = pos.filter(p => selected.has(p.id) && p.status==="Unpaid")
    if (!targets.length) return
    if (!confirm(`Mark ${targets.length} PO(s) as paid?`)) return
    setBulkLoading(true)
    const { data: freshIngs } = await supabase.from("ingredients").select("*")
    const ingMap = {}
    for (const i of freshIngs||[]) ingMap[i.id] = i
    const ingUpdates = {}
    const movements = []
    const allUpdatedIds = []
    for (const po of targets) {
      const changes = computePaidPOChanges(po, ingMap)
      Object.assign(ingUpdates, changes.ingUpdates)
      movements.push(...changes.movements)
      allUpdatedIds.push(...changes.updatedIngIds)
    }
    await Promise.all([
      persistPaidPOChanges(ingUpdates, movements),
      supabase.from("purchase_orders").update({ status:"Paid" }).in("id", targets.map(p=>p.id)),
    ])
    if (allUpdatedIds.length) await cascadeRecalc([...new Set(allUpdatedIds)])
    setSelected(new Set())
    await load()
    setBulkLoading(false)
    alert(`✅ ${targets.length} PO(s) marked paid. WAC + COGS updated.`)
  }

  async function bulkVoid() {
    const targets = pos.filter(p => selected.has(p.id) && p.status==="Unpaid")
    if (!targets.length) return
    if (!confirm(`Void ${targets.length} PO(s)?`)) return
    setBulkLoading(true)
    await supabase.from("purchase_orders").update({ status:"Void" }).in("id", targets.map(p=>p.id))
    setSelected(new Set())
    await load()
    setBulkLoading(false)
  }

  async function loadCoa() {
    const { data } = await supabase.from("chart_of_accounts")
      .select("*")
      .eq("is_active", true)
      .in("category", ["Kas & Bank", "Ayat Silang"])
      .order("sort_order")
    setCoaAccounts(data || [])
  }

  async function genTransactionNo() {
    const today = new Date()
    const yy = String(today.getFullYear()).slice(2)
    const mm = String(today.getMonth()+1).padStart(2,"0")
    const dd = String(today.getDate()).padStart(2,"0")
    const prefix = `PFA/${yy}${mm}${dd}/`
    const { data } = await supabase.from("invoice_payments")
      .select("transaction_no")
      .like("transaction_no", prefix+"%")
      .order("transaction_no", { ascending:false })
      .limit(1)
    const last = data?.[0]?.transaction_no
    const seq = last ? parseInt(last.split("/").pop()) + 1 : 1
    return prefix + String(seq).padStart(4,"0")
  }

  async function openBayarFaktur(po) {
    await loadCoa()
    const txNo = await genTransactionNo()
    setPayForm({
      payment_account_id: "",
      payment_account_name: "",
      transaction_type: "no_ref",
      transaction_date: new Date().toISOString().slice(0,10),
      transaction_no: txNo,
      notes: ""
    })
    setPayLines([{
      po_id: po.id,
      invoice_no: po.invoice_no || po.id?.slice(0,12) || "—",
      due_date: po.due_date || "—",
      billed: po.total || 0,
      discount: 0,
      payment: 0,
      po_ref: po
    }])
    setBayarConfirm(po)
  }

  async function submitBayar() {
    if (!payForm.payment_account_id) { alert("Pilih Jenis Pembayaran terlebih dahulu"); return }
    const totalPaid = payLines.reduce((a,l)=>a+(parseFloat(l.payment)||0),0)
    if (totalPaid <= 0) { alert("Jumlah pembayaran harus lebih dari 0"); return }
    setSaving(true)
    try {
      const { data: freshIngs } = await supabase.from("ingredients").select("*")
      const ingMap = {}
      for (const i of freshIngs||[]) ingMap[i.id] = i
      const ingUpdates = {}
      const movements = []
      const allUpdatedIds = []
      const poStatusUpdates = []
      for (const line of payLines) {
        const paid = parseFloat(line.payment) || 0
        const billed = parseFloat(line.billed) || 0
        const newStatus = paid >= billed ? "Paid" : paid > 0 ? "Partial" : "Unpaid"
        if (paid > 0) {
          const changes = computePaidPOChanges(line.po_ref, ingMap)
          Object.assign(ingUpdates, changes.ingUpdates)
          movements.push(...changes.movements)
          allUpdatedIds.push(...changes.updatedIngIds)
          poStatusUpdates.push({ id: line.po_id, payload: {
            status: newStatus,
            paid_at: new Date().toISOString(),
            paid_amount: paid,
            discount_amount: parseFloat(line.discount)||0
          }})
        }
      }
      await Promise.all([
        persistPaidPOChanges(ingUpdates, movements),
        ...poStatusUpdates.map(u => supabase.from("purchase_orders").update(u.payload).eq("id", u.id)),
      ])
      if (allUpdatedIds.length) await cascadeRecalc([...new Set(allUpdatedIds)])
      await supabase.from("invoice_payments").insert({
        transaction_no: payForm.transaction_no,
        outlet: "PawonLoka",
        payment_account_id: payForm.payment_account_id,
        payment_account_name: payForm.payment_account_name,
        transaction_type: payForm.transaction_type,
        transaction_date: payForm.transaction_date,
        invoices: payLines.map(l=>({ po_id:l.po_id, invoice_no:l.invoice_no, billed:l.billed, discount:l.discount, payment:l.payment })),
        total_billed: payLines.reduce((a,l)=>a+(parseFloat(l.billed)||0),0),
        total_discount: payLines.reduce((a,l)=>a+(parseFloat(l.discount)||0),0),
        total_paid: totalPaid,
        notes: payForm.notes
      })
      await load()
      setBayarConfirm(null)
      alert("Pembayaran berhasil disimpan")
    } catch(e) {
      alert("Error: " + e.message)
    }
    setSaving(false)
  }

  async function markPaid(po) {
    if (!confirm(`Mark ${po.id} as paid?`)) return
    const { data: freshIngs } = await supabase.from("ingredients").select("*")
    const ingMap = {}
    for (const i of freshIngs||[]) ingMap[i.id] = i
    const { updatedIngIds, ingUpdates, movements } = computePaidPOChanges(po, ingMap)
    await Promise.all([
      persistPaidPOChanges(ingUpdates, movements),
      supabase.from("purchase_orders").update({ status:"Paid" }).eq("id", po.id),
    ])
    if (updatedIngIds.length) await cascadeRecalc(updatedIngIds)
    await load(); setViewModal(null)
    alert(`✅ Paid. WAC + COGS updated.`)
  }

  async function voidPO(po) {
    if (po.status === "Paid") {
      if (!confirm(`Void ${po.id}? Stock quantity received will be reversed. WAC/cost will NOT be recalculated retroactively.`)) return
      const { data: freshIngs } = await supabase.from("ingredients").select("*")
      const ingMap = {}
      for (const i of freshIngs||[]) ingMap[i.id] = i
      const { ingUpdates, movements } = computeVoidPOChanges(po, ingMap)
      await Promise.all([
        persistPaidPOChanges(ingUpdates, movements),
        supabase.from("purchase_orders").update({ status:"Void" }).eq("id", po.id),
      ])
    } else {
      if (!confirm(`Void ${po.id}?`)) return
      await supabase.from("purchase_orders").update({ status:"Void" }).eq("id", po.id)
    }
    await load(); setViewModal(null)
  }

  async function bulkDelete() {
    const targets = pos.filter(p => selected.has(p.id) && p.status==="Unpaid")
    if (!targets.length) return
    if (!confirm(`Hapus ${targets.length} PO yang dipilih? Tindakan ini tidak dapat dibatalkan.`)) return
    setBulkLoading(true)
    await supabase.from("purchase_orders").delete().in("id", targets.map(p=>p.id))
    setSelected(new Set())
    await load()
    setBulkLoading(false)
  }

  async function deletePO(po) {
    if (!confirm(`Hapus PO ini? Tindakan ini tidak dapat dibatalkan.`)) return
    await supabase.from("purchase_orders").delete().eq("id", po.id)
    await load(); setViewModal(null)
  }

  function addPOItem()     { setPOItems(items => [...items, { ingredient_id:"", qty:"", unit:"gr", total_cost:"", unit_cost:"" }]) }
  function removePOItem(i) { setPOItems(items => items.filter((_,idx)=>idx!==i)) }
  function updatePOItem(i,k,v) {
    setPOItems(items => items.map((x,idx) => {
      if (idx!==i) return x
      const updated = {...x,[k]:v}
      if (k==="ingredient_id") {
        const ing = ingredients.find(ing=>ing.id===v)
        if (ing) { updated.unit=biggestUnit(ing) }
      }
      const qty   = parseFloat(updated.qty)        || 0
      const total = parseFloat(updated.total_cost) || 0
      updated.unit_cost = qty > 0 && total > 0 ? String(total / qty) : ""
      return updated
    }))
  }
  function getUnits(ingId) {
    const ing = ingredients.find(i=>i.id===ingId)
    if (!ing) return unitsList
    return [ing.unit, ...(ing.conversions||[]).map(c=>c.unit).filter(u=>u!==ing.unit)]
  }
  const grandTotal = poItems.reduce((a,item) => a+(parseFloat(item.total_cost)||0), 0)

  async function submitPO(isEdit=false) {
    const sup = suppliers.find(s=>s.id===poForm.supplier_id)
    if (!sup) { alert("Select a supplier"); return }
    const validItems = poItems.filter(i=>i.ingredient_id&&parseFloat(i.qty)>0)
    if (!validItems.length) { alert("Add at least one item"); return }
    if (validItems.some(i => (parseFloat(i.total_cost)||0) <= 0)) {
      alert("Every item needs a positive total cost"); return
    }
    // Catch fat-finger entries (wrong zero count, decimal slip, etc.) before they poison
    // this ingredient's WAC — compare against its existing cost, priced on the same unit basis.
    for (const item of validItems) {
      const ing = ingredients.find(i => i.id === item.ingredient_id)
      if (!ing || !ing.cost_per_unit) continue
      const qty = parseFloat(item.qty) || 0
      const unitCost = qty > 0 ? (parseFloat(item.total_cost)||0) / qty : 0
      const refUnitCost = ing.cost_per_unit * toBaseUnit(ing, 1, item.unit)
      if (refUnitCost <= 0) continue
      const ratio = unitCost / refUnitCost
      // Extreme deviations are almost always the WRONG UNIT selected (e.g. the "kg" the unit
      // dropdown defaults to, when the purchase was really gr/pcs) rather than a real price
      // swing — this is exactly how Timun/Wortel/Bumbu Racik's cost_per_unit got poisoned by
      // 500kg/20kg entries that were actually 500gr/20pcs. Block outright instead of a
      // dismissible confirm() that's easy to click through without noticing the mistake.
      if (ratio > 20 || ratio < 0.05) {
        alert(
          `${ing.name}: harga ${fmt(unitCost)}/${item.unit} sangat jauh berbeda dari harga ` +
          `biasanya (~${fmt(refUnitCost)}/${item.unit}). Cek lagi unit yang dipilih (${item.unit}) — ` +
          `kemungkinan besar salah unit (misal "kg" padahal maksudnya "gr" atau "pcs").`
        )
        return
      }
      if (ratio > 5 || ratio < 0.2) {
        const ok = confirm(
          `${ing.name}: harga ${fmt(unitCost)}/${item.unit} jauh berbeda dari harga biasanya ` +
          `(~${fmt(refUnitCost)}/${item.unit}). Lanjutkan?`
        )
        if (!ok) return
      }
    }
    setSaving(true)
    const poItems_json = validItems.map(item => {
      const ing = ingredients.find(i=>i.id===item.ingredient_id)
      const qty        = parseFloat(item.qty)        || 0
      const total_cost = parseFloat(item.total_cost) || 0
      const unit_cost  = qty > 0 ? total_cost / qty : 0
      return { ingredient_id:item.ingredient_id, name:ing?.name||"", qty, unit:item.unit, unit_cost, total_cost }
    })
    const payload = {
      supplierId:sup.id, supplierName:sup.name,
      invoiceNo:poForm.invoice_no, date:poForm.order_date,
      dueDate:poForm.due_date||null, notes:poForm.notes||null,
      status:"Unpaid", subtotal:grandTotal, total:grandTotal, items:poItems_json
    }
    if (isEdit) {
      await supabase.from("purchase_orders").update(payload).eq("id", editModal.id)
    } else {
      await supabase.from("purchase_orders").insert({ id:"PO-"+Date.now(), ...payload })
    }
    await load()
    setNewPO(false); setEditModal(null)
    setPOForm({ supplier_id:"", invoice_no:"", order_date:new Date().toISOString().slice(0,10), due_date:"", notes:"" })
    setPOItems([{ ingredient_id:"", qty:"", unit:"gr", total_cost:"", unit_cost:"" }])
    setSaving(false)
  }

  function openEdit(po) {
    setPOForm({ supplier_id:po.supplier_id||"", invoice_no:po.invoice_no||"", order_date:po.order_date||"", due_date:po.due_date||"", notes:po.notes||"" })
    setPOItems((po.po_items||[]).map(i=>{
      const qty       = parseFloat(i.qty)       || 0
      const unit_cost = parseFloat(i.unit_cost) || 0
      const total_cost = i.total_cost != null ? parseFloat(i.total_cost) : qty * unit_cost
      return { ingredient_id:i.ingredient_id, qty:String(i.qty), unit:i.unit, total_cost:String(total_cost), unit_cost:String(unit_cost) }
    }))
    setEditModal(po)
  }


  return (
    <div>
      <DateRangePicker
        range={range} setRange={setRange}
        customDate={customDate} setCustomDate={setCustomDate}
        customDateTo={customDateTo} setCustomDateTo={setCustomDateTo}
        loading={loading} onRefresh={load}
      />

      <div className="bo-metrics" style={{ gridTemplateColumns:"repeat(5,1fr)", marginBottom:16 }}>
        <div className="bo-met blue"><div className="bo-met-label">Faktur Pembelian</div><div className="bo-met-val">{fmt(pos.reduce((a,p)=>a+(p.total||0),0))}</div><div className="bo-met-sub">{pos.length} faktur</div></div>
        <div className="bo-met amber"><div className="bo-met-label">Belum Dibayar</div><div className="bo-met-val">{fmt(unpaid.reduce((a,p)=>a+(p.total||0),0))}</div><div className="bo-met-sub">{unpaid.length} faktur</div></div>
        <div className="bo-met green"><div className="bo-met-label">Sudah Dibayar</div><div className="bo-met-val">{fmt(paid.reduce((a,p)=>a+(p.total||0),0))}</div><div className="bo-met-sub">{paid.length} faktur</div></div>
        <div className="bo-met red"><div className="bo-met-label">Jatuh Tempo</div><div className="bo-met-val">{fmt(overdue.reduce((a,p)=>a+(p.total||0),0))}</div><div className="bo-met-sub">{overdue.length} faktur</div></div>
        <div className="bo-met" style={{ borderTop:"3px solid #DE350B" }}><div className="bo-met-label">Void</div><div className="bo-met-val">{fmt(voided.reduce((a,p)=>a+(p.total||0),0))}</div><div className="bo-met-sub">{voided.length} faktur</div></div>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {[["all",`Semua (${pos.length})`],["unpaid",`Belum Lunas (${unpaid.length})`],["paid",`Lunas (${paid.length})`],["overdue",`Jatuh Tempo (${overdue.length})`],["voided",`Void (${voided.length})`]].map(([f,l])=>(
            <button key={f} onClick={()=>setFilter(f)} className={"bo-btn bo-btn-sm "+(filter===f?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          {selectedUnpaid.length > 0 && <>
            <span style={{ fontSize:12, color:"var(--ink4)" }}>{selectedUnpaid.length} selected</span>
            <button onClick={bulkMarkPaid} disabled={bulkLoading} className="bo-btn bo-btn-sm" style={{ background:"var(--green-lt)", color:"var(--green)", border:"none", cursor:"pointer", borderRadius:"var(--r)", padding:"5px 11px", fontSize:12, fontWeight:600 }}>
              {bulkLoading?"Memproses...":"Bayar Terpilih"}
            </button>
            <button onClick={bulkVoid} disabled={bulkLoading} className="bo-btn bo-btn-danger bo-btn-sm">Void Terpilih</button>
            <button onClick={bulkDelete} disabled={bulkLoading} className="bo-btn bo-btn-sm" style={{ background:"#FFEBE6", color:"#DE350B", border:"none", borderRadius:"var(--r)", padding:"5px 11px", fontSize:12, fontWeight:600 }}>Hapus Terpilih</button>
          </>}
          <button onClick={()=>setNewPO(true)} className="bo-btn bo-btn-primary">+ New PO</button>
        </div>
      </div>

      <div className="bo-card" style={{ padding:0, overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
          <table className="bo-table">
            <thead>
              <tr>
                <th style={{ width:36 }}>
                  <input type="checkbox" checked={allUnpaidSelected} onChange={toggleSelectAll} style={{ width:15, height:15, accentColor:"var(--brand)", cursor:"pointer" }} />
                </th>
                <th>TANGGAL</th><th>NAMA PEMASOK</th><th>NO FAKTUR</th><th>JENIS PEMBELIAN</th><th>PRODUK</th><th>JUMLAH</th><th>JATUH TEMPO</th><th>STATUS</th><th style={{ width:48 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(po => {
                const isOverdue = po.status==="Unpaid" && po.due_date && new Date(po.due_date)<new Date()
                const isUnpaid = po.status==="Unpaid"
                const statusLabel = po.status==="Paid" ? "Lunas" : po.status==="Void" ? "Void" : isOverdue ? "Jatuh Tempo" : "Belum Lunas"
                const statusColor = po.status==="Paid" ? "#00875A" : po.status==="Void" ? "#97A0AF" : isOverdue ? "#DE350B" : "#FF8B00"
                const items = po.po_items || []
                const itemNames = items.slice(0,2).map(i=>i.name).filter(Boolean)
                const extraCount = items.length - 2
                return (
                  <tr key={po.id} style={{ background:selected.has(po.id)?"var(--brand-lt)":"", position:"relative" }}>
                    <td>{isUnpaid && <input type="checkbox" checked={selected.has(po.id)} onChange={()=>toggleSelect(po.id)} style={{ width:15, height:15, accentColor:"var(--brand)", cursor:"pointer" }} />}</td>
                    <td style={{ fontSize:12 }}>{po.order_date ? new Date(po.order_date).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}) : "—"}</td>
                    <td style={{ fontWeight:600 }}>{po.supplier_name || "Tanpa Pemasok"}</td>
                    <td style={{ fontSize:12, fontFamily:"monospace", color:"var(--ink4)" }}>{po.invoice_no || po.id?.slice(0,12) || "—"}</td>
                    <td style={{ fontSize:12 }}>{"Barang Jual"}</td>
                    <td style={{ fontSize:12 }}>
                      {itemNames.map((n,i)=><div key={i}>{n}</div>)}
                      {extraCount>0 && <div style={{ color:"var(--brand)", fontSize:11, fontWeight:600 }}>+{extraCount} Produk</div>}
                      {itemNames.length===0 && <span style={{ color:"var(--ink5)" }}>—</span>}
                    </td>
                    <td style={{ fontWeight:700, color:"var(--brand)" }}>{fmt(po.total)}</td>
                    <td style={{ fontSize:12, color:isOverdue?"#DE350B":"var(--ink4)" }}>{po.due_date ? new Date(po.due_date).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}) : "—"}</td>
                    <td>
                      <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:10, background:statusColor+"22", color:statusColor, whiteSpace:"nowrap" }}>
                        {statusLabel}
                      </span>
                    </td>
                    <td style={{ position:"relative" }}>
                      <button
                        onClick={e=>{e.stopPropagation(); setOpenMenu(prev=>prev===po.id?null:po.id)}}
                        className="bo-btn bo-btn-ghost bo-btn-sm"
                        style={{ padding:"4px 10px", fontWeight:700, fontSize:15, letterSpacing:1 }}
                      >...</button>
                      {openMenu===po.id && (
                        <div onClick={e=>e.stopPropagation()} style={{ position:"fixed", right:16, background:"#fff", border:"1px solid #E8ECF0", borderRadius:10, boxShadow:"0 4px 20px rgba(0,0,0,0.15)", zIndex:9999, minWidth:180, padding:"6px 0" }}>
                          <button onClick={()=>{setOpenMenu(null);setViewModal(po)}} style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 16px", fontSize:13, background:"none", border:"none", cursor:"pointer", color:"var(--ink1)" }}>Detail</button>
                          {isUnpaid && <button onClick={()=>{setOpenMenu(null);openBayarFaktur(po)}} style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 16px", fontSize:13, background:"none", border:"none", cursor:"pointer", color:"var(--ink1)" }}>Bayar Faktur</button>}
                          {isUnpaid && <button onClick={()=>{setOpenMenu(null);openEdit(po)}} style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 16px", fontSize:13, background:"none", border:"none", cursor:"pointer", color:"var(--ink1)" }}>Edit</button>}
                          <div style={{ height:1, background:"#F0F4F8", margin:"4px 0" }} />
                          {isUnpaid && <button onClick={()=>{setOpenMenu(null);deletePO(po)}} style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 16px", fontSize:13, background:"none", border:"none", cursor:"pointer", color:"#DE350B" }}>Hapus</button>}
                          {isUnpaid && <button onClick={()=>{setOpenMenu(null);voidPO(po)}} style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 16px", fontSize:13, background:"none", border:"none", cursor:"pointer", color:"#97A0AF" }}>Void</button>}
                          {po.status==="Paid" && <button onClick={()=>{setOpenMenu(null);voidPO(po)}} style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 16px", fontSize:13, background:"none", border:"none", cursor:"pointer", color:"#DE350B" }}>Void</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filtered.length===0 && <tr><td colSpan={10} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>Tidak ada faktur pembelian</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {viewModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setViewModal(null)}>
          <div className="bo-modal" style={{ maxWidth:600 }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">{viewModal.id}</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>{viewModal.invoice_no} · {viewModal.supplier_name}</div>
              </div>
              <button className="bo-modal-close" onClick={()=>setViewModal(null)}>✕</button>
            </div>
            <div className="bo-modal-body">
              <table className="bo-table">
                <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Unit Cost</th><th>Total</th></tr></thead>
                <tbody>
                  {(viewModal.po_items||[]).map((item,i) => (
                    <tr key={i}>
                      <td>{item.name}</td><td>{item.qty}</td><td>{item.unit}</td>
                      <td>{fmt(item.unit_cost)}</td>
                      <td style={{ fontWeight:700, color:"var(--brand)" }}>{fmt(item.total_cost)}</td>
                    </tr>
                  ))}
                  <tr style={{ background:"var(--surface)" }}>
                    <td colSpan={4} style={{ fontWeight:700 }}>Total</td>
                    <td style={{ fontWeight:900, fontSize:15, color:"var(--brand)" }}>{fmt(viewModal.total)}</td>
                  </tr>
                </tbody>
              </table>
              {viewModal.notes && <div style={{ marginTop:12, padding:10, background:"var(--surface)", borderRadius:"var(--r)", fontSize:13 }}>{viewModal.notes}</div>}
              <div style={{ marginTop:12, padding:"10px 14px", background:viewModal.status==="Paid"?"var(--green-lt)":"var(--amber-lt)", borderRadius:"var(--r)", fontSize:12, fontWeight:700, color:viewModal.status==="Paid"?"var(--green)":"var(--amber)" }}>
                {viewModal.status==="Paid" ? "✅ Paid — WAC + COGS updated" : "⏳ Payment pending"}
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setViewModal(null)} className="bo-btn bo-btn-ghost">Close</button>
              {viewModal.status==="Unpaid" && <>
                <button onClick={()=>{setViewModal(null);openEdit(viewModal)}} className="bo-btn bo-btn-ghost">Edit</button>
                <button onClick={()=>deletePO(viewModal)} className="bo-btn bo-btn-danger">Delete</button>
                <button onClick={()=>markPaid(viewModal)} className="bo-btn bo-btn-primary">✓ Mark as Paid</button>
              </>}
              {viewModal.status==="Paid" && (
                <button onClick={()=>{ voidPO(viewModal); setViewModal(null) }} className="bo-btn bo-btn-danger">Void PO</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bayar Faktur Modal */}
      {bayarConfirm && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setBayarConfirm(null)}>
          <div className="bo-modal" style={{ maxWidth:900, maxHeight:"94vh", display:"flex", flexDirection:"column", width:"92vw" }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">Bayar Faktur</div>
              <button className="bo-modal-close" onClick={()=>setBayarConfirm(null)}>x</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto", flex:1 }}>

              {/* Section 1: Informasi Pembayaran */}
              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:"18px 20px", marginBottom:16 }}>
                <div style={{ fontSize:14, fontWeight:800, color:"var(--ink1)", marginBottom:16 }}>Informasi Pembayaran Faktur</div>
                <div style={{ display:"grid", gridTemplateColumns:"130px 1fr", gap:"10px 14px", alignItems:"start" }}>

                  <label style={{ fontSize:13, fontWeight:600, paddingTop:8 }}>Pilih Outlet</label>
                  <input className="bo-input" value="PawonLoka" disabled style={{ background:"#F4F5F7" }} />

                  <label style={{ fontSize:13, fontWeight:600, paddingTop:8 }}>Jenis Pembayaran <span style={{ color:"red" }}>*</span></label>
                  <select className="bo-select"
                    value={payForm.payment_account_id}
                    onChange={e=>{
                      const acct = coaAccounts.find(a=>a.id===e.target.value)
                      setPayForm(f=>({...f, payment_account_id:e.target.value, payment_account_name:acct?`${acct.code} - ${acct.name}`:""}))
                    }}
                    style={{ borderColor: !payForm.payment_account_id ? "var(--brand)" : "" }}
                  >
                    <option value="">Pilih</option>
                    {coaAccounts.map(a=>(
                      <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                    ))}
                  </select>

                  <label style={{ fontSize:13, fontWeight:600, paddingTop:8 }}>Jenis Transaksi</label>
                  <div style={{ display:"flex", gap:10 }}>
                    {[["stock_order","Pemesanan Stok"],["no_ref","Tanpa Nomor Referensi"]].map(([v,l])=>(
                      <label key={v} onClick={()=>setPayForm(f=>({...f,transaction_type:v}))}
                        style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:8,
                          border:`1.5px solid ${payForm.transaction_type===v?"var(--brand)":"#DFE1E6"}`,
                          cursor:"pointer", fontSize:13 }}>
                        <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${payForm.transaction_type===v?"var(--brand)":"#DFE1E6"}`,
                          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          {payForm.transaction_type===v && <div style={{ width:8, height:8, borderRadius:"50%", background:"var(--brand)" }} />}
                        </div>
                        {l}
                      </label>
                    ))}
                  </div>

                  <label style={{ fontSize:13, fontWeight:600, paddingTop:8 }}>Tanggal Transaksi</label>
                  <input type="date" className="bo-input" value={payForm.transaction_date}
                    onChange={e=>setPayForm(f=>({...f,transaction_date:e.target.value}))} />

                  <label style={{ fontSize:13, fontWeight:600, paddingTop:8 }}>No Transaksi</label>
                  <div>
                    <input className="bo-input" value={payForm.transaction_no}
                      onChange={e=>setPayForm(f=>({...f,transaction_no:e.target.value}))}
                      placeholder="Contoh: PFA/260601/0001" />
                    <div style={{ fontSize:11, color:"var(--ink5)", marginTop:4 }}>Nomor transaksi akan terisi otomatis jika dikosongkan</div>
                  </div>

                </div>
              </div>

              {/* Section 2: Daftar Pembelian */}
              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:"18px 20px", marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:"var(--ink1)" }}>Daftar Pembelian</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button
                      onClick={()=>setPayLines(prev=>prev.map(l=>({...l,discount:0,payment:l.billed})))}
                      className="bo-btn bo-btn-ghost bo-btn-sm">Bayar Semua</button>
                    <button
                      onClick={()=>{
                        const remaining = pos.filter(p=>p.status==="Unpaid"&&!payLines.find(l=>l.po_id===p.id))
                        if(remaining.length===0){alert("Tidak ada faktur lain yang belum dibayar");return}
                        const first = remaining[0]
                        setPayLines(prev=>[...prev,{po_id:first.id,invoice_no:first.invoice_no||first.id?.slice(0,12)||"—",due_date:first.due_date||"—",billed:first.total||0,discount:0,payment:0,po_ref:first}])
                      }}
                      className="bo-btn bo-btn-primary bo-btn-sm">+ Faktur Pembelian</button>
                  </div>
                </div>
                <div>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                      <tr style={{ background:"#F8FAFC" }}>
                        {["TANGGAL PEMBELIAN","NO FAKTUR","JATUH TEMPO","TAGIHAN","POTONGAN","PEMBAYARAN",""].map(h=>(
                          <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontSize:11, fontWeight:700, color:"var(--ink4)", borderBottom:"1px solid #E8ECF0", whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payLines.map((line,i)=>(
                        <tr key={i} style={{ borderBottom:"1px solid #F0F4F8" }}>
                          <td style={{ padding:"10px 12px", fontSize:12 }}>
                            {line.po_ref?.order_date ? new Date(line.po_ref.order_date).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}) : "—"}
                          </td>
                          <td style={{ padding:"10px 12px", fontSize:12, fontFamily:"monospace", whiteSpace:"nowrap" }}>{line.invoice_no}</td>
                          <td style={{ padding:"10px 12px", fontSize:12 }}>{line.due_date && line.due_date!=="—" ? new Date(line.due_date).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}) : "—"}</td>
                          <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, whiteSpace:"nowrap" }}>Rp {Number(line.billed).toLocaleString("id-ID")}</td>
                          <td style={{ padding:"10px 12px" }}>
                            <input type="text" className="bo-input" style={{ width:"100%", fontSize:13 }}
                              value={line.discount ? "Rp " + Number(line.discount).toLocaleString("id-ID") : ""}
                              placeholder="Rp 0"
                              onChange={e=>{
                                const raw = e.target.value.replace(/[^0-9]/g,"")
                                const d = parseFloat(raw)||0
                                setPayLines(prev=>prev.map((l,j)=>j===i?{...l,discount:d,payment:Math.max(0,l.billed-d)}:l))
                              }} />
                          </td>
                          <td style={{ padding:"10px 12px" }}>
                            <input type="text" className="bo-input" style={{ width:"100%", fontSize:13 }}
                              value={line.payment ? "Rp " + Number(line.payment).toLocaleString("id-ID") : ""}
                              placeholder="Rp 0"
                              onChange={e=>{
                                const raw = e.target.value.replace(/[^0-9]/g,"")
                                setPayLines(prev=>prev.map((l,j)=>j===i?{...l,payment:parseFloat(raw)||0}:l))
                              }} />
                          </td>
                          <td style={{ padding:"10px 12px" }}>
                            {payLines.length > 1 && (
                              <button onClick={()=>setPayLines(prev=>prev.filter((_,j)=>j!==i))}
                                style={{ background:"none", border:"none", cursor:"pointer", color:"#DE350B", fontSize:16 }}>x</button>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background:"#F8FAFC", fontWeight:700 }}>
                        <td colSpan={3} style={{ padding:"10px 12px", fontSize:13 }}>Total</td>
                        <td style={{ padding:"10px 12px", fontSize:13, fontWeight:800, whiteSpace:"nowrap" }}>Rp {payLines.reduce((a,l)=>a+(parseFloat(l.billed)||0),0).toLocaleString("id-ID")}</td>
                        <td style={{ padding:"10px 12px", fontSize:13, whiteSpace:"nowrap" }}>Rp {payLines.reduce((a,l)=>a+(parseFloat(l.discount)||0),0).toLocaleString("id-ID")}</td>
                        <td style={{ padding:"10px 12px", fontSize:13, fontWeight:800, color:"var(--brand)" }}>
                          Rp {payLines.reduce((a,l)=>a+(parseFloat(l.payment)||0),0).toLocaleString("id-ID")}
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes */}
              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:"16px 20px" }}>
                <label className="bo-label">Keterangan</label>
                <textarea className="bo-input" rows={2} value={payForm.notes}
                  onChange={e=>setPayForm(f=>({...f,notes:e.target.value}))}
                  placeholder="Catatan pembayaran..." />
              </div>

            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setBayarConfirm(null)} className="bo-btn bo-btn-ghost">Batal</button>
              <button onClick={submitBayar} disabled={saving} className="bo-btn bo-btn-primary">
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {newPO && <POFormModal title="Create Purchase Order" onSubmit={()=>submitPO(false)} onClose={()=>{setNewPO(false);setPOItems([{ingredient_id:"",qty:"",unit:"gr",total_cost:"",unit_cost:""}])}} suppliers={suppliers} ingredients={ingredients} onRefreshIngredients={reloadIngredients} poForm={poForm} setPOForm={setPOForm} poItems={poItems} addPOItem={addPOItem} removePOItem={removePOItem} updatePOItem={updatePOItem} getUnits={getUnits} grandTotal={grandTotal} saving={saving} />}
      {editModal && <POFormModal title="Save Changes" onSubmit={()=>submitPO(true)} onClose={()=>{setEditModal(null);setPOItems([{ingredient_id:"",qty:"",unit:"gr",total_cost:"",unit_cost:""}])}} suppliers={suppliers} ingredients={ingredients} onRefreshIngredients={reloadIngredients} poForm={poForm} setPOForm={setPOForm} poItems={poItems} addPOItem={addPOItem} removePOItem={removePOItem} updatePOItem={updatePOItem} getUnits={getUnits} grandTotal={grandTotal} saving={saving} />}
    </div>
  )
}

function fmt2(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }
function POFormModal({ title, onSubmit, onClose, suppliers, ingredients, onRefreshIngredients, poForm, setPOForm, poItems, addPOItem, removePOItem, updatePOItem, getUnits, grandTotal, saving }) {
  const [refreshingIng, setRefreshingIng] = useState(false)
  const [ingRefreshed,  setIngRefreshed]  = useState(false)
  async function handleRefreshIngredients() {
    setRefreshingIng(true)
    await onRefreshIngredients()
    setRefreshingIng(false)
    setIngRefreshed(true)
    setTimeout(() => setIngRefreshed(false), 2000)
  }
  return (
    <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="bo-modal" style={{ maxWidth:700, maxHeight:"94vh" }}>
        <div className="bo-modal-header">
          <div className="bo-modal-title">{title}</div>
          <button className="bo-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="bo-modal-body" style={{ overflowY:"auto" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
            <div><label className="bo-label">Supplier *</label>
              <SearchSelect
                options={suppliers}
                value={poForm.supplier_id}
                onChange={v=>setPOForm(f=>({...f,supplier_id:v}))}
                placeholder="— Search supplier —"
                labelKey="name" valueKey="id"
              />
            </div>
            <div><label className="bo-label">Invoice No.</label><input value={poForm.invoice_no} onChange={e=>setPOForm(f=>({...f,invoice_no:e.target.value}))} className="bo-input" placeholder="INV/001" /></div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
            <div><label className="bo-label">Order Date</label><input type="date" value={poForm.order_date} onChange={e=>setPOForm(f=>({...f,order_date:e.target.value}))} className="bo-input" /></div>
            <div><label className="bo-label">Due Date</label><input type="date" value={poForm.due_date} onChange={e=>setPOForm(f=>({...f,due_date:e.target.value}))} className="bo-input" /></div>
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <label className="bo-label" style={{ marginBottom:0 }}>Items *</label>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {ingRefreshed && <span style={{ fontSize:11, color:"var(--green,#16A34A)" }}>✓ Harga diperbarui</span>}
                <button onClick={handleRefreshIngredients} disabled={refreshingIng} className="bo-btn bo-btn-ghost bo-btn-sm" title="Muat ulang harga bahan tanpa menutup form ini">
                  {refreshingIng ? "..." : "🔄 Refresh Harga Bahan"}
                </button>
                <button onClick={addPOItem} className="bo-btn bo-btn-ghost bo-btn-sm">+ Add Item</button>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"2fr 80px 100px 130px 130px 36px", gap:6, marginBottom:6 }} className="po-items-header">
              {["INGREDIENT","QTY","UNIT","TOTAL HARGA","HARGA/UNIT",""].map((h,i)=><div key={i} style={{ fontSize:10, fontWeight:700, color:"var(--ink4)" }}>{h}</div>)}
            </div>
            {poItems.map((item,i) => (
              <div key={i} className="po-item-row" style={{ display:"grid", gridTemplateColumns:"2fr 80px 100px 130px 130px 36px", gap:6, marginBottom:8 }}>
                <SearchSelect
                  options={ingredients}
                  value={item.ingredient_id}
                  onChange={v=>updatePOItem(i,"ingredient_id",v)}
                  placeholder="— Search ingredient —"
                  labelKey="name" valueKey="id"
                  renderOption={o=><span>{o.name} <span style={{fontSize:10,color:"var(--ink5)"}}>({o.unit})</span></span>}
                />
                <input type="number" min="0" value={item.qty} onChange={e=>updatePOItem(i,"qty",e.target.value)} className="bo-input" placeholder="0" />
                <select value={item.unit} onChange={e=>updatePOItem(i,"unit",e.target.value)} className="bo-select">
                  {getUnits(item.ingredient_id).map(u=><option key={u}>{u}</option>)}
                </select>
                <input type="number" min="0" value={item.total_cost} onChange={e=>updatePOItem(i,"total_cost",e.target.value)} className="bo-input" placeholder="Total harga" />
                <div style={{ display:"flex", alignItems:"center", padding:"0 10px", background:"#F4F5F7", borderRadius:"var(--r)", fontSize:12, color:"var(--ink3)", fontStyle:"italic", minWidth:0 }}>
                  {item.unit_cost ? fmt2(parseFloat(item.unit_cost)) + "/" + (item.unit||"unit") : "—"}
                </div>
                <button onClick={()=>removePOItem(i)} className="bo-btn bo-btn-danger bo-btn-sm" style={{ padding:"0 10px" }}>✕</button>
              </div>
            ))}
            <div style={{ display:"flex", justifyContent:"space-between", padding:"12px 16px", background:"var(--surface)", borderRadius:"var(--r)", marginTop:8 }}>
              <span style={{ fontWeight:700 }}>Grand Total</span>
              <span style={{ fontSize:18, fontWeight:900, color:"var(--brand)" }}>{fmt2(grandTotal)}</span>
            </div>
          </div>
          <div className="bo-form-row"><label className="bo-label">Notes</label><textarea value={poForm.notes} onChange={e=>setPOForm(f=>({...f,notes:e.target.value}))} className="bo-input" rows={2} /></div>
        </div>
        <div className="bo-modal-footer">
          <button onClick={onClose} className="bo-btn bo-btn-ghost">Cancel</button>
          <button onClick={onSubmit} disabled={saving} className="bo-btn bo-btn-primary">{saving?"Saving...":title}</button>
        </div>
      </div>
    </div>
  )
}
