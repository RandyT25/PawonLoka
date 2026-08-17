import { useState, useEffect, useMemo, Fragment } from "react"
import { supabase } from "../../lib/supabase"
import ClosingReport from "./ClosingReport"
import CashLog from "./CashLog"
import { exportPDF, exportExcel } from "./exportUtils"

const fmt = n => "Rp " + Number(n||0).toLocaleString("id-ID")
const EXPENSE_CATEGORIES = [
  { id:"bahan_baku",      label:"Bahan Baku",        icon:"🥩", auto:true  },
  { id:"kitchen",         label:"Kitchen Supplies",   icon:"🍳", auto:false },
  { id:"bar",             label:"Bar Supplies",        icon:"🧃", auto:false },
  { id:"floor_cleaning",  label:"Floor & Cleaning",   icon:"🧹", auto:false },
  { id:"gas_utilities",   label:"Gas & Utilities",    icon:"🔥", auto:false },
  { id:"pln",             label:"PLN (Listrik)",      icon:"⚡", auto:false },
  { id:"pdam",            label:"PDAM (Air)",         icon:"💧", auto:false },
  { id:"wifi",            label:"WiFi / Internet",    icon:"📶", auto:false },
  { id:"ipl",             label:"IPL",                icon:"🏢", auto:false },
  // Staff Meal used to be a manual-only bucket that nothing ever actually populated (staff
  // submit meal reports through Staff Reports, but that data never reached here) — now
  // auto-computed live from staff_consumption, same as Waste from waste_records and Stock
  // Variance from stock_opname. All three follow the existing bahan_baku/gaji pattern:
  // period-scoped live query, no manual double-entry required.
  { id:"staff_meal",      label:"Staff Meal",         icon:"🍱", auto:true  },
  { id:"gaji",            label:"Gaji Karyawan",      icon:"👥", auto:true  },
  { id:"waste",           label:"Waste",              icon:"🗑️", auto:true  },
  { id:"stock_variance",  label:"Selisih Stok Opname", icon:"📉", auto:true  },
  { id:"kas_bon",         label:"Kas Bon",            icon:"💸", auto:false },
  { id:"sewa",            label:"Sewa & Fasilitas",   icon:"🏠", auto:false },
  { id:"marketing",       label:"Marketing",           icon:"📣", auto:false },
  { id:"lain",            label:"Lain-lain",           icon:"📦", auto:false },
]

// Chart of Accounts is a free-form account list (Akun tab); EXPENSE_CATEGORIES is the
// fixed set of buckets the Laba Rugi breakdown actually totals. Manual "+ Pengeluaran"
// entries pick a COA account, not a P&L category, so without this map every manual
// entry's cat lands on a name (e.g. "Biaya IPL") that no P&L breakdown row matches —
// the amount still counts in Total Beban, but its own category row shows Rp 0. Falls
// back to "lain" for any COA account with no P&L equivalent (Biaya POS, Sumbangan, etc).
const COA_NAME_TO_EXPENSE_CAT = {
  "Biaya Gaji":            "gaji",
  "Biaya Sewa":            "sewa",
  "Biaya Listrik":         "pln",
  "Biaya Air":             "pdam",
  "Biaya Gas":             "gas_utilities",
  "Biaya Internet / Wifi": "wifi",
  "Biaya IPL":             "ipl",
  "Kitchen Supply":        "kitchen",
  "Cleaning Supply":       "floor_cleaning",
  "Floor Supply":          "floor_cleaning",
  "Staff Meal":            "staff_meal",
}

// Maps an ingredient's category (from Inventory > Ingredients/Supplies) to a P&L
// expense-category id, so Purchase Order spending can be split by what was actually
// bought instead of always landing in one flat "Bahan Baku" bucket. Only non-food
// "supply" categories are listed — any category not listed here (every real food/
// ingredient category, or an ingredient that's missing/deleted) falls through to
// "bahan_baku", the existing raw-ingredient bucket.
// "Packaging" is deliberately left out of this map — it can now be attached to a recipe
// (RecipeEditor's IngSearch) and flow through products.cogs -> orders.cogs at time of
// sale, same as raw ingredients. Leaving it mapped to an opex bucket here would double-count
// it (once as opex at purchase time, again as COGS at sale time) — so it falls through to
// the "bahan_baku" default below, which nonFoodPOTotal already excludes for that exact reason.
const SUPPLY_CATEGORY_TO_EXPENSE_CAT = {
  "Kitchen Tools & Utensils": "kitchen",
  "Charcoal":                 "kitchen",
  "Disposables":              "kitchen",
  "Cleaning & Sanitation":    "floor_cleaning",
  "Trash & Vacuum Bags":      "floor_cleaning",
  "Office & Stationery":      "lain",
  "Gas & Utilities":          "gas_utilities",
  "Other Supplies":           "lain",
}

const STAFF_LIST  = ["Claudy","Nita","Aisyah","Mahes","Meldy","Oji","Yudi","Alin"]

// Generate last 24 months up to current month — never hardcode year
const MONTHS = (() => {
  const now = new Date(), list = []
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    list.push(d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0"))
  }
  return list
})()

function StatCard({label,value,sub,color="#0052CC",big=false}) {
  return (
    <div style={{ background:"#fff",borderRadius:12,padding:"16px 20px",border:"1px solid #f0f0f0",boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize:11,fontWeight:700,color:"#6B778C",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:big?28:22,fontWeight:900,color,letterSpacing:"-0.5px" }}>{value}</div>
      {sub&&<div style={{ fontSize:11,color:"#6B778C",marginTop:4 }}>{sub}</div>}
    </div>
  )
}

export default function Accounting() {
  const [tab,          setTab]          = useState("overview")
  const [period,       setPeriod]       = useState(() => new Date().toISOString().slice(0,7))
  const [orders,       setOrders]       = useState([])
  const [expenses,     setExpenses]     = useState([])
  const [pos,          setPos]          = useState([]) // purchase orders
  const [ingredients,  setIngredients]  = useState([])
  const [staff,        setStaff]        = useState([])
  const [kasBonList,   setKasBonList]   = useState([])
  const [wasteRecords,     setWasteRecords]     = useState([])
  const [staffConsumption, setStaffConsumption] = useState([])
  const [stockOpnameList,  setStockOpnameList]  = useState([])
  const [openingBal,   setOpeningBal]   = useState(() => ({ id: new Date().toISOString().slice(0,7), amount:300000 }))
  const [loading,      setLoading]      = useState(true)
  const [expModal,     setExpModal]     = useState(false)
  const [expEditId,    setExpEditId]    = useState(null)
  const [kasBonModal,  setKasBonModal]  = useState(false)
  const [kbExpanded,   setKbExpanded]   = useState({})
  const [expForm,      setExpForm]      = useState({ date:new Date().toISOString().slice(0,10), category:"kitchen", description:"", amount:"", payment_method:"Cash", notes:"" })
  const [expDetailModal, setExpDetailModal] = useState(null)
  const [poDetailModal,  setPoDetailModal]  = useState(null)
  const [expCoa,       setExpCoa]       = useState([])
  const [expLines,     setExpLines]     = useState([{ coa_id:"", coa_name:"", description:"", amount:"" }])
  const [expAkunAsal,  setExpAkunAsal]  = useState("")
  const [expTransNo,   setExpTransNo]   = useState("")
  const [expTime,      setExpTime]      = useState("08:00")
  const [expCoaSearch, setExpCoaSearch] = useState("")
  const [showCoaPicker, setShowCoaPicker] = useState(false)
  const [coaPickerSearch, setCoaPickerSearch] = useState("")
  const [coaPickerSelected, setCoaPickerSelected] = useState(new Set())
  const [kbForm,       setKbForm]       = useState({ staff_name:"Nita", amount:"", date:new Date().toISOString().slice(0,10), reason:"", notes:"" })
  const [saving,       setSaving]       = useState(false)
  const [catFilter,    setCatFilter]    = useState("all")
  const [expSearch,    setExpSearch]    = useState("")
  const [coa,          setCoa]          = useState([])
  const [coaLoading,   setCoaLoading]   = useState(false)
  const [coaModal,     setCoaModal]     = useState(false)
  const [coaForm,      setCoaForm]      = useState({ code:"", name:"", type:"asset", category:"", sort_order:0 })
  const [coaEdit,      setCoaEdit]      = useState(null)
  const [coaSaving,    setCoaSaving]    = useState(false)
  const [coaSearch,    setCoaSearch]    = useState("")
  const [showCoaLegend,setShowCoaLegend]= useState(false)

  useEffect(() => { load() }, [period])
  useEffect(() => { if (tab === "akun") loadCoa() }, [tab])

  async function saveCoa() {
    setCoaSaving(true)
    const payload = {
      code: coaForm.code.trim(),
      name: coaForm.name.trim(),
      type: coaForm.type,
      category: coaForm.category.trim(),
      sort_order: parseInt(coaForm.sort_order) || 0,
      is_active: true
    }
    if (coaEdit) {
      await supabase.from("chart_of_accounts").update(payload).eq("id", coaEdit.id)
    } else {
      await supabase.from("chart_of_accounts").insert(payload)
    }
    setCoaSaving(false)
    setCoaModal(false)
    setCoaEdit(null)
    setCoaForm({ code:"", name:"", type:"asset", category:"", sort_order:0 })
    loadCoa()
  }

  async function toggleCoaActive(item) {
    await supabase.from("chart_of_accounts").update({ is_active: !item.is_active }).eq("id", item.id)
    loadCoa()
  }

  async function deleteCoa(id) {
    if (!window.confirm("Hapus akun ini?")) return
    await supabase.from("chart_of_accounts").delete().eq("id", id)
    loadCoa()
  }
  async function loadCoa() {
    setCoaLoading(true)
    const { data } = await supabase.from("chart_of_accounts").select("*").order("sort_order")
    setCoa(data || [])
    setCoaLoading(false)
  }
  async function load() {
    setLoading(true)
    const [y,m] = period.split("-")
    const from = `${y}-${m}-01`
    // Never route the last-day-of-month calc through toISOString() — it converts to
    // UTC and rolls the date back by one for any timezone ahead of UTC (e.g. WIB/WITA),
    // which silently excluded the last day of every month from every query below.
    const lastDay = new Date(parseInt(y), parseInt(m), 0)
    const to = `${lastDay.getFullYear()}-${String(lastDay.getMonth()+1).padStart(2,"0")}-${String(lastDay.getDate()).padStart(2,"0")}`

    const [ordRes, expRes, poRes, staffRes, kbRes, obRes, ingRes, wasteRes, consumeRes, opnameRes] = await Promise.all([
      supabase.from("orders").select("*").eq("status","Paid").gte("created_at",from+"T00:00:00+08:00").lte("created_at",to+"T23:59:59+08:00"),
      supabase.from("expenses").select("*").gte("date",from).lte("date",to).order("date",{ascending:false}),
      supabase.from("purchase_orders").select("*").eq("status","Paid").gte("date",from).lte("date",to),
      supabase.from("staff").select("*"),
      supabase.from("kas_bon").select("*").order("date",{ascending:false}),
      supabase.from("opening_balance").select("*").eq("id",period).maybeSingle(),
      supabase.from("ingredients").select("id,category"),
      supabase.from("waste_records").select("*").gte("date",from).lte("date",to),
      supabase.from("staff_consumption").select("*").gte("date",from).lte("date",to),
      supabase.from("stock_opname").select("id,date,total_variance").gte("date",from).lte("date",to),
    ])

    setOrders(ordRes.data||[])
    setExpenses(expRes.data||[])
    setPos(poRes.data||[])
    setStaff(staffRes.data||[])
    setKasBonList(kbRes.data||[])
    setOpeningBal(obRes.data || { id:period, amount:300000 })
    setIngredients(ingRes.data||[])
    setWasteRecords(wasteRes.data||[])
    setStaffConsumption(consumeRes.data||[])
    setStockOpnameList(opnameRes.data||[])
    setLoading(false)
  }

  // ── CALCULATED FINANCIALS ─────────────────────────────
  const grossRevenue   = orders.reduce((a,o)=>a+(o.total||0),0)
  const totalDiscount  = orders.reduce((a,o)=>a+(o.discount||0),0)
  const netRevenue     = grossRevenue - totalDiscount
  const totalCOGS      = orders.reduce((a,o)=>a+(o.cogs||0),0)
  const grossProfit    = netRevenue - totalCOGS
  const grossMargin    = netRevenue>0 ? Math.round((grossProfit/netRevenue)*100) : 0

  // Auto expenses from POs
  const poTotal = pos.reduce((a,p)=>a+(p.total||0),0)

  // Split PO spending by what was actually purchased (via each line item's ingredient
  // category), instead of always lumping every PO into one flat "Bahan Baku" bucket.
  // Falls back to "bahan_baku" for any line item whose ingredient is missing/deleted,
  // or whose category has no mapping (i.e. every real food/ingredient category).
  const ingredientCatById = useMemo(() => {
    const m = {}
    ingredients.forEach(i => { m[i.id] = i.category })
    return m
  }, [ingredients])

  const poByCategory = useMemo(() => {
    const buckets = {}
    pos.forEach(p => {
      const items = p.items || p.po_items || []
      items.forEach(item => {
        const ingCat = ingredientCatById[item.ingredient_id]
        const expCat = SUPPLY_CATEGORY_TO_EXPENSE_CAT[ingCat] || "bahan_baku"
        buckets[expCat] = (buckets[expCat]||0) + (item.total_cost||0)
      })
    })
    return buckets
  }, [pos, ingredientCatById])

  const bahanBakuPO = poByCategory["bahan_baku"] || 0

  // Raw-ingredient PO spend is already recognized in the P&L via totalCOGS (the recipe
  // cost of items actually sold, itself derived from the same PO-driven WAC) — counting
  // the full purchase amount again here would double-count it. Only non-food PO spend
  // (kitchen/bar supplies, cleaning, gas/utilities) is a genuine operating expense.
  const nonFoodPOTotal = poTotal - bahanBakuPO

  // Per-PO category breakdown, for the itemized Pengeluaran listing — most POs are
  // single-category in practice (one row), but a PO spanning multiple categories
  // renders as one row per category so the catFilter pills work correctly against it.
  function poCategoryBreakdown(po) {
    const items = po.items || po.po_items || []
    const buckets = {}
    items.forEach(item => {
      const ingCat = ingredientCatById[item.ingredient_id]
      const expCat = SUPPLY_CATEGORY_TO_EXPENSE_CAT[ingCat] || "bahan_baku"
      buckets[expCat] = (buckets[expCat]||0) + (item.total_cost||0)
    })
    return Object.entries(buckets).map(([catId,amount]) => ({ catId, amount }))
  }

  // Auto salary expense — active staff only; a departed/inactive staff member's salary
  // shouldn't keep hitting every future period's P&L.
  const salaryTotal = staff.filter(s=>s.active!==false).reduce((a,s)=>a+(s.salary||0),0)

  // The kas_bon fetch in load() is deliberately NOT date-filtered — payroll's
  // outstanding-balance deduction below (kasBonList.filter(...status==="outstanding"))
  // needs to see advances from prior periods too, not just the selected month. But the
  // Kas Bon TAB's own display should still scope to the selected period like every other
  // tab on this page, so it doesn't show every kas bon ever taken regardless of the
  // month dropdown.
  const kasBonInPeriod = useMemo(() => kasBonList.filter(k => k.date && k.date.startsWith(period)), [kasBonList, period])

  // Outstanding kas bon (for this period's display only — payroll math above uses the
  // full unfiltered kasBonList directly)
  const kbOutstanding = kasBonInPeriod.filter(k=>k.status==="outstanding").reduce((a,k)=>a+(k.amount||0),0)

  // Group kas bon entries by staff so a staff with multiple advances shows one
  // summary row (total + count) instead of scattered individual rows — expandable
  // to reveal the individual dated entries. Staff with only one entry in the period
  // don't need a group at all; they render as a plain row same as before.
  const kbGroups = useMemo(() => {
    const byStaff = {}
    kasBonInPeriod.forEach(k => {
      if (!byStaff[k.staff_name]) byStaff[k.staff_name] = []
      byStaff[k.staff_name].push(k)
    })
    return Object.entries(byStaff)
      .map(([staff_name, entries]) => ({
        staff_name,
        entries: [...entries].sort((a,b)=>b.date.localeCompare(a.date)),
        total: entries.reduce((a,k)=>a+(k.amount||0),0),
      }))
      .sort((a,b)=>b.total-a.total)
  }, [kasBonInPeriod])

  // Manual expenses by category
  const manualExpenses = expenses.filter(e=>e.auto_source!=="po"&&e.auto_source!=="salary")
  const manualTotal    = manualExpenses.reduce((a,e)=>a+(e.amount||0),0)

  // Auto opex from Staff Reports approvals — mirrors the PO/salary pattern: live period-scoped
  // sums, not manual expense entry, so a manager doesn't have to re-log what staff already
  // submitted and got approved.
  const wasteTotal    = wasteRecords.reduce((a,w)=>a+(w.cost||0),0)
  const staffMealTotal = staffConsumption.reduce((a,c)=>a+(c.cost||0),0)
  // Only net shrinkage (counted less than expected) is a real cost — a net-positive opname
  // (counted more than expected) isn't "found money" to record as negative expense.
  const stockVarianceTotal = stockOpnameList.reduce((a,o)=>a+Math.max(0,-(o.total_variance||0)),0)

  const totalOpex  = nonFoodPOTotal + salaryTotal + manualTotal + wasteTotal + staffMealTotal + stockVarianceTotal
  const netProfit  = grossProfit - totalOpex
  const netMargin  = netRevenue>0 ? Math.round((netProfit/netRevenue)*100) : 0

  // Cash flow
  const cashIn   = orders.filter(o=>o.payment==="Cash").reduce((a,o)=>a+(o.total||0),0)
  const qrisIn   = orders.filter(o=>o.payment!=="Cash").reduce((a,o)=>a+(o.total||0),0)
  const cashOut  = poTotal + salaryTotal + manualExpenses.filter(e=>e.payment_method==="Cash").reduce((a,e)=>a+(e.amount||0),0)
  const netCash  = (openingBal.amount||0) + cashIn - cashOut

  // A single "+ Pengeluaran" transaction can cover multiple accounts (e.g. one BKK paying
  // both Listrik and IPL) — expenses.cat only ever reflects the FIRST line's account, so
  // any category math keyed off e.cat silently dumps a multi-line transaction's entire
  // amount onto just one category. This explodes a transaction into one entry per actual
  // line item, each attributed to its own account's category — mirrors poCategoryBreakdown
  // on the PO side, which already splits multi-category purchases correctly.
  function expLineCategories(e) {
    const lines = e.lines?.length ? e.lines : [{ coa_name:e.cat, description:e.description, amount:e.amount }]
    return lines.map(l => ({
      catId: COA_NAME_TO_EXPENSE_CAT[l.coa_name] || (EXPENSE_CATEGORIES.some(c=>c.id===l.coa_name) ? l.coa_name : "lain"),
      amount: parseFloat(l.amount)||0,
      description: l.description,
      coa_name: l.coa_name,
    }))
  }

  // Expenses by category for display
  function catTotal(catId) {
    const manual = manualExpenses.reduce((sum,e) =>
      sum + expLineCategories(e).filter(l=>l.catId===catId).reduce((a,l)=>a+l.amount,0), 0)
    return manual + (poByCategory[catId]||0)
  }

  async function loadExpCoa() {
    const { data } = await supabase.from("chart_of_accounts")
      .select("*").eq("is_active", true)
      .order("sort_order")
    setExpCoa(data || [])
  }

  async function genBkkNo() {
    const prefix = "BKK-"
    const { data } = await supabase.from("expenses")
      .select("transaction_no")
      .like("transaction_no", prefix+"%")
      .order("transaction_no", { ascending:false })
      .limit(1)
    const last = data?.[0]?.transaction_no
    const seq = last ? parseInt(last.replace(prefix,""))+1 : 1
    return prefix + String(seq).padStart(5,"0")
  }

  async function openNewExpense() {
    await loadExpCoa()
    setExpEditId(null)
    const txNo = await genBkkNo()
    setExpTransNo(txNo)
    setExpAkunAsal("")
    setExpTime(new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}))
    setExpLines([{ coa_id:"", coa_name:"", description:"", amount:"" }])
    setExpForm(f=>({...f, date:new Date().toISOString().slice(0,10), notes:"" }))
    setExpModal(true)
  }

  async function openExpDetail(e) {
    await loadExpCoa()
    const lines = e.lines || [{ coa_id:"", coa_name:e.cat||"", description:e.description||"", amount:e.amount||0 }]
    setExpTransNo(e.transaction_no || "—")
    setExpAkunAsal(e.akun_asal || "")
    setExpTime(e.time || "—")
    setExpLines(lines)
    setExpForm(f=>({...f, date:e.date||"", notes:e.notes||"" }))
    setExpDetailModal(e)
  }

  // Opens the same "Tambah Pengeluaran" form pre-filled for editing an existing
  // manual entry (openExpDetail already loads all the same fields for the read-only
  // view — this just also flags which row to UPDATE instead of INSERT on save).
  async function openEditExpense(e) {
    await loadExpCoa()
    setExpEditId(e.id)
    setExpTransNo(e.transaction_no || "")
    setExpAkunAsal(e.akun_asal || "")
    setExpTime(e.time || new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}))
    setExpLines(e.lines || [{ coa_id:"", coa_name:e.cat||"", description:e.description||"", amount:e.amount||0 }])
    setExpForm(f=>({...f, date:e.date||"", notes:e.notes||"" }))
    setExpDetailModal(null)
    setExpModal(true)
  }

  async function saveExpense() {
    const validLines = expLines.filter(l => l.amount && parseFloat(l.amount) > 0)
    if (validLines.length === 0) { alert("Tambahkan minimal satu detail pengeluaran"); return }
    setSaving(true)
    const baseDescription = expLines.map(l=>l.description).filter(Boolean).join(", ") || "Pengeluaran"
    const payload = {
      transaction_no: expTransNo,
      date: expForm.date,
      time: expTime,
      akun_asal: expAkunAsal,
      cat: COA_NAME_TO_EXPENSE_CAT[expLines[0]?.coa_name] || "lain",
      description: expForm.notes ? baseDescription + " — " + expForm.notes : baseDescription,
      amount: expLines.reduce((a,l)=>a+(parseFloat(l.amount)||0),0),
      payment_method: expForm.payment_method,
      lines: expLines.filter(l=>l.amount&&parseFloat(l.amount)>0),
    }
    const { error } = expEditId
      ? await supabase.from("expenses").update(payload).eq("id", expEditId)
      : await supabase.from("expenses").insert({ id: Date.now(), ...payload })
    setSaving(false)
    if (error) { alert("Gagal menyimpan pengeluaran: " + error.message); return }
    setExpModal(false)
    setExpEditId(null)
    setExpForm({ date:new Date().toISOString().slice(0,10), category:"kitchen", description:"", amount:"", payment_method:"Cash", notes:"" })
    await load()
  }

  async function deleteExpense(id) {
    if (!confirm("Delete expense?")) return
    await supabase.from("expenses").delete().eq("id",id)
    setExpenses(prev=>prev.filter(e=>e.id!==id))
  }

  async function saveKasBon() {
    if (!kbForm.amount||!kbForm.reason) return
    setSaving(true)
    await supabase.from("kas_bon").insert({
      id:"KB-"+Date.now(),
      staff_name:kbForm.staff_name,
      amount:parseFloat(kbForm.amount)||0,
      date:kbForm.date,
      reason:kbForm.reason,
      notes:kbForm.notes,
      status:"outstanding"
    })
    setKasBonModal(false)
    setKbForm({ staff_name:"Nita", amount:"", date:new Date().toISOString().slice(0,10), reason:"", notes:"" })
    await load()
    setSaving(false)
  }

  async function markKasBonDeducted(id) {
    await supabase.from("kas_bon").update({ status:"deducted", deducted_date:new Date().toISOString().slice(0,10) }).eq("id",id)
    setKasBonList(prev=>prev.map(k=>k.id===id?{...k,status:"deducted"}:k))
  }

  async function markKasBonDeductedBulk(ids) {
    if (ids.length === 0) return
    if (!window.confirm("Tandai " + ids.length + " kas bon sebagai dipotong?")) return
    await supabase.from("kas_bon").update({ status:"deducted", deducted_date:new Date().toISOString().slice(0,10) }).in("id", ids)
    setKasBonList(prev => prev.map(k => ids.includes(k.id) ? {...k, status:"deducted"} : k))
  }

  function toggleKbExpand(staffName) { setKbExpanded(e => ({ ...e, [staffName]: !e[staffName] })) }

  async function saveOpeningBal(amount) {
    await supabase.from("opening_balance").upsert({ id:period, amount, updated_at:new Date().toISOString() })
    setOpeningBal(p=>({...p,amount}))
  }

  function handleExportPdf() {
    const plRows = [
      ["Penjualan Kotor", fmt(grossRevenue)],
      ["Diskon", "(" + fmt(totalDiscount) + ")"],
      ["Penjualan Bersih", fmt(netRevenue)],
      ["HPP / COGS", fmt(totalCOGS)],
      ["Laba Kotor", fmt(grossProfit) + " (" + grossMargin + "%)"],
      ["Bahan Baku (PO) — info, sudah di COGS", fmt(bahanBakuPO)],
      ["Gaji Karyawan", fmt(salaryTotal)],
      ["Staff Meal", fmt(staffMealTotal)],
      ["Waste", fmt(wasteTotal)],
      ["Selisih Stok Opname", fmt(stockVarianceTotal)],
      ...EXPENSE_CATEGORIES.filter(c=>!c.auto).map(c=>[c.label, fmt(catTotal(c.id))]),
      ["Total Beban", fmt(totalOpex)],
      ["Laba Bersih", fmt(netProfit) + " (" + netMargin + "%)"],
    ]
    const cashflowRows = [
      ["Opening Balance", fmt(openingBal.amount||0)],
      ["Cash In", fmt(cashIn+qrisIn)],
      ["Cash Out", fmt(cashOut)],
      ["Saldo Akhir", fmt(netCash)],
    ]
    exportPDF({
      title: "Laporan Laba Rugi", periodLabel: period,
      filename: `pawonloka-pl-${period}.pdf`,
      tables: [
        { label:"Laba Rugi", head:["Item","Jumlah"], body:plRows },
        { label:"Arus Kas", head:["Item","Jumlah"], body:cashflowRows },
        { label:"Detail Pengeluaran", head:["Tanggal","Kategori","Deskripsi","Jumlah"],
          body: manualExpenses.flatMap(e=>expLineCategories(e).map(l=>[e.date, l.catId, l.description||e.description, fmt(l.amount)])) },
        { label:"Purchase Orders", head:["Tanggal","Supplier","Invoice","Total"],
          body: pos.map(p=>[p.date, p.supplierName||p.supplier_name, p.invoiceNo||p.invoice_no, fmt(p.total)]) },
      ],
    })
  }

  function handleExportExcel() {
    exportExcel({
      title: "Laporan Laba Rugi", periodLabel: period,
      filename: `pawonloka-accounting-${period}.xlsx`,
      sheets: [
        {
          name: "Laba Rugi",
          columns: ["Item","Jumlah"],
          colWidths: [26,20],
          rows: [
            ["Pendapatan Kotor", grossRevenue],
            ["Diskon", -totalDiscount],
            ["Pendapatan Bersih", netRevenue],
            ["COGS", totalCOGS],
            ["Laba Kotor", grossProfit],
            ["Bahan Baku (PO) — info, sudah di COGS", bahanBakuPO],
            ["Gaji Karyawan", salaryTotal],
            ["Staff Meal", staffMealTotal],
            ["Waste", wasteTotal],
            ["Selisih Stok Opname", stockVarianceTotal],
            ...EXPENSE_CATEGORIES.filter(c=>!c.auto).map(c=>[c.label, catTotal(c.id)]),
            ["Total Beban", totalOpex],
            ["Laba Bersih", netProfit],
            ["Net Margin", netMargin+"%"],
          ],
        },
        {
          name: "Arus Kas",
          columns: ["Item","Jumlah"],
          colWidths: [26,20],
          rows: [
            ["Opening Balance", openingBal.amount||0],
            ["Cash In", cashIn+qrisIn],
            ["Cash Out", cashOut],
            ["Saldo Akhir", netCash],
          ],
        },
        {
          name: "Pengeluaran",
          columns: ["Tanggal","Kategori","Deskripsi","Jumlah"],
          colWidths: [14,18,28,18],
          rows: manualExpenses.flatMap(e=>expLineCategories(e).map(l=>[e.date, l.catId, l.description||e.description, l.amount])),
        },
        {
          name: "Purchase Orders",
          columns: ["Tanggal","Supplier","Invoice","Total"],
          colWidths: [14,20,18,18],
          rows: pos.map(p=>[p.date, p.supplierName||p.supplier_name, p.invoiceNo||p.invoice_no, p.total]),
        },
      ],
    })
  }

  // Matches a manual expense transaction against the search box (whole-transaction
  // description, not per-line — searching is about finding a transaction).
  const searchedExp = manualExpenses.filter(e => !expSearch || e.description?.toLowerCase().includes(expSearch.toLowerCase()))

  // Auto (PO) rows and manual rows used to render as two separate, independently-unsorted
  // blocks (POs have no .order() on their query, manual rows were sorted but appended
  // after every PO row regardless of date) — combine + sort once so "Tanggal" is actually
  // chronological across both sources, most recent first. Manual expenses are exploded
  // per line item (see expLineCategories) so a multi-account transaction shows — and
  // filters — correctly per account, not lumped under just its first line.
  const combinedExpRows = useMemo(() => {
    if (catFilter === "gaji") return []
    const rows = []
    pos.forEach(p => {
      poCategoryBreakdown(p)
        .filter(({catId}) => catFilter==="all" || catFilter===catId)
        .forEach(({catId, amount}) => rows.push({ type:"po", date:p.date, key:p.id+"-"+catId, po:p, catId, amount }))
    })
    searchedExp.forEach(e => {
      expLineCategories(e).forEach((line, i) => {
        if (catFilter!=="all" && line.catId!==catFilter) return
        rows.push({ type:"manual", date:e.date, key:e.id+"-"+i, exp:e, line, isFirstLine:i===0 })
      })
    })
    return rows.sort((a,b) => (b.date||"").localeCompare(a.date||""))
  }, [pos, searchedExp, catFilter])

  if (loading) return <div style={{ padding:40,textAlign:"center",color:"var(--ink5)" }}>Loading...</div>

  return (
    <div>
      {/* Top bar */}
      <div className="acc-tabs" style={{ display:"flex",gap:6,marginBottom:16,alignItems:"center" }}>
        {[["overview","📊 Overview"],["pl","💰 Laba Rugi"],["expenses","💸 Pengeluaran"],["cashflow","🏦 Arus Kas"],["kasbon","📋 Kas Bon"],["closing","🧾 Cashier Closing"],["cashlog","💵 Kas Cashier"],["akun","Akun"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} className={"bo-btn bo-btn-sm "+(tab===t?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
        ))}
      </div>
      <div style={{ display:"flex",gap:8,marginBottom:16,alignItems:"center" }} className="acc-toolbar">
        <select value={period} onChange={e=>setPeriod(e.target.value)} className="bo-select" style={{ flex:1,fontSize:13 }}>
          {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={handleExportExcel} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ flexShrink:0 }}>⬇ Excel</button>
        <button onClick={handleExportPdf} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ flexShrink:0 }}>⬇ PDF</button>
      </div>

      {/* OVERVIEW */}
      {tab==="overview" && (
        <>
          {/* Row 1: Total Orders + Cash In */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10 }}>
            <StatCard label="Total Orders" value={orders.length} color="#0052CC" />
            <StatCard label="Cash In" value={fmt(cashIn+qrisIn)} color="#00875A" />
          </div>
          {/* Row 2: Pendapatan Bersih + Total COGS */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10 }} className="acc-overview-desktop">
            <StatCard label="Pendapatan Bersih" value={fmt(netRevenue)} color="#0052CC" />
            <StatCard label="Total COGS" value={fmt(totalCOGS)} color="#6B778C" />
          </div>
          <div className="acc-overview-mobile">
            <StatCard label="Pendapatan Bersih" value={fmt(netRevenue)} color="#0052CC" />
            <StatCard label="Total COGS" value={fmt(totalCOGS)} color="#6B778C" />
          </div>
          {/* Row 3: Laba Kotor + Total Beban Ops */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10 }} className="acc-overview-desktop">
            <StatCard label="Laba Kotor" value={fmt(grossProfit)} sub={"Margin "+grossMargin+"%"} color={grossProfit>=0?"#00875A":"#DE350B"} />
            <StatCard label="Total Beban Ops" value={fmt(totalOpex)} color="#FF8B00" />
          </div>
          <div className="acc-overview-mobile">
            <StatCard label="Laba Kotor" value={fmt(grossProfit)} sub={"Margin "+grossMargin+"%"} color={grossProfit>=0?"#00875A":"#DE350B"} />
            <StatCard label="Total Beban Ops" value={fmt(totalOpex)} color="#FF8B00" />
          </div>
          {/* Row 4: Laba Bersih + Saldo Akhir */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16 }} className="acc-overview-desktop">
            <StatCard label="Laba Bersih" value={fmt(netProfit)} sub={"Net "+netMargin+"%"} color={netProfit>=0?"#00875A":"#DE350B"} big />
            <StatCard label="Saldo Akhir" value={fmt(netCash)} color={netCash>=0?"#00875A":"#DE350B"} big />
          </div>
          <div className="acc-overview-mobile">
            <StatCard label="Laba Bersih" value={fmt(netProfit)} sub={"Net "+netMargin+"%"} color={netProfit>=0?"#00875A":"#DE350B"} big />
            <StatCard label="Saldo Akhir" value={fmt(netCash)} color={netCash>=0?"#00875A":"#DE350B"} big />
          </div>

          {/* P&L Summary */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }} className="acc-summary-grid">
            <div className="bo-card">
              <div className="bo-card-title">Ringkasan Laba Rugi</div>
              {[
                ["Pendapatan Kotor",grossRevenue,"#0052CC"],
                ["Diskon",-totalDiscount,"#DE350B"],
                ["Pendapatan Bersih",netRevenue,"#0052CC"],
                ["COGS",-totalCOGS,"#6B778C"],
                ["Laba Kotor",grossProfit,grossProfit>=0?"#00875A":"#DE350B"],
                ["Beban Operasional",-totalOpex,"#FF8B00"],
                ["LABA BERSIH",netProfit,netProfit>=0?"#00875A":"#DE350B"],
              ].map(([l,v,c])=>(
                <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--surface2)",fontSize:13 }}>
                  <span style={{ fontWeight:l==="LABA BERSIH"||l==="Laba Kotor"?800:500,color:"#0A1628" }}>{l}</span>
                  <span style={{ fontWeight:700,color:c }}>{fmt(v)}</span>
                </div>
              ))}
            </div>
            <div className="bo-card">
              <div className="bo-card-title">Beban per Kategori</div>
              {bahanBakuPO>0 && (
                <div style={{ fontSize:11,color:"#6B778C",fontStyle:"italic",marginBottom:10,paddingBottom:10,borderBottom:"1px dashed var(--surface2)" }}>
                  ℹ️ Bahan Baku (PO): {fmt(bahanBakuPO)} — sudah tercermin di COGS, tidak dihitung lagi di sini
                </div>
              )}
              {[
                ["👥 Gaji Karyawan",salaryTotal],
                ["🍱 Staff Meal",staffMealTotal],
                ["🗑️ Waste",wasteTotal],
                ["📉 Selisih Stok Opname",stockVarianceTotal],
                ...EXPENSE_CATEGORIES.filter(c=>!c.auto).map(c=>[c.icon+" "+c.label,catTotal(c.id)]),
              ].filter(([,v])=>v>0).map(([l,v])=>(
                <div key={l} style={{ marginBottom:10 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:3 }}>
                    <span>{l}</span><span style={{ fontWeight:700 }}>{fmt(v)}</span>
                  </div>
                  <div style={{ height:5,background:"#f0f0f0",borderRadius:3,overflow:"hidden" }}>
                    <div style={{ height:5,width:totalOpex>0?(v/totalOpex*100)+"%":"0%",background:"#FF8B00",borderRadius:3 }} />
                  </div>
                </div>
              ))}
              {totalOpex===0&&<div style={{ color:"var(--ink5)",fontSize:13 }}>No expenses recorded yet</div>}
            </div>
          </div>
        </>
      )}

      {/* P&L */}
      {tab==="pl" && (
        <div className="bo-card" style={{ maxWidth:600 }}>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:20 }}>
            <div>
              <div style={{ fontSize:18,fontWeight:900 }}>Laporan Laba Rugi</div>
              <div style={{ fontSize:12,color:"#6B778C" }}>Periode: {period}</div>
            </div>
            <button onClick={exportExcel} className="bo-btn bo-btn-ghost bo-btn-sm">⬇ Export</button>
          </div>

          {/* Revenue */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11,fontWeight:800,color:"#0052CC",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8,paddingBottom:4,borderBottom:"2px solid #0052CC" }}>PENDAPATAN</div>
            {[["Penjualan Kotor",grossRevenue],["Diskon",-totalDiscount],["Penjualan Bersih",netRevenue]].map(([l,v])=>(
              <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:13,borderBottom:"1px solid var(--surface2)",fontWeight:l==="Penjualan Bersih"?800:400 }}>
                <span style={{ paddingLeft:l==="Penjualan Bersih"?0:16,color:l==="Penjualan Bersih"?"#0052CC":"#0A1628" }}>{l}</span>
                <span style={{ color:v<0?"#DE350B":"#0A1628" }}>{fmt(v)}</span>
              </div>
            ))}
          </div>

          {/* HPP */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11,fontWeight:800,color:"#6B778C",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8,paddingBottom:4,borderBottom:"2px solid #6B778C" }}>HARGA POKOK PENJUALAN</div>
            {[["COGS",totalCOGS],["Laba Kotor",grossProfit],["Gross Margin",null]].map(([l,v])=>(
              <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:13,borderBottom:"1px solid var(--surface2)",fontWeight:l==="Laba Kotor"?800:400 }}>
                <span style={{ paddingLeft:l==="Laba Kotor"?0:16 }}>{l}</span>
                <span style={{ color:l==="Laba Kotor"?(grossProfit>=0?"#00875A":"#DE350B"):"#0A1628",fontWeight:l==="Laba Kotor"?800:400 }}>
                  {l==="Gross Margin"?grossMargin+"%":fmt(Math.abs(v))}
                </span>
              </div>
            ))}
            {bahanBakuPO>0 && (
              <div style={{ fontSize:11,color:"#6B778C",fontStyle:"italic",padding:"6px 0" }}>
                ℹ️ Bahan Baku (PO) periode ini: {fmt(bahanBakuPO)} — sudah termasuk di COGS di atas, tidak dihitung ulang di Beban Operasional
              </div>
            )}
          </div>

          {/* Opex */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11,fontWeight:800,color:"#FF8B00",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8,paddingBottom:4,borderBottom:"2px solid #FF8B00" }}>BEBAN OPERASIONAL</div>
            {[
              ["Gaji Karyawan",salaryTotal],
              ["Staff Meal",staffMealTotal],
              ["Waste",wasteTotal],
              ["Selisih Stok Opname",stockVarianceTotal],
              ...EXPENSE_CATEGORIES.filter(c=>!c.auto).map(c=>[c.label,catTotal(c.id)]),
              ["Total Beban",totalOpex],
            ].map(([l,v])=>(
              <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:13,borderBottom:"1px solid var(--surface2)",fontWeight:l==="Total Beban"?800:400 }}>
                <span style={{ paddingLeft:l==="Total Beban"?0:16 }}>{l}</span>
                <span style={{ color:l==="Total Beban"?"#FF8B00":"#0A1628" }}>{fmt(v)}</span>
              </div>
            ))}
          </div>

          {/* Net */}
          <div style={{ padding:"14px 16px",background:netProfit>=0?"#E3FCEF":"#FFEBE6",borderRadius:10,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <span style={{ fontSize:16,fontWeight:900,color:netProfit>=0?"#00875A":"#DE350B" }}>LABA BERSIH</span>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:22,fontWeight:900,color:netProfit>=0?"#00875A":"#DE350B" }}>{fmt(netProfit)}</div>
              <div style={{ fontSize:12,color:netProfit>=0?"#00875A":"#DE350B" }}>Net Margin: {netMargin}%</div>
            </div>
          </div>
        </div>
      )}

      {/* EXPENSES */}
      {tab==="expenses" && (
        <div>
          <div style={{ display:"flex",gap:8,marginBottom:16,alignItems:"center",flexWrap:"wrap" }}>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
              <button onClick={()=>setCatFilter("all")}
                style={{ padding:"8px 16px", borderRadius:20, fontSize:13, fontWeight:700, cursor:"pointer", flexShrink:0,
                  border:"1.5px solid "+(catFilter==="all"?"var(--brand)":"#DFE1E6"),
                  background:catFilter==="all"?"var(--brand)":"#fff",
                  color:catFilter==="all"?"#fff":"#42526E" }}>
                All
              </button>
              {EXPENSE_CATEGORIES.filter(c=>!c.auto).map(c=>(
                <button key={c.id} onClick={()=>setCatFilter(c.id)}
                  style={{ padding:"8px 14px", borderRadius:20, fontSize:13, fontWeight:600, cursor:"pointer", flexShrink:0, whiteSpace:"nowrap",
                    border:"1.5px solid "+(catFilter===c.id?"var(--brand)":"#DFE1E6"),
                    background:catFilter===c.id?"var(--brand)":"#fff",
                    color:catFilter===c.id?"#fff":"#42526E" }}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
            <div style={{ display:"flex",gap:8,marginTop:10 }}>
              <input value={expSearch} onChange={e=>setExpSearch(e.target.value)} placeholder="Search..." className="bo-input" style={{ flex:1 }} />
              <button onClick={openNewExpense} className="bo-btn bo-btn-primary" style={{ flexShrink:0 }}>+ Pengeluaran</button>
            </div>
          </div>

          {/* Auto expenses summary */}
          <div style={{ display:"flex",flexDirection:"column",gap:10,marginBottom:16 }}>
            <div style={{ background:"#fff",border:"1px solid #f0f0f0",borderRadius:12,padding:"14px 16px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#6B778C",marginBottom:4 }}>📦 PEMBELIAN PO — SEMUA KATEGORI (AUTO)</div>
              <div style={{ fontSize:20,fontWeight:900,color:"#FF8B00" }}>{fmt(poTotal)}</div>
              <div style={{ fontSize:11,color:"#6B778C" }}>{pos.length} purchase orders · termasuk {fmt(bahanBakuPO)} bahan baku (sudah di COGS, bukan beban operasional)</div>
            </div>
            <div style={{ background:"#fff",border:"1px solid #f0f0f0",borderRadius:12,padding:"14px 16px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#6B778C",marginBottom:4 }}>👥 GAJI (AUTO)</div>
              <div style={{ fontSize:20,fontWeight:900,color:"#0052CC" }}>{fmt(salaryTotal)}</div>
              <div style={{ fontSize:11,color:"#6B778C" }}>{staff.length} staff members</div>
            </div>
            <div style={{ background:"#fff",border:"1px solid #f0f0f0",borderRadius:12,padding:"14px 16px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#6B778C",marginBottom:4 }}>🍱 STAFF MEAL (AUTO)</div>
              <div style={{ fontSize:20,fontWeight:900,color:"#F59E0B" }}>{fmt(staffMealTotal)}</div>
              <div style={{ fontSize:11,color:"#6B778C" }}>{staffConsumption.length} entries — from approved Staff Reports</div>
            </div>
            <div style={{ background:"#fff",border:"1px solid #f0f0f0",borderRadius:12,padding:"14px 16px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#6B778C",marginBottom:4 }}>🗑️ WASTE (AUTO)</div>
              <div style={{ fontSize:20,fontWeight:900,color:"#DE350B" }}>{fmt(wasteTotal)}</div>
              <div style={{ fontSize:11,color:"#6B778C" }}>{wasteRecords.length} entries — from approved Staff Reports</div>
            </div>
            <div style={{ background:"#fff",border:"1px solid #f0f0f0",borderRadius:12,padding:"14px 16px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#6B778C",marginBottom:4 }}>📉 SELISIH STOK OPNAME (AUTO)</div>
              <div style={{ fontSize:20,fontWeight:900,color:"#DE350B" }}>{fmt(stockVarianceTotal)}</div>
              <div style={{ fontSize:11,color:"#6B778C" }}>{stockOpnameList.length} sesi opname periode ini — hanya selisih kurang (shrinkage)</div>
            </div>
            <div style={{ background:"#fff",border:"1px solid #f0f0f0",borderRadius:12,padding:"14px 16px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#6B778C",marginBottom:4 }}>✏️ MANUAL EXPENSES</div>
              <div style={{ fontSize:20,fontWeight:900,color:"#6554C0" }}>{fmt(manualTotal)}</div>
              <div style={{ fontSize:11,color:"#6B778C" }}>{manualExpenses.length} entries</div>
            </div>
          </div>

          {/* Expense table */}
          <div className="bo-card" style={{ padding:0,overflow:"hidden" }}>
            <table className="bo-table">
              <thead><tr><th>Tanggal</th><th>Kategori</th><th>Deskripsi</th><th>Metode</th><th>Jumlah</th><th></th></tr></thead>
              <tbody>
                {/* Auto + manual, merged into one chronological list (most recent first) */}
                {catFilter==="gaji" ? staff.map(s=>{
                    const kb = kasBonList.filter(k=>k.staff_name===s.name&&k.status==="outstanding").reduce((a,k)=>a+k.amount,0)
                    return (
                      <tr key={s.id}>
                        <td style={{ fontSize:12 }}>{period}</td>
                        <td><span style={{ fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,background:"#EFF6FF",color:"#0052CC" }}>👥 Gaji</span></td>
                        <td style={{ fontWeight:700 }}>{s.name} — {s.role}</td>
                        <td style={{ fontSize:12,color:"#6B778C" }}>Auto</td>
                        <td style={{ fontWeight:700 }}>{fmt(s.salary||0)}{kb>0&&<span style={{ fontSize:11,color:"#DE350B",marginLeft:4 }}>(-{fmt(kb)} KB)</span>}</td>
                        <td style={{ fontSize:11,color:"#6B778C" }}>auto</td>
                      </tr>
                    )
                  }) : combinedExpRows.map(row => {
                    if (row.type === "po") {
                      const cat = EXPENSE_CATEGORIES.find(c=>c.id===row.catId) || { icon:"📦", label:row.catId }
                      const p = row.po
                      return (
                        <tr key={row.key} onClick={()=>setPoDetailModal(p)} style={{ background:"#FFFBF0", cursor:"pointer" }}
                          onMouseEnter={ev=>ev.currentTarget.style.background="#FFF3D6"} onMouseLeave={ev=>ev.currentTarget.style.background="#FFFBF0"}>
                          <td style={{ fontSize:12 }}>{p.date}</td>
                          <td><span style={{ fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,background:"#FFF7E6",color:"#FF8B00" }}>{cat.icon} {cat.label}</span></td>
                          <td style={{ fontSize:12 }}>{p.supplierName||p.supplier_name} — {p.invoiceNo||p.invoice_no||"PO"}</td>
                          <td style={{ fontSize:12,color:"#6B778C" }}>Auto</td>
                          <td style={{ fontWeight:700 }}>{fmt(row.amount)}</td>
                          <td style={{ fontSize:11,color:"#6B778C" }}>auto</td>
                        </tr>
                      )
                    }
                    const e = row.exp
                    const line = row.line
                    const cat = EXPENSE_CATEGORIES.find(c=>c.id===line.catId)||{ icon:"📦",label:line.catId }
                    // A multi-account transaction renders as several rows (one per account,
                    // so each amount lands in its own Laba Rugi category) — but it's still
                    // ONE transaction, so only show one delete action for it, on its first
                    // line, rather than a separate ✕ per row that would each delete the
                    // whole thing (including the other account's amount).
                    return (
                      <tr key={row.key} onClick={()=>openExpDetail(e)} style={{ cursor:"pointer", borderTop: row.isFirstLine ? undefined : "none" }} onMouseEnter={ev=>ev.currentTarget.style.background="#F8FAFC"} onMouseLeave={ev=>ev.currentTarget.style.background=""}>
                        <td style={{ fontSize:12, color: row.isFirstLine ? undefined : "var(--ink6, #B0B7C3)" }}>{row.isFirstLine ? e.date : "↳"}</td>
                        <td><span style={{ fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,background:"var(--surface)",color:"var(--ink4)" }}>{cat.icon} {cat.label}</span></td>
                        <td style={{ fontSize:13 }}>{line.description || e.description}</td>
                        <td style={{ fontSize:12,color:"#6B778C" }}>{e.payment_method}</td>
                        <td style={{ fontWeight:700 }}>{fmt(line.amount)}</td>
                        <td>{row.isFirstLine && <button onClick={ev=>{ev.stopPropagation();deleteExpense(e.id)}} style={{ background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontSize:16 }} title="Hapus seluruh transaksi">✕</button>}</td>
                      </tr>
                    )
                  })}
                {catFilter!=="gaji" && combinedExpRows.length===0 && <tr><td colSpan={6} style={{ textAlign:"center",color:"var(--ink5)",padding:"32px 0" }}>No expenses yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CASH FLOW */}
      {tab==="cashflow" && (
        <div>
          <div style={{ display:"flex",flexDirection:"column",gap:10,marginBottom:16 }}>
            <div style={{ background:"#E3FCEF",border:"1px solid #00875A33",borderRadius:12,padding:"16px 20px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#00875A",marginBottom:4 }}>KAS MASUK</div>
              <div style={{ fontSize:24,fontWeight:900,color:"#00875A" }}>{fmt(cashIn+qrisIn)}</div>
              <div style={{ fontSize:11,color:"#6B778C",marginTop:4 }}>Cash: {fmt(cashIn)} · QRIS/Transfer: {fmt(qrisIn)}</div>
            </div>
            <div style={{ background:"#FFEBE6",border:"1px solid #DE350B33",borderRadius:12,padding:"16px 20px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#DE350B",marginBottom:4 }}>KAS KELUAR</div>
              <div style={{ fontSize:24,fontWeight:900,color:"#DE350B" }}>{fmt(cashOut)}</div>
              <div style={{ fontSize:11,color:"#6B778C",marginTop:4 }}>PO: {fmt(poTotal)} · Gaji: {fmt(salaryTotal)} · Ops: {fmt(manualTotal)}</div>
            </div>
            <div style={{ background:netCash>=0?"#E3FCEF":"#FFEBE6",border:"1px solid "+(netCash>=0?"#00875A33":"#DE350B33"),borderRadius:12,padding:"16px 20px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:netCash>=0?"#00875A":"#DE350B",marginBottom:4 }}>SALDO AKHIR</div>
              <div style={{ fontSize:24,fontWeight:900,color:netCash>=0?"#00875A":"#DE350B" }}>{fmt(netCash)}</div>
              <div style={{ fontSize:11,color:"#6B778C",marginTop:4 }}>Opening: {fmt(openingBal.amount||0)}</div>
            </div>
          </div>

          {/* Opening balance editor */}
          <div className="bo-card" style={{ marginBottom:16 }}>
            <div className="bo-card-title">Opening Balance — {period}</div>
            <div style={{ display:"flex",gap:12,alignItems:"center" }}>
              <input type="number" defaultValue={openingBal.amount||300000}
                onBlur={e=>saveOpeningBal(parseFloat(e.target.value)||0)}
                className="bo-input" style={{ maxWidth:200 }} />
              <span style={{ fontSize:12,color:"#6B778C" }}>Edit and click away to save. Default: Rp 300.000</span>
            </div>
          </div>

          {/* Cash flow breakdown */}
          <div className="bo-card">
            <div className="bo-card-title">Rincian Arus Kas</div>
            {[
              { label:"Saldo Awal",         masuk:fmt(openingBal.amount||0), keluar:null,          bold:false },
              { label:"Penjualan Cash",      masuk:fmt(cashIn),               keluar:null,          bold:false },
              { label:"Penjualan Non-Cash",  masuk:fmt(qrisIn),               keluar:null,          bold:false },
              { label:"Bahan Baku (PO)",     masuk:null,  keluar:fmt(bahanBakuPO),                  bold:false },
              { label:"Gaji Karyawan",       masuk:null,  keluar:fmt(salaryTotal),                  bold:false },
              ...EXPENSE_CATEGORIES.filter(c=>!c.auto&&catTotal(c.id)>0).map(c=>({ label:c.icon+" "+c.label, masuk:null, keluar:fmt(catTotal(c.id)), bold:false })),
              { label:"SALDO AKHIR",         masuk:fmt((openingBal.amount||0)+cashIn+qrisIn), keluar:fmt(cashOut), bold:true },
            ].map((row,i)=>(
              <div key={i} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--surface2)",fontWeight:row.bold?800:400 }}>
                <span style={{ fontSize:13,flex:1 }}>{row.label}</span>
                <span style={{ fontSize:13,minWidth:100,textAlign:"right",color:row.masuk&&!row.bold?"#00875A":row.keluar&&!row.bold?"#DE350B":row.bold?"var(--ink)":"#6B778C" }}>
                  {row.masuk||row.keluar||"—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BAHAN BAKU */}
      {tab==="bahan_baku" && (
        <div>
          <div style={{ display:"flex",flexDirection:"column",gap:10,marginBottom:16 }}>
            <div style={{ background:"#FFF7E6",border:"1px solid #FF8B0033",borderRadius:12,padding:"16px 20px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#FF8B00",marginBottom:4 }}>TOTAL BAHAN BAKU</div>
              <div style={{ fontSize:24,fontWeight:900,color:"#FF8B00" }}>{fmt(poTotal)}</div>
              <div style={{ fontSize:11,color:"#6B778C",marginTop:4 }}>{pos.length} purchase orders</div>
            </div>
            <div style={{ background:"#fff",border:"1px solid #f0f0f0",borderRadius:12,padding:"16px 20px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#6B778C",marginBottom:4 }}>AVG PER ORDER</div>
              <div style={{ fontSize:24,fontWeight:900,color:"#0052CC" }}>{fmt(orders.length>0?Math.round(totalCOGS/orders.length):0)}</div>
            </div>
            <div style={{ background:"#fff",border:"1px solid #f0f0f0",borderRadius:12,padding:"16px 20px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#6B778C",marginBottom:4 }}>% OF REVENUE</div>
              <div style={{ fontSize:24,fontWeight:900,color:poTotal/netRevenue>0.4?"#DE350B":"#00875A" }}>
                {netRevenue>0?Math.round((poTotal/netRevenue)*100):0}%
              </div>
            </div>
          </div>
          <div className="bo-card" style={{ padding:0,overflow:"hidden" }}>
            <table className="bo-table">
              <thead><tr><th>Tanggal</th><th>Supplier</th><th>Invoice</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {pos.map(p=>(
                  <tr key={p.id}>
                    <td style={{ fontSize:12 }}>{p.date}</td>
                    <td style={{ fontWeight:700 }}>{p.supplierName||p.supplier_name||"—"}</td>
                    <td style={{ fontSize:12,fontFamily:"monospace" }}>{p.invoiceNo||p.invoice_no||"—"}</td>
                    <td style={{ fontSize:12,color:"#6B778C" }}>{Array.isArray(p.items)?p.items.length:0} items</td>
                    <td style={{ fontWeight:700 }}>{fmt(p.total||0)}</td>
                    <td><span style={{ fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,background:"#E3FCEF",color:"#00875A" }}>Paid</span></td>
                  </tr>
                ))}
                {pos.length===0&&<tr><td colSpan={6} style={{ textAlign:"center",color:"var(--ink5)",padding:"32px 0" }}>No purchase orders this period</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GAJI */}
      {tab==="gaji" && (
        <div>
          <div style={{ display:"flex",flexDirection:"column",gap:10,marginBottom:16 }}>
            <div style={{ background:"#EFF6FF",border:"1px solid #0052CC33",borderRadius:12,padding:"16px 20px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#0052CC",marginBottom:4 }}>TOTAL GAJI BULAN INI</div>
              <div style={{ fontSize:24,fontWeight:900,color:"#0052CC" }}>{fmt(salaryTotal)}</div>
              <div style={{ fontSize:11,color:"#6B778C",marginTop:4 }}>{staff.length} karyawan aktif</div>
            </div>
            <div style={{ background:"#fff",border:"1px solid #f0f0f0",borderRadius:12,padding:"16px 20px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#6B778C",marginBottom:4 }}>KAS BON OUTSTANDING</div>
              <div style={{ fontSize:24,fontWeight:900,color:"#DE350B" }}>{fmt(kbOutstanding)}</div>
            </div>
            <div style={{ background:"#fff",border:"1px solid #f0f0f0",borderRadius:12,padding:"16px 20px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#6B778C",marginBottom:4 }}>NET GAJI (setelah potong)</div>
              <div style={{ fontSize:24,fontWeight:900,color:"#00875A" }}>{fmt(salaryTotal-kbOutstanding)}</div>
            </div>
          </div>
          <div className="bo-card" style={{ padding:0,overflow:"hidden" }}>
            <table className="bo-table">
              <thead><tr><th>Karyawan</th><th>Role</th><th>Gaji Pokok</th><th>Kas Bon</th><th>Net Gaji</th><th>Status</th></tr></thead>
              <tbody>
                {staff.map(s=>{
                  const kb = kasBonList.filter(k=>k.staff_name===s.name&&k.status==="outstanding").reduce((a,k)=>a+k.amount,0)
                  const net = (s.salary||0) - kb
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                          <div style={{ width:32,height:32,borderRadius:"50%",background:s.color||"var(--brand)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#fff" }}>{s.name?.slice(0,2).toUpperCase()}</div>
                          <span style={{ fontWeight:700 }}>{s.name}</span>
                        </div>
                      </td>
                      <td style={{ fontSize:12,color:"#6B778C" }}>{s.role}</td>
                      <td style={{ fontWeight:700 }}>{fmt(s.salary||0)}</td>
                      <td style={{ color:kb>0?"#DE350B":"#6B778C",fontWeight:kb>0?700:400 }}>{kb>0?"("+fmt(kb)+")":"—"}</td>
                      <td style={{ fontWeight:800,color:net>0?"#00875A":"#DE350B" }}>{fmt(net)}</td>
                      <td><span style={{ fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,background:s.active!==false?"#E3FCEF":"#f0f0f0",color:s.active!==false?"#00875A":"#6B778C" }}>{s.active!==false?"Active":"Inactive"}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* KAS BON */}
      {tab==="kasbon" && (
        <div>
          <div style={{ display:"flex",flexDirection:"column",gap:12,marginBottom:16 }}>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10 }} className="acc-metrics">
              <div style={{ background:"#fff",border:"1px solid #f0f0f0",borderRadius:12,padding:"14px 16px" }}>
                <div style={{ fontSize:11,fontWeight:700,color:"#6B778C",marginBottom:4 }}>OUTSTANDING</div>
                <div style={{ fontSize:20,fontWeight:900,color:"#DE350B" }}>{fmt(kbOutstanding)}</div>
              </div>
              <div style={{ background:"#fff",border:"1px solid #f0f0f0",borderRadius:12,padding:"14px 16px" }}>
                <div style={{ fontSize:11,fontWeight:700,color:"#6B778C",marginBottom:4 }}>TOTAL KAS BON</div>
                <div style={{ fontSize:20,fontWeight:900,color:"#FF8B00" }}>{kasBonInPeriod.length} entries</div>
              </div>
              <div style={{ background:"#fff",border:"1px solid #f0f0f0",borderRadius:12,padding:"14px 16px" }}>
                <div style={{ fontSize:11,fontWeight:700,color:"#6B778C",marginBottom:4 }}>SUDAH DIPOTONG</div>
                <div style={{ fontSize:20,fontWeight:900,color:"#00875A" }}>{fmt(kasBonInPeriod.filter(k=>k.status==="deducted").reduce((a,k)=>a+k.amount,0))}</div>
              </div>
            </div>
            <button onClick={()=>setKasBonModal(true)} className="bo-btn bo-btn-primary" style={{ width:"100%" }}>+ Kas Bon</button>
          </div>

          <div className="bo-card" style={{ padding:0,overflow:"hidden" }}>
            <table className="bo-table">
              <thead><tr><th>Tanggal</th><th>Staff</th><th>Jumlah</th><th>Alasan</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>
                {kbGroups.map(g => {
                  if (g.entries.length === 1) {
                    const k = g.entries[0]
                    return (
                      <tr key={k.id}>
                        <td style={{ fontSize:12 }}>{k.date}</td>
                        <td style={{ fontWeight:700 }}>{k.staff_name}</td>
                        <td style={{ fontWeight:700,color:"#DE350B" }}>{fmt(k.amount)}</td>
                        <td style={{ fontSize:12 }}>{k.reason}</td>
                        <td>
                          <span style={{ fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,
                            background:k.status==="outstanding"?"#FFEBE6":k.status==="deducted"?"#E3FCEF":"var(--surface)",
                            color:k.status==="outstanding"?"#DE350B":k.status==="deducted"?"#00875A":"#6B778C" }}>
                            {k.status==="outstanding"?"Outstanding":k.status==="deducted"?"Dipotong":"Cancelled"}
                          </span>
                        </td>
                        <td>
                          {k.status==="outstanding" && (
                            <button onClick={()=>markKasBonDeducted(k.id)} className="bo-btn bo-btn-ghost bo-btn-sm">
                              Tandai Dipotong
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  }
                  const isOpen = !!kbExpanded[g.staff_name]
                  const outstandingIds = g.entries.filter(k=>k.status==="outstanding").map(k=>k.id)
                  return (
                    <Fragment key={g.staff_name}>
                      <tr onClick={()=>toggleKbExpand(g.staff_name)} style={{ cursor:"pointer", background:"var(--surface)" }}>
                        <td colSpan={2} style={{ fontWeight:700 }}>
                          <span style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"var(--ink4)", marginRight:8 }}>{isOpen?"▼":"▶"}</span>
                          {g.staff_name}
                        </td>
                        <td style={{ fontWeight:700,color:"#DE350B" }}>{fmt(g.total)}</td>
                        <td colSpan={2} style={{ fontSize:12, color:"var(--ink4)" }}>{g.entries.length} entries</td>
                        <td>
                          {outstandingIds.length > 0 && (
                            <button onClick={(e)=>{ e.stopPropagation(); markKasBonDeductedBulk(outstandingIds) }} className="bo-btn bo-btn-ghost bo-btn-sm">
                              Tandai Semua Dipotong
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && g.entries.map(k=>(
                        <tr key={k.id} style={{ background:"var(--surface)" }}>
                          <td style={{ fontSize:12, paddingLeft:32 }}>{k.date}</td>
                          <td style={{ fontSize:12, color:"var(--ink4)" }}>{k.staff_name}</td>
                          <td style={{ fontWeight:700,color:"#DE350B" }}>{fmt(k.amount)}</td>
                          <td style={{ fontSize:12 }}>{k.reason}</td>
                          <td>
                            <span style={{ fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,
                              background:k.status==="outstanding"?"#FFEBE6":k.status==="deducted"?"#E3FCEF":"var(--surface)",
                              color:k.status==="outstanding"?"#DE350B":k.status==="deducted"?"#00875A":"#6B778C" }}>
                              {k.status==="outstanding"?"Outstanding":k.status==="deducted"?"Dipotong":"Cancelled"}
                            </span>
                          </td>
                          <td>
                            {k.status==="outstanding" && (
                              <button onClick={(e)=>{e.stopPropagation(); markKasBonDeducted(k.id)}} className="bo-btn bo-btn-ghost bo-btn-sm">
                                Tandai Dipotong
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
                {kasBonInPeriod.length===0&&<tr><td colSpan={6} style={{ textAlign:"center",color:"var(--ink5)",padding:"32px 0" }}>No kas bon records</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CLOSING REPORT */}
      {tab==="closing" && <ClosingReport />}
      {tab==="cashlog" && <CashLog />}

      {/* Akun / Chart of Accounts Tab */}
      {tab === "akun" && (() => {
        const COA_TYPES = [
          { value:"asset",     label:"Aset" },
          { value:"liability", label:"Kewajiban" },
          { value:"equity",    label:"Ekuitas" },
          { value:"income",    label:"Pendapatan" },
          { value:"cogs",      label:"HPP" },
          { value:"expense",   label:"Beban" },
        ]
        const TYPE_COLOR = {
          asset:"#0052CC", liability:"#FF5630", equity:"#6554C0",
          income:"#00875A", cogs:"#FF8B00", expense:"#DE350B"
        }
        const filtered = coa.filter(a =>
          a.code.toLowerCase().includes(coaSearch.toLowerCase()) ||
          a.name.toLowerCase().includes(coaSearch.toLowerCase()) ||
          (a.category||"").toLowerCase().includes(coaSearch.toLowerCase())
        )
        const grouped = COA_TYPES.map(t => ({
          ...t,
          items: filtered.filter(a => a.type === t.value)
        })).filter(g => g.items.length > 0)

        return (
          <div>
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"var(--ink1)" }}>Chart of Accounts</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input
                  value={coaSearch}
                  onChange={e => setCoaSearch(e.target.value)}
                  className="bo-input"
                  placeholder="Cari kode / nama akun..."
                  style={{ width:220, fontSize:13 }}
                />
                <button
                  onClick={() => { setCoaEdit(null); setCoaForm({ code:"", name:"", type:"asset", category:"", sort_order:0 }); setCoaModal(true) }}
                  className="bo-btn bo-btn-primary bo-btn-sm"
                >+ Tambah Akun</button>
              </div>
            </div>

            {/* Summary cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:8, marginBottom:20 }}>
              {COA_TYPES.map(t => {
                const count = coa.filter(a => a.type === t.value).length
                return (
                  <div key={t.value} style={{ background:"#fff", borderRadius:10, padding:"10px 14px", border:"1px solid #E8ECF0" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:TYPE_COLOR[t.value], marginBottom:2 }}>{t.label}</div>
                    <div style={{ fontSize:20, fontWeight:900, color:"var(--ink1)" }}>{count}</div>
                    <div style={{ fontSize:10, color:"var(--ink5)" }}>akun</div>
                  </div>
                )
              })}
            </div>

            {coaLoading ? (
              <div style={{ textAlign:"center", padding:40, color:"var(--ink5)" }}>Loading...</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {grouped.map(group => (
                  <div key={group.value} style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", overflow:"hidden" }}>
                    <div style={{ padding:"10px 16px", background:"#F8FAFC", borderBottom:"1px solid #E8ECF0", display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ width:10, height:10, borderRadius:"50%", background:TYPE_COLOR[group.value] }} />
                      <span style={{ fontSize:12, fontWeight:800, color:TYPE_COLOR[group.value], textTransform:"uppercase" }}>{group.label}</span>
                      <span style={{ fontSize:11, color:"var(--ink5)" }}>({group.items.length} akun)</span>
                    </div>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#FAFBFC" }}>
                          {["Kode","Nama Akun","Kategori","Status",""].map(h => (
                            <th key={h} style={{ padding:"8px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"var(--ink4)", borderBottom:"1px solid #F0F4F8" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map(acct => (
                          <tr key={acct.id} style={{ borderBottom:"1px solid #F8FAFC" }}>
                            <td style={{ padding:"9px 14px", fontSize:12, fontWeight:700, color:TYPE_COLOR[group.value], fontFamily:"monospace" }}>{acct.code}</td>
                            <td style={{ padding:"9px 14px", fontSize:13, fontWeight:600, color:"var(--ink1)" }}>{acct.name}</td>
                            <td style={{ padding:"9px 14px", fontSize:12, color:"var(--ink4)" }}>{acct.category || "—"}</td>
                            <td style={{ padding:"9px 14px" }}>
                              <span
                                onClick={() => toggleCoaActive(acct)}
                                style={{ cursor:"pointer", fontSize:11, fontWeight:700, padding:"2px 10px", borderRadius:10,
                                  background:acct.is_active ? "#E3FCEF" : "#F4F5F7",
                                  color:acct.is_active ? "#00875A" : "#97A0AF" }}
                              >{acct.is_active ? "Aktif" : "Nonaktif"}</span>
                            </td>
                            <td style={{ padding:"9px 14px", textAlign:"right" }}>
                              <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                                <button
                                  onClick={() => { setCoaEdit(acct); setCoaForm({ code:acct.code, name:acct.name, type:acct.type, category:acct.category||"", sort_order:acct.sort_order||0 }); setCoaModal(true) }}
                                  className="bo-btn bo-btn-ghost bo-btn-sm"
                                  style={{ fontSize:11 }}
                                >Edit</button>
                                <button
                                  onClick={() => deleteCoa(acct.id)}
                                  className="bo-btn bo-btn-sm"
                                  style={{ fontSize:11, background:"#FFEBE6", color:"#DE350B", border:"none" }}
                                >Hapus</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
                {grouped.length === 0 && (
                  <div style={{ textAlign:"center", padding:40, color:"var(--ink5)" }}>Tidak ada akun ditemukan</div>
                )}
              </div>
            )}

            {/* COA Modal */}
            {coaModal && (
              <div className="bo-overlay" onMouseDown={e => e.target === e.currentTarget && setCoaModal(false)}>
                <div className="bo-modal" style={{ maxWidth:460 }}>
                  <div className="bo-modal-header">
                    <div className="bo-modal-title">{coaEdit ? "Edit Akun" : "Tambah Akun"}</div>
                    <button className="bo-modal-close" onClick={() => setCoaModal(false)}>x</button>
                  </div>
                  <div className="bo-modal-body">
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                      <div>
                        <label className="bo-label">Kode Akun *</label>
                        <input
                          value={coaForm.code}
                          onChange={e => setCoaForm(f => ({...f, code:e.target.value}))}
                          className="bo-input"
                          placeholder="e.g. 1-10005"
                          style={{ fontFamily:"monospace" }}
                        />
                      </div>
                      <div>
                        <label className="bo-label">Tipe Akun *</label>
                        <select value={coaForm.type} onChange={e => setCoaForm(f => ({...f, type:e.target.value}))} className="bo-select">
                          {COA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ marginBottom:12 }}>
                      <label className="bo-label">Nama Akun *</label>
                      <input
                        value={coaForm.name}
                        onChange={e => setCoaForm(f => ({...f, name:e.target.value}))}
                        className="bo-input"
                        placeholder="e.g. Kas Kecil Operasional"
                        autoFocus
                      />
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      <div>
                        <label className="bo-label">Kategori</label>
                        <input
                          value={coaForm.category}
                          onChange={e => setCoaForm(f => ({...f, category:e.target.value}))}
                          className="bo-input"
                          placeholder="e.g. Kas & Bank"
                        />
                      </div>
                      <div>
                        <label className="bo-label">Urutan</label>
                        <input
                          type="number"
                          value={coaForm.sort_order}
                          onChange={e => setCoaForm(f => ({...f, sort_order:e.target.value}))}
                          className="bo-input"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="bo-modal-footer">
                    <button onClick={() => setCoaModal(false)} className="bo-btn bo-btn-ghost">Batal</button>
                    <button
                      onClick={saveCoa}
                      disabled={coaSaving || !coaForm.code || !coaForm.name}
                      className="bo-btn bo-btn-primary"
                    >{coaSaving ? "Menyimpan..." : coaEdit ? "Simpan Perubahan" : "Tambah Akun"}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Add Expense Modal */}
      {/* Add Expense Modal - Full multi-line form */}
      {expModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setExpModal(false)}>
          <div className="bo-modal" style={{ maxWidth:700, maxHeight:"94vh", display:"flex", flexDirection:"column" }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">{expEditId ? "Edit Pengeluaran Kas & Bank" : "Tambah Pengeluaran Kas & Bank"}</div>
              <button className="bo-modal-close" onClick={()=>setExpModal(false)}>x</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto", flex:1 }}>

              {/* Header info */}
              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:"16px 18px", marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:14, color:"var(--ink1)" }}>Informasi Pengeluaran Kas & Bank</div>
                <div className="bo-exp-info-grid" style={{ display:"grid", gridTemplateColumns:"130px 1fr", gap:"10px 16px", alignItems:"start" }}>

                  <label style={{ fontSize:13, fontWeight:600, paddingTop:8 }}>Outlet</label>
                  <input className="bo-input" value="PawonLoka" disabled style={{ background:"#F4F5F7", minWidth:0 }} />

                  <label style={{ fontSize:13, fontWeight:600, paddingTop:8 }}>No Transaksi</label>
                  <div style={{ minWidth:0 }}>
                    <input className="bo-input" style={{ minWidth:0 }} value={expTransNo} onChange={e=>setExpTransNo(e.target.value)} placeholder="BKK-00001" />
                    <div style={{ fontSize:11, color:"var(--ink5)", marginTop:3 }}>Terisi otomatis jika dikosongkan</div>
                  </div>

                  <label style={{ fontSize:13, fontWeight:600, paddingTop:8 }}>Akun Asal</label>
                  <select className="bo-select" style={{ minWidth:0 }} value={expAkunAsal} onChange={e=>setExpAkunAsal(e.target.value)}>
                    <option value="">Pilih akun sumber dana</option>
                    {expCoa.filter(a=>a.category==="Kas & Bank").map(a=>(
                      <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                    ))}
                  </select>

                  <label style={{ fontSize:13, fontWeight:600, paddingTop:8 }}>Tanggal Transaksi</label>
                  <div className="bo-exp-daterow" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    <input type="date" className="bo-input" style={{ minWidth:0 }} value={expForm.date} onChange={e=>setExpForm(f=>({...f,date:e.target.value}))} />
                    <input type="time" className="bo-input" style={{ minWidth:0 }} value={expTime} onChange={e=>setExpTime(e.target.value)} />
                  </div>

                </div>
              </div>

              {/* Detail lines */}
              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:"16px 18px", marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:"var(--ink1)" }}>Detail Akun <span style={{ color:"red" }}>*</span></div>
                  <button onClick={()=>{ setCoaPickerSelected(new Set(expLines.filter(l=>l.coa_id).map(l=>l.coa_id))); setCoaPickerSearch(""); setShowCoaPicker(true) }}
                    className="bo-btn bo-btn-ghost bo-btn-sm" style={{ color:"var(--brand)", borderColor:"var(--brand)", fontWeight:700 }}>
                    + Pilih Akun
                  </button>
                </div>
                {expLines.filter(l=>l.coa_id).length === 0 ? (
                  <div style={{ textAlign:"center", padding:"40px 0", color:"var(--ink5)" }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>Data tidak tersedia</div>
                    <div style={{ fontSize:12, marginTop:4 }}>Klik "+ Pilih Akun" untuk menambahkan akun pengeluaran</div>
                  </div>
                ) : (
                  <div>
                    <div className="bo-exp-lineitem-header" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 160px 32px", gap:8, marginBottom:6, padding:"0 4px" }}>
                      {["NAMA AKUN","DESKRIPSI","JUMLAH",""].map(h=>(
                        <div key={h} style={{ fontSize:10, fontWeight:700, color:"var(--ink4)", textTransform:"uppercase" }}>{h}</div>
                      ))}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {expLines.filter(l=>l.coa_id).map((line)=>(
                        <div key={line.coa_id} className="bo-exp-lineitem" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 160px 32px", gap:8, alignItems:"center" }}>
                          <div style={{ fontSize:13, fontWeight:600, color:"var(--ink1)", padding:"8px 0", minWidth:0 }}>{line.coa_name}</div>
                          <input className="bo-input" style={{ fontSize:12, minWidth:0 }}
                            value={line.description} placeholder="Contoh: Deskripsi"
                            onChange={e=>setExpLines(prev=>prev.map((l)=>l.coa_id===line.coa_id?{...l,description:e.target.value}:l))} />
                          <input type="text" className="bo-input" style={{ fontSize:12, minWidth:0 }}
                            value={line.amount ? "Rp "+Number(line.amount).toLocaleString("id-ID") : ""}
                            placeholder="Rp 0"
                            onChange={e=>{
                              const raw = e.target.value.replace(/[^0-9]/g,"")
                              setExpLines(prev=>prev.map((l)=>l.coa_id===line.coa_id?{...l,amount:raw}:l))
                            }} />
                          <button onClick={()=>setExpLines(prev=>prev.filter(l=>l.coa_id!==line.coa_id))}
                            style={{ background:"none", border:"none", cursor:"pointer", color:"#DE350B", fontSize:18 }}>x</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total */}
                <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"center", marginTop:14, paddingTop:10, borderTop:"1px solid #E8ECF0" }}>
                  <span style={{ fontSize:13, fontWeight:700, marginRight:16 }}>Total</span>
                  <span style={{ fontSize:16, fontWeight:900, color:"var(--brand)" }}>
                    Rp {expLines.reduce((a,l)=>a+(parseFloat(l.amount)||0),0).toLocaleString("id-ID")}
                  </span>
                </div>
              </div>

              {/* Keterangan */}
              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:"16px 18px" }}>
                <label className="bo-label">Keterangan</label>
                <textarea className="bo-input" rows={2} value={expForm.notes}
                  onChange={e=>setExpForm(f=>({...f,notes:e.target.value}))}
                  placeholder="Catatan tambahan..." />
              </div>

            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>{setExpModal(false);setExpEditId(null)}} className="bo-btn bo-btn-ghost">Batal</button>
              <button onClick={saveExpense} disabled={saving} className="bo-btn bo-btn-primary">
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COA Picker Modal */}
      {showCoaPicker && (
        <div className="bo-overlay" style={{ zIndex:9999 }} onMouseDown={e=>e.target===e.currentTarget&&setShowCoaPicker(false)}>
          <div className="bo-modal" style={{ maxWidth:640, maxHeight:"85vh", display:"flex", flexDirection:"column" }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">Pilih Akun</div>
              <button className="bo-modal-close" onClick={()=>setShowCoaPicker(false)}>x</button>
            </div>
            <div className="bo-modal-body" style={{ flex:1, overflowY:"auto" }}>
              <input className="bo-input" style={{ marginBottom:16 }}
                value={coaPickerSearch}
                onChange={e=>setCoaPickerSearch(e.target.value)}
                placeholder="Cari ..."
                autoFocus />
              {(() => {
                const q = coaPickerSearch.toLowerCase()
                const filteredCoa = expCoa.filter(a => !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q) || (a.category||"").toLowerCase().includes(q))
                if (filteredCoa.length === 0) {
                  return (
                    <div style={{ textAlign:"center", padding:"40px 0", color:"var(--ink5)" }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>Tidak ada akun ditemukan</div>
                      <div style={{ fontSize:12, marginTop:4 }}>Coba kata kunci pencarian lain</div>
                    </div>
                  )
                }
                return (
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:"#F8FAFC" }}>
                    <th style={{ width:40, padding:"8px 12px" }}></th>
                    {["KODE","NAMA","KATEGORI"].map(h=>(
                      <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"var(--ink4)", borderBottom:"1px solid #E8ECF0" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCoa.map(a=>(
                      <tr key={a.id} onClick={()=>{ const s=new Set(coaPickerSelected); s.has(a.id)?s.delete(a.id):s.add(a.id); setCoaPickerSelected(s) }}
                        style={{ borderBottom:"1px solid #F0F4F8", cursor:"pointer", background:coaPickerSelected.has(a.id)?"#F0F7FF":"" }}
                        onMouseEnter={e=>{ if(!coaPickerSelected.has(a.id)) e.currentTarget.style.background="#F8FAFC" }}
                        onMouseLeave={e=>{ if(!coaPickerSelected.has(a.id)) e.currentTarget.style.background="" }}>
                        <td style={{ padding:"10px 12px" }}>
                          <div style={{ width:18, height:18, borderRadius:4, border:`2px solid ${coaPickerSelected.has(a.id)?"var(--brand)":"#DFE1E6"}`,
                            background:coaPickerSelected.has(a.id)?"var(--brand)":"#fff",
                            display:"flex", alignItems:"center", justifyContent:"center" }}>
                            {coaPickerSelected.has(a.id) && <div style={{ width:10, height:10, borderRadius:2, background:"#fff" }} />}
                          </div>
                        </td>
                        <td style={{ padding:"10px 12px", fontSize:12, fontFamily:"monospace", color:"var(--ink4)" }}>{a.code}</td>
                        <td style={{ padding:"10px 12px", fontSize:13, fontWeight:600 }}>{a.name}</td>
                        <td style={{ padding:"10px 12px", fontSize:12, color:"var(--ink5)" }}>{a.category||"—"}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
                )
              })()}
            </div>
            <div className="bo-modal-footer" style={{ justifyContent:"space-between" }}>
              <div style={{ fontSize:12, color:"var(--ink4)" }}>{coaPickerSelected.size} akun dipilih</div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>setShowCoaPicker(false)} className="bo-btn bo-btn-ghost">Batal</button>
                <button
                  disabled={coaPickerSelected.size===0}
                  onClick={()=>{
                    const newLines = []
                    coaPickerSelected.forEach(id=>{
                      const acct = expCoa.find(a=>a.id===id)
                      if (!acct) return
                      const existing = expLines.find(l=>l.coa_id===id)
                      newLines.push(existing || { coa_id:id, coa_name:acct.name, description:"", amount:"" })
                    })
                    setExpLines(newLines)
                    setShowCoaPicker(false)
                  }}
                  className="bo-btn bo-btn-primary">Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Detail Modal - View only */}
      {expDetailModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setExpDetailModal(null)}>
          <div className="bo-modal" style={{ maxWidth:700, maxHeight:"94vh", display:"flex", flexDirection:"column" }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">Detail Pengeluaran</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>{expDetailModal.transaction_no || "—"}</div>
              </div>
              <button className="bo-modal-close" onClick={()=>setExpDetailModal(null)}>x</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto", flex:1 }}>

              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:"16px 18px", marginBottom:14 }}>
                <div style={{ display:"grid", gridTemplateColumns:"130px 1fr", gap:"8px 16px", fontSize:13 }}>
                  <span style={{ color:"var(--ink4)", fontWeight:600 }}>Outlet</span><span>PawonLoka</span>
                  <span style={{ color:"var(--ink4)", fontWeight:600 }}>No Transaksi</span><span style={{ fontFamily:"monospace", fontWeight:700 }}>{expDetailModal.transaction_no||"—"}</span>
                  <span style={{ color:"var(--ink4)", fontWeight:600 }}>Akun Asal</span><span>{expDetailModal.akun_asal||"—"}</span>
                  <span style={{ color:"var(--ink4)", fontWeight:600 }}>Tanggal</span><span>{expDetailModal.date} {expDetailModal.time||""}</span>
                </div>
              </div>

              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:"16px 18px", marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:12 }}>Detail Pengeluaran</div>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ background:"#F8FAFC" }}>
                      {["NAMA AKUN","DESKRIPSI","JUMLAH"].map(h=>(
                        <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"var(--ink4)", borderBottom:"1px solid #E8ECF0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(expDetailModal.lines||[{coa_name:expDetailModal.cat,description:expDetailModal.description,amount:expDetailModal.amount}]).map((l,i)=>(
                      <tr key={i} style={{ borderBottom:"1px solid #F0F4F8" }}>
                        <td style={{ padding:"9px 12px", fontSize:13 }}>{l.coa_name||l.coa_id||"—"}</td>
                        <td style={{ padding:"9px 12px", fontSize:12, color:"var(--ink4)" }}>{l.description||"—"}</td>
                        <td style={{ padding:"9px 12px", fontSize:13, fontWeight:700 }}>Rp {Number(l.amount||0).toLocaleString("id-ID")}</td>
                      </tr>
                    ))}
                    <tr style={{ background:"#F8FAFC" }}>
                      <td colSpan={2} style={{ padding:"10px 12px", fontSize:13, fontWeight:800 }}>Total</td>
                      <td style={{ padding:"10px 12px", fontSize:14, fontWeight:900, color:"var(--brand)" }}>
                        Rp {Number(expDetailModal.amount||0).toLocaleString("id-ID")}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {expDetailModal.notes && (
                <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:"16px 18px" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"var(--ink4)", marginBottom:4 }}>Keterangan</div>
                  <div style={{ fontSize:13 }}>{expDetailModal.notes}</div>
                </div>
              )}

            </div>
            <div className="bo-modal-footer" style={{ justifyContent:"space-between" }}>
              <button onClick={()=>deleteExpense(expDetailModal.id).then(()=>setExpDetailModal(null))}
                className="bo-btn bo-btn-sm" style={{ background:"#FFEBE6", color:"#DE350B", border:"none" }}>Hapus</button>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>openEditExpense(expDetailModal)} className="bo-btn bo-btn-sm bo-btn-primary">Edit</button>
                <button onClick={()=>setExpDetailModal(null)} className="bo-btn bo-btn-ghost">Tutup</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PO Detail Modal — read-only view of what a Purchase Order actually contained,
          since the Pengeluaran listing now shows one row per category a PO touches
          rather than the whole PO, this is the place to see the full item breakdown. */}
      {poDetailModal && (() => {
        const po = poDetailModal
        const items = po.items || po.po_items || []
        return (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setPoDetailModal(null)}>
          <div className="bo-modal" style={{ maxWidth:700, maxHeight:"94vh", display:"flex", flexDirection:"column" }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">Detail Purchase Order</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>{po.invoiceNo||po.invoice_no||"—"}</div>
              </div>
              <button className="bo-modal-close" onClick={()=>setPoDetailModal(null)}>x</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto", flex:1 }}>

              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:"16px 18px", marginBottom:14 }}>
                <div style={{ display:"grid", gridTemplateColumns:"130px 1fr", gap:"8px 16px", fontSize:13 }}>
                  <span style={{ color:"var(--ink4)", fontWeight:600 }}>Supplier</span><span>{po.supplierName||po.supplier_name||"—"}</span>
                  <span style={{ color:"var(--ink4)", fontWeight:600 }}>No Invoice</span><span style={{ fontFamily:"monospace", fontWeight:700 }}>{po.invoiceNo||po.invoice_no||"—"}</span>
                  <span style={{ color:"var(--ink4)", fontWeight:600 }}>Tanggal</span><span>{po.date}</span>
                  <span style={{ color:"var(--ink4)", fontWeight:600 }}>Total</span><span style={{ fontWeight:700 }}>{fmt(po.total)}</span>
                </div>
              </div>

              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:"16px 18px" }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:12 }}>Item Dibeli</div>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ background:"#F8FAFC" }}>
                      {["NAMA","QTY","KATEGORI","JUMLAH"].map(h=>(
                        <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"var(--ink4)", borderBottom:"1px solid #E8ECF0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item,i) => {
                      const ingCat = ingredientCatById[item.ingredient_id]
                      const expCat = SUPPLY_CATEGORY_TO_EXPENSE_CAT[ingCat] || "bahan_baku"
                      const cat = EXPENSE_CATEGORIES.find(c=>c.id===expCat) || { icon:"📦", label:expCat }
                      return (
                        <tr key={i} style={{ borderBottom:"1px solid #F0F4F8" }}>
                          <td style={{ padding:"9px 12px", fontSize:13 }}>{item.name||"—"}</td>
                          <td style={{ padding:"9px 12px", fontSize:12, color:"var(--ink4)" }}>{item.qty} {item.unit}</td>
                          <td style={{ padding:"9px 12px", fontSize:11 }}>
                            <span style={{ fontWeight:700,padding:"2px 8px",borderRadius:10,background:"#FFF7E6",color:"#FF8B00" }}>{cat.icon} {cat.label}</span>
                          </td>
                          <td style={{ padding:"9px 12px", fontSize:13, fontWeight:700 }}>{fmt(item.total_cost)}</td>
                        </tr>
                      )
                    })}
                    {items.length===0 && <tr><td colSpan={4} style={{ textAlign:"center", color:"var(--ink5)", padding:"24px 0" }}>Tidak ada detail item</td></tr>}
                    <tr style={{ background:"#F8FAFC" }}>
                      <td colSpan={3} style={{ padding:"10px 12px", fontSize:13, fontWeight:800 }}>Total</td>
                      <td style={{ padding:"10px 12px", fontSize:14, fontWeight:900, color:"var(--brand)" }}>{fmt(po.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setPoDetailModal(null)} className="bo-btn bo-btn-ghost">Tutup</button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Kas Bon Modal */}
      {kasBonModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setKasBonModal(false)}>
          <div className="bo-modal" style={{ maxWidth:440 }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">Kas Bon / Staff Advance</div>
              <button className="bo-modal-close" onClick={()=>setKasBonModal(false)}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14 }}>
                <div><label className="bo-label">Staff</label>
                  <select value={kbForm.staff_name} onChange={e=>setKbForm(f=>({...f,staff_name:e.target.value}))} className="bo-select">
                    {STAFF_LIST.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="bo-label">Tanggal</label><input type="date" value={kbForm.date} onChange={e=>setKbForm(f=>({...f,date:e.target.value}))} className="bo-input" /></div>
              </div>
              <div className="bo-form-row"><label className="bo-label">Jumlah (Rp) *</label><input type="number" value={kbForm.amount} onChange={e=>setKbForm(f=>({...f,amount:e.target.value}))} className="bo-input" placeholder="0" autoFocus /></div>
              <div className="bo-form-row"><label className="bo-label">Alasan *</label><input value={kbForm.reason} onChange={e=>setKbForm(f=>({...f,reason:e.target.value}))} className="bo-input" placeholder="e.g. Keperluan mendadak" /></div>
              <div className="bo-form-row"><label className="bo-label">Notes</label><input value={kbForm.notes} onChange={e=>setKbForm(f=>({...f,notes:e.target.value}))} className="bo-input" /></div>
              <div style={{ padding:"10px 14px",background:"#FFF7E6",borderRadius:"var(--r)",fontSize:12,color:"#FF8B00",fontWeight:600,marginTop:8 }}>
                Kas bon akan mengurangi gaji berikutnya. Status: Outstanding sampai ditandai dipotong.
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setKasBonModal(false)} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={saveKasBon} disabled={saving||!kbForm.amount||!kbForm.reason} className="bo-btn bo-btn-primary">{saving?"Saving...":"Catat Kas Bon"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
