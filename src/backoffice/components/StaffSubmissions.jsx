import { useState, useEffect, useRef } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }

// Convert a qty expressed in `unit` into the ingredient's own base/stock unit
function toBaseUnit(ing, qty, unit) {
  if (!ing || unit === ing.unit) return qty
  const conv = (ing.conversions||[]).find(c => c.unit === unit)
  if (conv && parseFloat(conv.qty) > 0) return qty * parseFloat(conv.qty)
  const fallbacks = { kg:1000, L:1000, Galon:19000 }
  if (ing.unit==="gr" && fallbacks[unit]) return qty * fallbacks[unit]
  if (ing.unit==="ml" && fallbacks[unit]) return qty * fallbacks[unit]
  return qty
}

// Price for one unit of `unit` (a purchase unit like "kg"/"pack"), given ing.cost_per_unit is priced per ing.unit (base unit)
function unitPriceFor(ing, unit) {
  if (!ing) return 0
  if (unit === ing.unit) return ing.cost_per_unit || 0
  const conv = (ing.conversions||[]).find(c => c.unit === unit)
  if (conv && parseFloat(conv.qty) > 0) return (ing.cost_per_unit||0) * parseFloat(conv.qty)
  const fallbacks = { kg:1000, L:1000, Galon:19000 }
  if (ing.unit==="gr" && fallbacks[unit]) return (ing.cost_per_unit||0) * fallbacks[unit]
  if (ing.unit==="ml" && fallbacks[unit]) return (ing.cost_per_unit||0) * fallbacks[unit]
  return ing.cost_per_unit || 0
}

const TYPE_COLORS = { opname:"var(--brand)", waste:"var(--red)", production:"var(--green)", requisition:"#6554C0" }
const TYPE_ICONS  = { opname:"📋", waste:"🗑️", production:"🏭", requisition:"🛒" }
const TYPE_LABELS = { opname:"Stock Count", waste:"Waste", production:"Production", requisition:"Request" }

function IngSearchEdit({ ingredients, onSelect }) {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const filtered = ingredients.filter(i => !q || i.name.toLowerCase().includes(q.toLowerCase())).slice(0,20)
  return (
    <div style={{ position:"relative" }}>
      <input value={q} onChange={e=>{ setQ(e.target.value); setOpen(true) }} onFocus={()=>setOpen(true)}
        className="bo-input" style={{ fontSize:12 }} placeholder="Search ingredient..." />
      {open && filtered.length > 0 && (
        <div style={{ position:"absolute", zIndex:999, top:"100%", left:0, right:0, background:"#fff", border:"1px solid var(--surface3)", borderRadius:8, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", maxHeight:180, overflowY:"auto" }}>
          {filtered.map(ing => (
            <div key={ing.id} onClick={()=>{ onSelect(ing); setQ(ing.name); setOpen(false) }}
              style={{ padding:"8px 12px", fontSize:13, cursor:"pointer", borderBottom:"1px solid var(--surface)" }}
              onMouseEnter={e=>e.currentTarget.style.background="var(--brand-lt)"}
              onMouseLeave={e=>e.currentTarget.style.background=""}>
              {ing.name} <span style={{ fontSize:11, color:"var(--ink4)" }}>{ing.unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StaffSubmissions() {
  const [submissions, setSubmissions] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [subRecipes,  setSubRecipes]  = useState([])
  const [subRecipeIngs, setSubRecipeIngs] = useState([])
  const [suppliers,   setSuppliers]   = useState([])
  const [reqSelected, setReqSelected] = useState(new Set())
  const [typeFilter,  setTypeFilter]  = useState("all")
  const [statusFilter,setStatusFilter]= useState("all")
  const [viewModal,   setViewModal]   = useState(null)
  const [editModal,   setEditModal]   = useState(null)
  const [editData,    setEditData]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [processing,  setProcessing]  = useState(false)
  const [newCount,    setNewCount]    = useState(0)
  const [selected,    setSelected]    = useState(new Set())
  const [confirmState, setConfirmState] = useState(null) // {message, resolve}
  const audioRef = useRef(null)
  const channelRef = useRef(null)

  // Custom in-app confirm, replacing window.confirm() — Chrome silently auto-suppresses
  // native confirm()/alert() after a page triggers several in one session, which makes
  // Approve/Reject/Delete silently do nothing with zero feedback. This can't be suppressed.
  function askConfirm(message) {
    return new Promise(resolve => setConfirmState({ message, resolve }))
  }
  function resolveConfirm(result) {
    confirmState?.resolve(result)
    setConfirmState(null)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    channelRef.current = supabase
      .channel("staff_submissions_realtime")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"staff_submissions" }, payload => {
        setSubmissions(prev => [payload.new, ...prev])
        setNewCount(n => n + 1)
        // Play notification sound
        try {
          const ctx = new AudioContext()
          const o = ctx.createOscillator()
          const g = ctx.createGain()
          o.connect(g); g.connect(ctx.destination)
          o.frequency.value = 880; g.gain.value = 0.3
          o.start(); o.stop(ctx.currentTime + 0.15)
          setTimeout(() => { o.frequency.value = 1100; o.start(ctx.currentTime + 0.2); o.stop(ctx.currentTime + 0.35) }, 200)
        } catch(e) {}
      })
      .subscribe()
    return () => { supabase.removeChannel(channelRef.current) }
  }, [])

  async function load() {
    setLoading(true)
    const [{ data:s }, { data:i }, { data:sr }, { data:sri }, { data:sup }] = await Promise.all([
      supabase.from("staff_submissions").select("*").order("submitted_at", { ascending:false }),
      supabase.from("ingredients").select("*"),
      supabase.from("sub_recipes").select("id,name,ingredient_id,yield_qty,yield_unit"),
      supabase.from("sub_recipe_ingredients").select("*"),
      supabase.from("suppliers").select("id,name,phone"),
    ])
    setSubmissions(s||[]); setIngredients(i||[]); setSubRecipes(sr||[]); setSubRecipeIngs(sri||[]); setSuppliers(sup||[])
    setLoading(false)
    setNewCount(0)
  }

  const byStatus = (st) => submissions.filter(s => s.status === st)
  const pending  = byStatus("pending")
  const approved = byStatus("approved")
  const rejected = byStatus("rejected")

  const filtered = submissions.filter(s => {
    const matchStatus = statusFilter === "all" || s.status === statusFilter
    const matchType   = typeFilter === "all" || s.type === typeFilter
    return matchStatus && matchType
  })

  useEffect(() => {
    if (viewModal?.type === "requisition") {
      setReqSelected(new Set((viewModal.data.items||[]).map((_,i)=>i)))
    }
  }, [viewModal?.id])

  function openEdit(sub) {
    setEditData(JSON.parse(JSON.stringify(sub.data)))
    setEditModal(sub)
    setViewModal(null)
  }

  async function saveEdit() {
    let cleaned = editData
    if (editModal.type === "opname") {
      cleaned = { ...editData, items: (editData.items||[]).map(x => {
        const val = parseFloat(x.actual_qty)||0
        return { ...x, actual_qty: val, diff: val - x.system_qty }
      }) }
    } else if (editModal.type === "waste") {
      cleaned = { ...editData, qty: parseFloat(editData.qty)||0 }
    } else if (editModal.type === "requisition") {
      cleaned = { ...editData, items: (editData.items||[]).map(x => ({...x, qty: parseFloat(x.qty)||0})) }
    } else if (editModal.type === "production") {
      cleaned = { ...editData, batch_qty: parseFloat(editData.batch_qty)||0,
        actual_yield: parseFloat(editData.actual_yield)||0,
        ingredients_used: (editData.ingredients_used||[]).map(x => ({...x, qty: parseFloat(x.qty)||0})) }
    }

    if (editModal.type === "production" && editModal.status === "approved") {
      if (!(await askConfirm(
        "This submission was already approved and applied to inventory. Saving this edit will " +
        "immediately adjust live ingredient stock and the linked production record to match the " +
        "new amounts. Continue?"
      ))) return
      setProcessing(true)
      try {
        await reconcileApprovedProduction(editModal, cleaned)
      } catch(e) {
        alert("Error: "+e.message)
        setProcessing(false)
        return // bail out without writing staff_submissions.data — reconciliation failed before any mutation
      }
    }

    await supabase.from("staff_submissions").update({ data: cleaned }).eq("id", editModal.id)
    setSubmissions(prev => prev.map(s => s.id === editModal.id ? { ...s, data: cleaned } : s))
    const wasApprovedProduction = editModal.type === "production" && editModal.status === "approved"
    setEditModal(null); setEditData(null)
    if (wasApprovedProduction) { setProcessing(false); await load() } // refresh ingredient stock in the UI
  }

  // Core apply logic, shared by the single-submission Approve button and bulk approve.
  // Throws on error — callers decide how to surface it (alert vs. collecting into a batch summary).
  async function approveOne(sub) {
      if (sub.type==="opname") {
        for (const item of sub.data.items||[]) {
          // Apply the counted DIFFERENCE on top of current live stock (not an overwrite) — approvals
          // often happen days after the physical count, and sales/production in between must not be erased.
          const { data:freshIng } = await supabase.from("ingredients").select("stock").eq("id",item.ingredient_id).maybeSingle()
          const newStock = Math.max(0, (freshIng?.stock ?? item.system_qty) + item.diff)
          const { error:updErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id",item.ingredient_id)
          if (updErr) throw updErr
          const { error:movErr } = await supabase.from("stock_movements").insert({
            id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
            type:"Adjustment", ingredient_id:item.ingredient_id, ingredient_name:item.name,
            qty:item.diff, unit:item.unit, ref:sub.id,
            note:"Staff opname by "+sub.submitted_by,
            date:new Date().toISOString().slice(0,10),
            time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
          })
          if (movErr) throw movErr
        }
        const { error:opnErr } = await supabase.from("stock_opname").insert({
          id:"OPN-"+Date.now(), date:(sub.submitted_at||new Date().toISOString()).slice(0,10),
          status:"Completed",
          items:sub.data.items.map(i=>{
            const cost = ingredients.find(x=>x.id===i.ingredient_id)?.cost_per_unit||0
            return { ...i, ingredient_name: i.ingredient_name || i.name, value_diff: i.diff*cost }
          }),
          total_variance:sub.data.items.reduce((a,i)=>a+(i.diff*(ingredients.find(x=>x.id===i.ingredient_id)?.cost_per_unit||0)),0)
        })
        if (opnErr) throw opnErr
      } else if (sub.type==="waste") {
        const d = sub.data
        const ing = ingredients.find(i=>i.id===d.ingredient_id)
        if (ing) {
          await supabase.from("ingredients").update({ stock:Math.max(0,(ing.stock||0)-d.qty) }).eq("id",ing.id)
          const { error:wstErr } = await supabase.from("waste_records").insert({
            id:"WST-"+Date.now(), date:new Date().toISOString().slice(0,10),
            ingredient_id:d.ingredient_id, ingredient_name:d.ingredient_name,
            qty:d.qty, unit:d.unit, reason:d.reason, cost:d.estimated_cost,
            recorded_by:sub.submitted_by, notes:d.notes||null
          })
          if (wstErr) throw wstErr
          await supabase.from("stock_movements").insert({
            id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
            type:"Waste", ingredient_id:d.ingredient_id, ingredient_name:d.ingredient_name,
            qty:-d.qty, unit:d.unit, ref:sub.id,
            note:"Staff waste by "+sub.submitted_by+": "+d.reason,
            date:new Date().toISOString().slice(0,10),
            time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
          })
        }
      } else if (sub.type==="production") {
        const d = sub.data
        const outputIngredientId = d.item_id || subRecipes.find(sr=>sr.id===d.sub_recipe_id)?.ingredient_id
        const item = outputIngredientId ? ingredients.find(i=>i.id===outputIngredientId) : null
        const producedQty = d.actual_yield ?? d.batch_qty
        for (const u of d.ingredients_used||[]) {
          const ing = ingredients.find(i=>i.id===u.ingredient_id)
          if (ing) {
            const qtyBase = toBaseUnit(ing, u.qty||0, u.unit)
            await supabase.from("ingredients").update({ stock:Math.max(0,(ing.stock||0)-qtyBase) }).eq("id",ing.id)
            await supabase.from("stock_movements").insert({
              id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
              type:"Production", ingredient_id:ing.id, ingredient_name:ing.name,
              qty:-qtyBase, unit:ing.unit, ref:sub.id,
              note:"Production: "+d.item_name+" by "+sub.submitted_by,
              date:new Date().toISOString().slice(0,10),
              time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
            })
          }
        }
        if (item) {
          await supabase.from("ingredients").update({ stock:(item.stock||0)+producedQty }).eq("id",item.id)
          const { error:prodErr } = await supabase.from("production_batches").insert({
            id:"PRD-"+Date.now(), item_id:item.id, item_name:d.item_name,
            batch_qty:producedQty, unit:d.yield_unit||d.unit, date:(sub.submitted_at||new Date().toISOString()).slice(0,10),
            produced_by:sub.submitted_by, notes:d.notes||null,
            ingredients_used:d.ingredients_used, status:"Completed",
            submission_id: sub.id,
          })
          if (prodErr) throw prodErr
        }
      }
      const { error:statusErr } = await supabase.from("staff_submissions").update({ status:"approved", reviewed_at:new Date().toISOString() }).eq("id",sub.id)
      if (statusErr) throw statusErr
  }

  // Reconciles real inventory (ingredient stock + stock_movements + the linked production_batches
  // row) after a manager edits an ALREADY-APPROVED production submission's batch_qty/ingredients.
  // Unlike a pending edit (which only rewrites staff_submissions.data, with no live-inventory
  // effect until approval), this mutates stock immediately since the original approval already
  // deducted/credited stock once — we apply the DELTA between old and new, not the full new amount.
  async function reconcileApprovedProduction(sub, newData) {
    // Resolve the matching production_batches row FIRST, before touching any stock, so a failed
    // reconciliation can't leave stock partially adjusted with no batch-record update.
    const { data:batchRow, error:batchErr } = await supabase
      .from("production_batches").select("*").eq("submission_id", sub.id).maybeSingle()
    if (batchErr) throw batchErr
    if (!batchRow) {
      throw new Error(
        "Can't reconcile inventory: no linked production batch record found for this submission " +
        "(it was likely approved before this feature shipped). Reject this edit, or manually adjust " +
        "stock/production_batches instead of editing this approved submission's batch quantity."
      )
    }

    const oldUsed = sub.data.ingredients_used || []
    const newUsed = newData.ingredients_used || []

    // Net delta per ingredient (new - old), in each ingredient's base/stock unit.
    const deltaByIng = new Map()
    function addDelta(ingredient_id, qty, unit, sign) {
      const ing = ingredients.find(i => i.id === ingredient_id)
      if (!ing) return
      const base = toBaseUnit(ing, qty || 0, unit) * sign
      const cur = deltaByIng.get(ingredient_id) || { deltaBase: 0, ing }
      cur.deltaBase += base
      deltaByIng.set(ingredient_id, cur)
    }
    for (const u of oldUsed) addDelta(u.ingredient_id, u.qty, u.unit, -1)
    for (const u of newUsed) addDelta(u.ingredient_id, u.qty, u.unit, +1)

    for (const [ingredient_id, { deltaBase, ing }] of deltaByIng) {
      if (!deltaBase) continue
      const { data:fresh } = await supabase.from("ingredients").select("stock").eq("id", ingredient_id).maybeSingle()
      const newStock = Math.max(0, (fresh?.stock ?? ing.stock ?? 0) - deltaBase)
      const { error:updErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id", ingredient_id)
      if (updErr) throw updErr
      const { error:movErr } = await supabase.from("stock_movements").insert({
        id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
        type:"Production Adjustment", ingredient_id, ingredient_name:ing.name,
        qty:-deltaBase, unit:ing.unit, ref:sub.id,
        note:"Production edit adjustment: "+(newData.item_name||sub.data.item_name)+" by "+sub.submitted_by,
        date:new Date().toISOString().slice(0,10),
        time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
      })
      if (movErr) throw movErr
    }

    // Adjust the output ingredient's stock by the yield delta.
    const outputIngredientId = sub.data.item_id || subRecipes.find(sr=>sr.id===sub.data.sub_recipe_id)?.ingredient_id
    const item = outputIngredientId ? ingredients.find(i=>i.id===outputIngredientId) : null
    const oldYield = sub.data.actual_yield ?? sub.data.batch_qty ?? 0
    const newYield = newData.actual_yield ?? newData.batch_qty ?? 0
    const yieldDelta = newYield - oldYield
    if (item && yieldDelta) {
      const { data:freshItem } = await supabase.from("ingredients").select("stock").eq("id", item.id).maybeSingle()
      await supabase.from("ingredients").update({ stock: Math.max(0, (freshItem?.stock ?? item.stock ?? 0) + yieldDelta) }).eq("id", item.id)
    }

    // Update the linked production_batches row to match the new (post-edit) values.
    const { error:prodUpdErr } = await supabase.from("production_batches").update({
      batch_qty: newYield,
      unit: newData.yield_unit || newData.unit || batchRow.unit,
      ingredients_used: newUsed,
      notes: newData.notes ?? batchRow.notes,
    }).eq("id", batchRow.id)
    if (prodUpdErr) throw prodUpdErr
  }

  async function approve(sub) {
    if (!(await askConfirm("Approve and apply this " + sub.type + " report?"))) return
    setProcessing(true)
    try {
      await approveOne(sub)
      await load(); setViewModal(null)
    } catch(e) { alert("Error: "+e.message) }
    setProcessing(false)
  }

  async function reject(sub) {
    if (!(await askConfirm("Reject this submission?"))) return
    const { error } = await supabase.from("staff_submissions").update({ status:"rejected", reviewed_at:new Date().toISOString() }).eq("id",sub.id)
    if (error) { alert("Error: "+error.message); return }
    await load(); setViewModal(null)
  }

  async function deleteSubmission(sub) {
    const warning = sub.status==="approved"
      ? "This submission was already approved — deleting it only removes this record, it will NOT undo any stock/ingredient changes it already applied. Delete anyway?"
      : "Delete this submission? This cannot be undone."
    if (!(await askConfirm(warning))) return
    await supabase.from("staff_submissions").delete().eq("id",sub.id)
    setSubmissions(prev => prev.filter(s => s.id !== sub.id))
    setViewModal(null)
  }

  function toggleSelect(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  async function bulkDelete() {
    const ids = [...selected]
    if (ids.length === 0) return
    const anyApproved = submissions.some(s => ids.includes(s.id) && s.status==="approved")
    const warning = "Delete "+ids.length+" selected submission"+(ids.length>1?"s":"")+"? This cannot be undone."
      + (anyApproved ? " Some are already approved — deleting them only removes the record, it will NOT undo any stock/ingredient changes already applied." : "")
    if (!(await askConfirm(warning))) return
    await supabase.from("staff_submissions").delete().in("id", ids)
    setSubmissions(prev => prev.filter(s => !ids.includes(s.id)))
    setSelected(new Set())
  }

  async function bulkApprove() {
    const ids = [...selected]
    const targets = submissions.filter(s => ids.includes(s.id) && s.status==="pending" && s.type!=="requisition")
    if (targets.length === 0) { alert("No approvable submissions selected (requisitions need \"To PO\" instead, and only pending items can be approved)."); return }
    const warning = "Approve and apply "+targets.length+" selected submission"+(targets.length>1?"s":"")+"?"
    if (!(await askConfirm(warning))) return
    setProcessing(true)
    const failures = []
    for (const sub of targets) {
      try { await approveOne(sub) } catch(e) { failures.push(sub.id+": "+e.message) }
    }
    await load()
    setSelected(new Set())
    setProcessing(false)
    if (failures.length) alert("Approved "+(targets.length-failures.length)+" of "+targets.length+". Failed:\n"+failures.join("\n"))
  }

  async function convertToPO(sub) {
    const items = (sub.data.items||[]).map(item => {
      const unit_cost = unitPriceFor(ingredients.find(x=>x.id===item.ingredient_id), item.unit)
      const total_cost = item.qty * unit_cost
      return {
        ingredient_id:item.ingredient_id, name:item.ingredient_name,
        qty:item.qty, unit:item.unit, unit_cost, total_cost, notes:item.notes,
      }
    })
    const total = items.reduce((a,i)=>a+i.total_cost,0)
    const poId = "PO-"+Date.now()
    await supabase.from("purchase_orders").insert({
      id:poId, supplierId:"", supplierName:"— Select Supplier —",
      invoiceNo:poId, date:new Date().toISOString().slice(0,10),
      status:"Unpaid", subtotal:total, total, items,
      notes:"From staff requisition by "+sub.submitted_by+". Please assign supplier and confirm prices."
    })
    await supabase.from("staff_submissions").update({ status:"approved", reviewed_at:new Date().toISOString() }).eq("id",sub.id)
    await load()
    alert("Draft PO created. Go to Purchase Orders to complete it.")
  }

  function toggleReqItem(i) {
    setReqSelected(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next })
  }

  async function updateReqItemSupplier(sub, i, supplierName) {
    const items = (sub.data.items||[]).map((it,idx)=> idx===i ? {...it, supplier:supplierName} : it)
    const newData = {...sub.data, items}
    setViewModal(v => v ? {...v, data:newData} : v)
    setSubmissions(prev => prev.map(s => s.id===sub.id ? {...s, data:newData} : s))
    await supabase.from("staff_submissions").update({ data:newData }).eq("id", sub.id)
  }

  function sendSupplierGroupWA(sub, supplierName, items) {
    const date = new Date(sub.submitted_at).toLocaleDateString("id-ID")
    let text = "*PERMINTAAN BAHAN - PawonLoka*\n"
    text += "Tanggal: " + date + "\n"
    text += "Station: " + (sub.data?.station || "-") + "\n"
    text += "Dibutuhkan: " + (sub.data?.needed_by || "Hari ini") + "\n\n"
    text += "*" + supplierName + "*\n"
    items.forEach(i => { text += "- " + i.ingredient_name + " " + i.qty + " " + i.unit + "\n" })
    if (sub.data?.notes) text += "\nCatatan: " + sub.data.notes + "\n"
    const supplierRecord = suppliers.find(s=>s.name===supplierName)
    const phone = supplierRecord?.phone ? supplierRecord.phone.replace(/[^0-9]/g,"") : ""
    const url = phone ? "https://wa.me/"+phone+"?text="+encodeURIComponent(text) : "https://wa.me/?text="+encodeURIComponent(text)
    window.open(url, "_blank")
  }

    const staffUrl = window.location.origin + "/staff"

  return (
    <div>
      {/* Notification banner */}
      {newCount > 0 && (
        <div style={{ padding:"12px 16px", background:"var(--amber-lt)", border:"1.5px solid var(--amber)", borderRadius:"var(--r)", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontWeight:700, color:"var(--amber)", fontSize:13 }}>
            {newCount} new report{newCount>1?"s":""} received
          </div>
          <button onClick={load} className="bo-btn bo-btn-sm" style={{ background:"var(--amber)", color:"#fff", border:"none" }}>Refresh</button>
        </div>
      )}

      {/* Staff link */}
      <div style={{ marginBottom:16, padding:"12px 16px", background:"var(--brand-lt)", borderRadius:"var(--r)", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:"var(--brand)" }}>Staff Mobile Link</div>
          <div style={{ fontSize:12, color:"var(--ink4)", marginTop:2 }}>Share this link with your staff</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <code style={{ fontSize:12, background:"#fff", padding:"5px 10px", borderRadius:8, border:"1px solid var(--surface3)" }}>{staffUrl}</code>
          <button onClick={()=>navigator.clipboard.writeText(staffUrl)} className="bo-btn bo-btn-ghost bo-btn-sm">Copy</button>
          <a href="/staff" target="_blank" className="bo-btn bo-btn-primary bo-btn-sm" style={{ textDecoration:"none" }}>Open</a>
        </div>
      </div>

      {/* Stats */}
      <div className="bo-metrics" style={{ gridTemplateColumns:"repeat(3,1fr)", marginBottom:16 }}>
        <div className="bo-met amber">
          <div className="bo-met-label">Pending</div>
          <div className="bo-met-val" style={{ display:"flex", alignItems:"center", gap:8 }}>
            {pending.length}
            {pending.length > 0 && <span style={{ fontSize:11, background:"var(--amber)", color:"#fff", borderRadius:20, padding:"1px 8px", fontWeight:700 }}>NEW</span>}
          </div>
        </div>
        <div className="bo-met green"><div className="bo-met-label">Approved</div><div className="bo-met-val">{approved.length}</div></div>
        <div className="bo-met red"><div className="bo-met-label">Rejected</div><div className="bo-met-val">{rejected.length}</div></div>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", gap:4 }}>
          {[["all","All Types"],["opname","Stock Count"],["waste","Waste"],["production","Production"],["requisition","Request"]].map(([f,l])=>(
            <button key={f} onClick={()=>setTypeFilter(f)}
              className={"bo-btn bo-btn-sm "+(typeFilter===f?"bo-btn-primary":"bo-btn-ghost")}
              style={{ fontSize:11 }}>{TYPE_ICONS[f]||""} {l}</button>
          ))}
        </div>
        <div style={{ display:"flex", gap:4, marginLeft:"auto" }}>
          {[["pending","Pending"],["approved","Approved"],["rejected","Rejected"],["all","All"]].map(([f,l])=>(
            <button key={f} onClick={()=>setStatusFilter(f)}
              className={"bo-btn bo-btn-sm "+(statusFilter===f?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
          ))}
        </div>
      </div>

      {/* Bulk selection bar */}
      {selected.size > 0 && (
        <div style={{ padding:"10px 16px", background:"var(--brand-lt)", border:"1.5px solid var(--brand)", borderRadius:"var(--r)", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontWeight:700, color:"var(--brand)", fontSize:13 }}>{selected.size} selected</div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={bulkApprove} disabled={processing} className="bo-btn bo-btn-sm" style={{ background:"var(--green-lt)", color:"var(--green)", border:"none" }}>Approve Selected</button>
            <button onClick={bulkDelete} className="bo-btn bo-btn-sm bo-btn-danger">Delete Selected</button>
            <button onClick={()=>setSelected(new Set())} className="bo-btn bo-btn-ghost bo-btn-sm">Clear</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bo-card" style={{ padding:0, overflowX:"auto" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
          <table className="bo-table">
            <thead><tr>
              <th><input type="checkbox" checked={filtered.length>0 && selected.size===filtered.length} onChange={()=>setSelected(selected.size===filtered.length ? new Set() : new Set(filtered.map(s=>s.id)))} /></th>
              <th>Type</th><th>Staff</th><th>Station</th><th>Date</th><th>Summary</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(s => {
                const c = TYPE_COLORS[s.type]||"var(--ink5)"
                const reqTotal = (s.data.items||[]).reduce((a,item)=>a+(item.qty*unitPriceFor(ingredients.find(x=>x.id===item.ingredient_id),item.unit)),0)
                const opnameVariance = (s.data.items||[]).reduce((a,item)=>a+(item.diff*(ingredients.find(x=>x.id===item.ingredient_id)?.cost_per_unit||0)),0)
                const summary = s.type==="opname" ? (s.data.items||[]).length+" items counted — "+fmt(opnameVariance)+" variance"
                  : s.type==="waste" ? s.data.qty+" "+s.data.unit+" — "+s.data.ingredient_name
                  : s.type==="requisition" ? (s.data.items||[]).length+" items requested — "+fmt(reqTotal)+" total"
                  : (s.data.batch_qty ? s.data.batch_qty+"× resep · " : "")+(s.data.actual_yield??s.data.batch_qty)+" "+(s.data.yield_unit||s.data.unit||"")+" "+s.data.item_name
                return (
                  <tr key={s.id} style={{ background: s.status==="pending"?"#fffbeb":s.status==="approved"?"var(--green-lt)":s.status==="rejected"?"var(--red-lt)":"" }}>
                    <td><input type="checkbox" checked={selected.has(s.id)} onChange={()=>toggleSelect(s.id)} /></td>
                    <td><span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10, background:c+"22", color:c }}>{TYPE_ICONS[s.type]} {TYPE_LABELS[s.type]||s.type}</span></td>
                    <td style={{ fontWeight:600 }}>{s.submitted_by||"—"}</td>
                    <td style={{ fontSize:12, color:"var(--ink4)" }}>{s.data?.station||"—"}</td>
                    <td style={{ fontSize:12 }}>{new Date(s.submitted_at).toLocaleString("id-ID")}</td>
                    <td style={{ fontSize:12, color:"var(--ink4)" }}>{summary}</td>
                    <td><span className={"bo-badge "+(s.status==="pending"?"bo-badge-amber":s.status==="approved"?"bo-badge-green":"bo-badge-red")}>{s.status}</span></td>
                    <td>
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={()=>setViewModal(s)} className="bo-btn bo-btn-ghost bo-btn-sm">View</button>
                        <button onClick={()=>openEdit(s)} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ color:"var(--brand)" }}>Edit</button>
                        {s.status==="pending" && <>
                          {s.type!=="requisition" && <button onClick={()=>approve(s)} disabled={processing} className="bo-btn bo-btn-sm" style={{ background:"var(--green-lt)", color:"var(--green)", border:"none", cursor:"pointer", borderRadius:"var(--r)", padding:"5px 11px", fontSize:12, fontWeight:600 }}>Approve</button>}
                          <button onClick={()=>reject(s)} disabled={processing} className="bo-btn bo-btn-danger bo-btn-sm">Reject</button>
                        </>}
                        {s.type==="requisition" && s.status==="pending" && <button onClick={()=>convertToPO(s)} className="bo-btn bo-btn-sm" style={{ background:"#6554C0", color:"#fff", border:"none", cursor:"pointer", borderRadius:"var(--r)", padding:"5px 11px", fontSize:12, fontWeight:600 }}>To PO</button>}
                        <button onClick={()=>deleteSubmission(s)} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ color:"var(--red)" }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length===0 && <tr><td colSpan={8} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No submissions found</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* View Modal */}
      {viewModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setViewModal(null)}>
          <div className="bo-modal" style={{ maxWidth:viewModal.type==="opname"?720:560, maxHeight:"90vh" }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">{TYPE_ICONS[viewModal.type]} {TYPE_LABELS[viewModal.type]} Report</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>By {viewModal.submitted_by} · Station: {viewModal.data?.station||"—"} · {new Date(viewModal.submitted_at).toLocaleString("id-ID")}</div>
              </div>
              <button className="bo-modal-close" onClick={()=>setViewModal(null)}>x</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto" }}>
              {viewModal.type==="opname" && (() => {
                const totalValue = (viewModal.data.items||[]).reduce((a,item)=>a+(item.actual_qty*(ingredients.find(x=>x.id===item.ingredient_id)?.cost_per_unit||0)),0)
                const totalVariance = (viewModal.data.items||[]).reduce((a,item)=>a+(item.diff*(ingredients.find(x=>x.id===item.ingredient_id)?.cost_per_unit||0)),0)
                return (
                <div style={{ overflowX:"auto" }}>
                <table className="bo-table">
                  <thead><tr><th>Ingredient</th><th>System</th><th>Actual</th><th>Diff</th><th>Unit Price</th><th>Value</th><th>Variance</th></tr></thead>
                  <tbody>
                    {(viewModal.data.items||[]).map((item,i)=>{
                      const foundIng = ingredients.find(x=>x.id===item.ingredient_id)
                      const unitPrice = foundIng?.cost_per_unit||0
                      const value = item.actual_qty*unitPrice
                      const variance = item.diff*unitPrice
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight:600 }}>{item.name}</td>
                          <td>{item.system_qty} {item.unit}</td>
                          <td style={{ fontWeight:700 }}>{item.actual_qty} {item.unit}</td>
                          <td style={{ color:item.diff<0?"var(--red)":item.diff>0?"var(--green)":"var(--ink5)", fontWeight:700 }}>{item.diff>0?"+":""}{Number(item.diff).toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                          {foundIng ? <>
                            <td>{fmt(unitPrice)}</td>
                            <td>{fmt(value)}</td>
                            <td style={{ color:variance<0?"var(--red)":variance>0?"var(--green)":"var(--ink5)", fontWeight:700 }}>{variance>0?"+":""}{fmt(variance)}</td>
                          </> : <td colSpan={3} style={{ color:"var(--ink5)", fontStyle:"italic" }}>Ingredient deleted (no pricing)</td>}
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5} style={{ textAlign:"right", fontWeight:700 }}>Total</td>
                      <td style={{ fontWeight:800 }}>{fmt(totalValue)}</td>
                      <td style={{ fontWeight:800, color:totalVariance<0?"var(--red)":totalVariance>0?"var(--green)":"var(--ink5)" }}>{totalVariance>0?"+":""}{fmt(totalVariance)}</td>
                    </tr>
                  </tfoot>
                </table>
                </div>
                )
              })()}
              {viewModal.type==="waste" && (
                <div style={{ display:"grid", gap:14 }}>
                  {[["Ingredient",viewModal.data.ingredient_name],["Quantity",viewModal.data.qty+" "+viewModal.data.unit],["Reason",viewModal.data.reason],["Est. Cost",fmt(viewModal.data.estimated_cost)],["Notes",viewModal.data.notes||"—"]].map(([k,v])=>(
                    <div key={k}><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase" }}>{k}</div><div style={{ fontWeight:600, marginTop:3 }}>{v}</div></div>
                  ))}
                </div>
              )}
              {viewModal.type==="requisition" && (() => {
                const items = viewModal.data.items || []
                const bySupplier = {}
                items.forEach((item,i) => {
                  const sup = item.supplier || "Belum ada supplier"
                  if (!bySupplier[sup]) bySupplier[sup] = []
                  bySupplier[sup].push(i)
                })
                const totalAll = items.reduce((a,item)=>a+(item.qty*unitPriceFor(ingredients.find(x=>x.id===item.ingredient_id),item.unit)),0)
                return (
                <div>
                  <div style={{ marginBottom:12, fontSize:12, color:"var(--ink4)" }}>Needed by: <strong>{viewModal.data.needed_by||"—"}</strong> · Notes: {viewModal.data.notes||"—"}</div>
                  <div style={{ overflowX:"auto" }}>
                  <table className="bo-table">
                    <thead><tr><th></th><th>Ingredient</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th><th>Supplier</th></tr></thead>
                    <tbody>
                      {items.map((item,i)=>{
                        const foundIng = ingredients.find(x=>x.id===item.ingredient_id)
                        const unitPrice = unitPriceFor(foundIng, item.unit)
                        return (
                          <tr key={i}>
                            <td><input type="checkbox" checked={reqSelected.has(i)} onChange={()=>toggleReqItem(i)} /></td>
                            <td style={{ fontWeight:600 }}>{item.ingredient_name}</td>
                            <td style={{ fontWeight:700, color:"#6554C0" }}>{item.qty}</td>
                            <td>{item.unit}</td>
                            {foundIng ? <>
                              <td>{fmt(unitPrice)}</td>
                              <td style={{ fontWeight:600 }}>{fmt(item.qty*unitPrice)}</td>
                            </> : <td colSpan={2} style={{ color:"var(--red)", fontWeight:600 }}>⚠ unknown ingredient</td>}
                            <td>
                              <select value={item.supplier||""} onChange={e=>updateReqItemSupplier(viewModal, i, e.target.value)} className="bo-select" style={{ fontSize:11, padding:"4px 6px" }}>
                                <option value="">— none —</option>
                                {suppliers.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5} style={{ textAlign:"right", fontWeight:700 }}>Total</td>
                        <td style={{ fontWeight:800, color:"#6554C0" }}>{fmt(totalAll)}</td>
                        <td/>
                      </tr>
                    </tfoot>
                  </table>
                  </div>

                  <div style={{ marginTop:16, borderTop:"1px solid var(--surface3)", paddingTop:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--ink4)", textTransform:"uppercase", marginBottom:8 }}>Send to Supplier</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {Object.entries(bySupplier).map(([sup, idxs])=>{
                        const allSelected = idxs.every(i=>reqSelected.has(i))
                        const selectedIdxs = idxs.filter(i=>reqSelected.has(i))
                        return (
                          <div key={sup} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:"var(--surface)", borderRadius:"var(--r)", gap:8, flexWrap:"wrap" }}>
                            <button onClick={()=>setReqSelected(prev=>{ const next=new Set(prev); idxs.forEach(i=> allSelected? next.delete(i) : next.add(i)); return next })}
                              style={{ background:"none", border:"none", padding:0, cursor:"pointer", fontSize:12, fontWeight:700, color:"var(--ink)", textAlign:"left" }}>
                              {allSelected?"☑":"☐"} {sup} ({idxs.length} item{idxs.length>1?"s":""})
                            </button>
                            <button disabled={selectedIdxs.length===0} onClick={()=>sendSupplierGroupWA(viewModal, sup, selectedIdxs.map(i=>items[i]))}
                              style={{background: selectedIdxs.length===0?"#94A3B8":"#25D366",color:"#fff",border:"none",borderRadius:"var(--r)",padding:"6px 12px",fontSize:12,fontWeight:600,cursor:selectedIdxs.length===0?"not-allowed":"pointer",fontFamily:"inherit"}}>
                              💬 Kirim{selectedIdxs.length>0 && selectedIdxs.length!==idxs.length?" ("+selectedIdxs.length+")":""}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
                )
              })()}
              {viewModal.type==="production" && (() => {
                const used = viewModal.data.ingredients_used||[]
                const prodTotal = used.reduce((a,u)=>a+(u.qty*unitPriceFor(ingredients.find(x=>x.id===u.ingredient_id),u.unit)),0)
                return (
                <div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
                    <div><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase" }}>Produced</div><div style={{ fontWeight:700, color:"var(--green)", marginTop:3 }}>{viewModal.data.item_name}</div></div>
                    <div><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase" }}>Batches</div><div style={{ fontWeight:700, marginTop:3 }}>{viewModal.data.batch_qty ?? "—"}× resep</div></div>
                    <div><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase" }}>Quantity</div><div style={{ fontWeight:700, marginTop:3 }}>{viewModal.data.actual_yield??viewModal.data.batch_qty} {viewModal.data.yield_unit||viewModal.data.unit}</div></div>
                  </div>
                  <table className="bo-table">
                    <thead><tr><th>Ingredient</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Cost</th></tr></thead>
                    <tbody>
                      {used.map((u,i) => {
                        const ing = ingredients.find(x=>x.id===u.ingredient_id)
                        const unitPrice = unitPriceFor(ing,u.unit)
                        return (
                          <tr key={i}>
                            <td>{u.name}</td><td>{Math.round((u.qty||0)*100)/100}</td><td>{u.unit}</td>
                            {ing ? <><td>{fmt(unitPrice)}</td><td>{fmt(u.qty*unitPrice)}</td></>
                              : <td colSpan={2} style={{ color:"var(--ink5)", fontStyle:"italic" }}>Ingredient deleted (no pricing)</td>}
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:"var(--surface)", fontWeight:800 }}>
                        <td colSpan={4} style={{ textAlign:"right" }}>Total Cost</td>
                        <td>{fmt(prodTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {viewModal.data.notes && <div style={{ marginTop:12, fontSize:12, color:"var(--ink4)" }}>Notes: {viewModal.data.notes}</div>}
                </div>
                )
              })()}
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setViewModal(null)} className="bo-btn bo-btn-ghost">Close</button>
              <button onClick={()=>deleteSubmission(viewModal)} className="bo-btn bo-btn-ghost" style={{ color:"var(--red)" }}>Delete</button>
              <button onClick={()=>openEdit(viewModal)} className="bo-btn bo-btn-ghost" style={{ color:"var(--brand)" }}>Edit</button>
              {viewModal.status==="pending" && <>
                <button onClick={()=>reject(viewModal)} disabled={processing} className="bo-btn bo-btn-danger">Reject</button>
                {viewModal.type==="requisition"
                  ? <button onClick={()=>convertToPO(viewModal)} disabled={processing} className="bo-btn bo-btn-primary" style={{ background:"#6554C0" }}>Convert to PO</button>
                  : <button onClick={()=>approve(viewModal)} disabled={processing} className="bo-btn bo-btn-primary">Approve & Apply</button>
                }
              </>}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && editData && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setEditModal(null)}>
          <div className="bo-modal" style={{ maxWidth:580, maxHeight:"90vh" }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">Edit — {TYPE_ICONS[editModal.type]} {TYPE_LABELS[editModal.type]}</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>By {editModal.submitted_by} · {new Date(editModal.submitted_at).toLocaleString("id-ID")}</div>
              </div>
              <button className="bo-modal-close" onClick={()=>setEditModal(null)}>x</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto" }}>
              {/* Notes field for all types */}
              <div className="bo-form-row">
                <label className="bo-label">Notes</label>
                <input value={editData.notes||""} onChange={e=>setEditData(d=>({...d,notes:e.target.value}))} className="bo-input" placeholder="Add notes..." />
              </div>

              {editModal.type==="opname" && (() => {
                const totalValue = (editData.items||[]).reduce((a,item)=>a+((parseFloat(item.actual_qty)||0)*(ingredients.find(x=>x.id===item.ingredient_id)?.cost_per_unit||0)),0)
                const totalVariance = (editData.items||[]).reduce((a,item)=>a+(((parseFloat(item.actual_qty)||0)-item.system_qty)*(ingredients.find(x=>x.id===item.ingredient_id)?.cost_per_unit||0)),0)
                return (
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <label className="bo-label" style={{marginBottom:0}}>Stock Counts</label>
                    <button onClick={()=>setEditData(d=>({...d,items:[...(d.items||[]),{ingredient_id:"",name:"",unit:"",system_qty:0,actual_qty:0,diff:0}]}))}
                      className="bo-btn bo-btn-ghost bo-btn-sm">+ Add Item</button>
                  </div>
                  {(editData.items||[]).map((item,i)=>{
                    const foundIng = ingredients.find(x=>x.id===item.ingredient_id)
                    const unitPrice = foundIng?.cost_per_unit||0
                    const diff = (parseFloat(item.actual_qty)||0)-item.system_qty
                    const variance = diff*unitPrice
                    const unknown = item.ingredient_id && !foundIng
                    return (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 100px 60px 90px 28px", gap:8, marginBottom:8, alignItems:"center" }}>
                      {item.ingredient_id
                        ? <div style={{ fontSize:13, fontWeight:600 }}>{item.name}</div>
                        : <IngSearchEdit ingredients={ingredients} onSelect={ing=>{
                            setEditData(d=>({ ...d, items:d.items.map((x,idx)=>idx===i?{...x,ingredient_id:ing.id,name:ing.name,unit:ing.unit||"",system_qty:ing.stock||0,diff:(x.actual_qty||0)-(ing.stock||0)}:x) }))
                          }} />
                      }
                      <input type="number" value={item.actual_qty} onChange={e=>{
                        const val = e.target.value
                        setEditData(d=>({ ...d, items:d.items.map((x,idx)=>idx===i?{...x,actual_qty:val,diff:(parseFloat(val)||0)-x.system_qty}:x) }))
                      }} className="bo-input" style={{ fontSize:13 }} />
                      <span style={{ fontSize:12, color:"var(--ink4)" }}>{item.unit}</span>
                      {unknown
                        ? <span style={{ fontSize:11, textAlign:"right", color:"var(--red)", fontWeight:600 }}>⚠ unknown</span>
                        : <span style={{ fontSize:12, textAlign:"right", color:variance<0?"var(--red)":variance>0?"var(--green)":"var(--ink4)" }}>{variance>0?"+":""}{fmt(variance)}</span>}
                      <button onClick={()=>setEditData(d=>({...d,items:d.items.filter((_,idx)=>idx!==i)}))}
                        style={{background:"none",border:"none",color:"var(--red)",fontSize:18,cursor:"pointer",padding:0}}>x</button>
                    </div>
                    )
                  })}
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, fontWeight:700, marginTop:4 }}>
                    <span>Value: {fmt(totalValue)}</span>
                    <span style={{ color:totalVariance<0?"var(--red)":totalVariance>0?"var(--green)":"var(--ink5)" }}>Variance: {totalVariance>0?"+":""}{fmt(totalVariance)}</span>
                  </div>
                </div>
                )
              })()}

              {editModal.type==="waste" && (
                <div style={{ display:"grid", gap:12 }}>
                  <div><label className="bo-label">Quantity</label>
                    <input type="number" value={editData.qty||""} onChange={e=>setEditData(d=>({...d,qty:e.target.value}))} className="bo-input" /></div>
                  <div><label className="bo-label">Reason</label>
                    <select value={editData.reason||"Expired"} onChange={e=>setEditData(d=>({...d,reason:e.target.value}))} className="bo-select">
                      {["Expired","Damaged","Overproduction","Spillage","Other"].map(r=><option key={r}>{r}</option>)}
                    </select></div>
                </div>
              )}

              {editModal.type==="requisition" && (
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <label className="bo-label" style={{marginBottom:0}}>Items Requested</label>
                    <button onClick={()=>setEditData(d=>({...d,items:[...(d.items||[]),{ingredient_id:"",ingredient_name:"",qty:0,unit:""}]}))}
                      className="bo-btn bo-btn-ghost bo-btn-sm">+ Add Item</button>
                  </div>
                  {(editData.items||[]).map((item,i)=>{
                    const foundIng = ingredients.find(x=>x.id===item.ingredient_id)
                    const unitPrice = unitPriceFor(foundIng, item.unit)
                    const unknown = item.ingredient_id && !foundIng
                    return (
                    <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 80px 60px 90px 28px",gap:8,marginBottom:8,alignItems:"center"}}>
                      {item.ingredient_id
                        ? <div style={{fontSize:13,fontWeight:600}}>{item.ingredient_name}</div>
                        : <IngSearchEdit ingredients={ingredients} onSelect={ing=>{
                            setEditData(d=>({...d,items:d.items.map((x,idx)=>idx===i?{...x,ingredient_id:ing.id,ingredient_name:ing.name,unit:ing.unit||""}:x)}))
                          }} />
                      }
                      <input type="number" value={item.qty} onChange={e=>{
                        setEditData(d=>({...d,items:d.items.map((x,idx)=>idx===i?{...x,qty:e.target.value}:x)}))
                      }} className="bo-input" style={{fontSize:13}} />
                      <span style={{fontSize:12,color:"var(--ink4)"}}>{item.unit}</span>
                      {unknown
                        ? <span style={{fontSize:11,color:"var(--red)",fontWeight:600,textAlign:"right"}}>⚠ unknown</span>
                        : <span style={{fontSize:12,color:"var(--ink4)",textAlign:"right"}}>{fmt((parseFloat(item.qty)||0)*unitPrice)}</span>}
                      <button onClick={()=>setEditData(d=>({...d,items:d.items.filter((_,idx)=>idx!==i)}))}
                        style={{background:"none",border:"none",color:"var(--red)",fontSize:18,cursor:"pointer",padding:0}}>x</button>
                    </div>
                    )
                  })}
                  <div style={{ textAlign:"right", fontSize:13, fontWeight:700, marginTop:4, color:"#6554C0" }}>
                    Total: {fmt((editData.items||[]).reduce((a,item)=>a+((parseFloat(item.qty)||0)*unitPriceFor(ingredients.find(x=>x.id===item.ingredient_id),item.unit)),0))}
                  </div>
                </div>
              )}

              {editModal.type==="production" && (() => {
                const linkedRecipe = subRecipes.find(sr=>sr.id===editData.sub_recipe_id)
                const recipeLines  = linkedRecipe ? subRecipeIngs.filter(l=>l.sub_recipe_id===linkedRecipe.id) : []
                return (
                <div style={{ display:"grid", gap:12 }}>
                  {editModal.status==="approved" && (
                    <div style={{ background:"#fff7ed", border:"1px solid #fb923c", borderRadius:"var(--r)", padding:"10px 12px", fontSize:12.5, color:"#9a3412", fontWeight:600 }}>
                      ⚠ This batch was already approved. Changing the batch quantity here will immediately adjust live ingredient stock and the linked production record — not just this submission's record.
                    </div>
                  )}
                  <div>
                    <label className="bo-label" style={{ fontSize:13, fontWeight:800, color:"var(--ink1)" }}>Batch Quantity (× resep)</label>
                    <input type="number" value={editData.batch_qty||""} onChange={e=>{
                      const batch_qty = e.target.value
                      const batches = parseFloat(batch_qty)||0
                      setEditData(d => ({
                        ...d, batch_qty,
                        // Keep actual_yield in sync — approve() uses actual_yield, not batch_qty, so
                        // editing batch quantity alone previously had no visible effect on anything.
                        actual_yield: linkedRecipe ? Math.round((linkedRecipe.yield_qty||1) * batches * 100)/100 : d.actual_yield,
                        // Rescale ingredients_used from the recipe's per-batch ratios too — this was
                        // the actual reported bug: only actual_yield was kept in sync, so "resep"
                        // (the ingredient list) stayed frozen at whatever batch_qty it was created with.
                        // Only rescale when we have recipe lines to rescale FROM, so ad-hoc entries
                        // with no linked recipe (or a recipe with no configured lines) aren't wiped.
                        ingredients_used: recipeLines.length
                          ? recipeLines.map(l => {
                              const ing = ingredients.find(i=>i.id===l.ingredient_id)
                              return { ingredient_id:l.ingredient_id, name:ing?.name||"", qty:Math.round(l.qty*batches*100)/100, unit:l.unit||ing?.unit||"" }
                            })
                          : d.ingredients_used,
                      }))
                    }} className="bo-input" />
                    {linkedRecipe && (
                      <div style={{ fontSize:12, color:"var(--ink4)", marginTop:4 }}>
                        → produces {editData.actual_yield ?? 0} {editData.yield_unit||linkedRecipe.yield_unit||""}
                      </div>
                    )}
                  </div>
                  <div style={{ borderTop:"1px solid var(--surface3)", paddingTop:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <label className="bo-label" style={{ marginBottom:0, fontSize:13, fontWeight:800, color:"var(--ink1)" }}>Ingredients Used</label>
                      <button onClick={()=>setEditData(d=>({ ...d, ingredients_used:[...(d.ingredients_used||[]), { ingredient_id:"", name:"", qty:0, unit:"gr" }] }))}
                        className="bo-btn bo-btn-ghost bo-btn-sm" style={{ fontSize:12 }}>+ Add Ingredient</button>
                    </div>
                    {(editData.ingredients_used||[]).map((u,i)=>(
                      <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 80px 60px 28px", gap:8, marginBottom:8, alignItems:"center" }}>
                        {u.ingredient_id ? (
                          <div style={{ fontSize:13, fontWeight:600, padding:"8px 4px" }}>{u.name}</div>
                        ) : (
                          <IngSearchEdit ingredients={ingredients} onSelect={ing=>{
                            setEditData(d=>({ ...d, ingredients_used:d.ingredients_used.map((x,idx)=>idx===i?{...x,ingredient_id:ing.id,name:ing.name,unit:ing.unit||"gr"}:x) }))
                          }} />
                        )}
                        <input type="number" value={u.qty} onChange={e=>{
                          setEditData(d=>({ ...d, ingredients_used:d.ingredients_used.map((x,idx)=>idx===i?{...x,qty:e.target.value}:x) }))
                        }} className="bo-input" style={{ fontSize:13 }} />
                        <span style={{ fontSize:12, color:"var(--ink4)" }}>{u.unit}</span>
                        <button onClick={()=>setEditData(d=>({ ...d, ingredients_used:d.ingredients_used.filter((_,idx)=>idx!==i) }))}
                          style={{ background:"none", border:"none", color:"var(--red)", fontSize:18, cursor:"pointer", padding:0 }}>x</button>
                      </div>
                    ))}
                  </div>
                </div>
                )
              })()}
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setEditModal(null)} className="bo-btn bo-btn-ghost" disabled={processing}>Cancel</button>
              <button onClick={saveEdit} className="bo-btn bo-btn-primary" disabled={processing}>{processing ? "Saving..." : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom confirm modal — replaces window.confirm() so Chrome can't silently suppress it */}
      {confirmState && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&resolveConfirm(false)}>
          <div className="bo-modal" style={{ maxWidth:420 }}>
            <div className="bo-modal-body" style={{ padding:"24px 24px 8px" }}>
              <div style={{ fontSize:14, fontWeight:600, whiteSpace:"pre-line", lineHeight:1.5 }}>{confirmState.message}</div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>resolveConfirm(false)} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={()=>resolveConfirm(true)} className="bo-btn bo-btn-primary">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
