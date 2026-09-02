import { useState, useEffect, useRef } from "react"
import { supabase } from "../lib/supabase"
import { offlineStore } from "../lib/offlineStore"

function fmt(n) { return Number(n||0).toLocaleString("id-ID") }

// Convert a qty expressed in `unit` into the ingredient's own base/stock unit
function toBaseUnit(ing, qty, unit) {
  if (!ing || unit === ing.unit) return qty
  const conv = (ing.conversions||[]).find(c => c.unit === unit)
  if (conv && parseNum(conv.qty) > 0) return qty * parseNum(conv.qty)
  const fallbacks = { kg:1000, L:1000, Galon:19000 }
  if (ing.unit==="gr" && fallbacks[unit]) return qty * fallbacks[unit]
  if (ing.unit==="ml" && fallbacks[unit]) return qty * fallbacks[unit]
  return qty
}

// Default a newly-selected ingredient's unit to its biggest packaging size (largest
// conversions[].qty multiplier), not the raw base unit, since that's almost never what
// staff actually mean to select when they don't touch the unit dropdown.
function biggestUnit(ing) {
  if (!ing) return ""
  const convs = ing.conversions || []
  if (!convs.length) return ing.unit
  return convs.reduce((max, c) => (parseNum(c.qty)||0) > (parseNum(max.qty)||0) ? c : max, convs[0]).unit || ing.unit
}
const REASONS = ["Expired","Damaged","Overproduction","Spillage","Other"]

const parseNum = (v) => parseFloat(String(v).replace(",", ".")) || 0

const STATIONS = {
  Kitchen:    { color:"#00875A" },
  Snack:      { color:"#F59E0B" },
  Bar:        { color:"#3B82F6" },
  Kasir:      { color:"#6366F1" },
}

// Which Backoffice departments show up on each station's staff picker —
// Cook/Head Cook/Bakar all fold into the Kitchen screen, matching today's setup.
const STATION_DEPTS = {
  Kitchen: ["Kitchen","Cook","Head Cook","Bakar"],
  Snack:   ["Snack"],
  Bar:     ["Bar"],
  Kasir:   ["Kasir"],
}

const MENUS = {
  Kitchen: ["opname","waste","production","requisition","trial"],
  Snack:   ["opname","waste","production","requisition","trial"],
  Bar:     ["opname","waste","production","requisition","trial"],
  Kasir:   ["opname","waste","production","requisition","trial"],
}

const MENU_ITEMS = [
  { screen:"opname",      icon:"📋", label:"Stock Count",         sub:"Count current stock levels",        bg:"#0066ff" },
  { screen:"waste",       icon:"🗑️", label:"Waste / Spoilage",    sub:"Report damaged or expired items",   bg:"#DE350B" },
  { screen:"consumption", icon:"🍽️", label:"Staff Meal / Personal Use", sub:"Log food or drink you took for yourself", bg:"#F59E0B" },
  { screen:"production",  icon:"🏭", label:"Production Batch",    sub:"Record what was produced today",    bg:"#00875A" },
  { screen:"requisition", icon:"🛒", label:"Request Ingredients", sub:"Request items needed for today",    bg:"#374151" },
  { screen:"trial",       icon:"🧪", label:"Trial Menu / R&D",  sub:"Record testing new recipes or photoshoots", bg:"#6366F1" },
]

function SearchableSelect({ options, value, onChange, placeholder, labelKey="name", valueKey="id" }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef(null)
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])
  const selected = options.find(o => (o[valueKey]||o) === value)
  const filtered = options.filter(o => {
    const label = o[labelKey] || o
    return !search || label.toLowerCase().includes(search.toLowerCase())
  })
  const UOM_OPTIONS = ["kg", "gr", "L", "ml", "pcs", "pack", "ikat", "btg", "lbr", "porsi", "bks", "kaleng", "botol", "cup"]

  const s = {
    wrap: { position:"relative" },
    trigger: { width:"100%", padding:"11px 13px", border:"1.5px solid #e0e0e0", borderRadius:10, fontSize:15, boxSizing:"border-box", fontFamily:"inherit", background:"#fff", textAlign:"left", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" },
    dropdown: { position:"absolute", zIndex:9999, top:"100%", left:0, right:0, background:"#fff", border:"1.5px solid #0066ff", borderRadius:10, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", marginTop:2, overflow:"hidden" },
    search: { width:"100%", padding:"10px 12px", border:"none", borderBottom:"1px solid #eee", fontSize:14, fontFamily:"inherit", outline:"none", boxSizing:"border-box" },
    list: { maxHeight:200, overflowY:"auto" },
    item: { padding:"10px 14px", fontSize:14, cursor:"pointer" },
  }
  return (
    <div ref={ref} style={s.wrap}>
      <button type="button" onClick={()=>{setOpen(o=>!o);setSearch("")}} style={s.trigger}>
        <span style={{ color: value ? "#111" : "#999" }}>{selected ? (selected[labelKey]||selected) : placeholder}</span>
        <span style={{ fontSize:10, color:"#999" }}>{open?"▲":"▼"}</span>
      </button>
      {open && (
        <div style={s.dropdown}>
          <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." style={s.search} onClick={e=>e.stopPropagation()} />
          <div style={s.list}>
            {filtered.length===0 ? <div style={{ ...s.item, color:"#999" }}>No results</div>
              : filtered.map((o,i) => {
                const label = o[labelKey]||o; const val = o[valueKey]||o
                return <div key={i} onClick={()=>{onChange(val);setOpen(false);setSearch("")}} style={{ ...s.item, background:val===value?"#f0f5ff":"transparent", fontWeight:val===value?700:400, color:val===value?"#0066ff":"#111" }}>{label}</div>
              })
            }
          </div>
        </div>
      )}
    </div>
  )
}

function StaffPicker({ color, value, onChange, staffList }) {
  return (
    <div>
      <div style={{ fontSize:12, fontWeight:700, color:"#666", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.4px" }}>Submitted By *</div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {staffList.map(name => (
          <button key={name} type="button" onClick={()=>onChange(name)}
            style={{ padding:"8px 18px", borderRadius:20, border:`2px solid ${value===name ? color : "#e0e0e0"}`,
              background: value===name ? color : "#fff",
              color: value===name ? "#fff" : "#333",
              fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function StaffPortal() {
  const [station,      setStation]      = useState(null)
  const [screen,       setScreen]       = useState("home")
  const [ingredients,  setIngredients]  = useState([])
  const [ingredientsById, setIngredientsById] = useState({})
  const [subRecipes,   setSubRecipes]   = useState([])
  const [subRecipeIngs,setSubRecipeIngs]= useState([])
  const [frozenProducts, setFrozenProducts] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [frozenRecipes,  setFrozenRecipes]  = useState([])
  const [saving,       setSaving]       = useState(false)
  const [done,         setDone]         = useState(false)
  const [opnameCounts, setOpnameCounts] = useState([])
  const [opnameSearch, setOpnameSearch] = useState("")
  const [opnameDate,   setOpnameDate]   = useState(new Date().toISOString().slice(0,10))
  const [staffName,    setStaffName]    = useState("")
  const [wasteForm,    setWasteForm]    = useState({ ingredient_id:"", qty:"", reason:"Expired", notes:"", date:new Date().toISOString().slice(0,10) })
  const [consumptionForm, setConsumptionForm] = useState({ ingredient_id:"", qty:"", notes:"", date:new Date().toISOString().slice(0,10) })
  const [trialForm, setTrialForm] = useState({ trialName:"", notes:"", items:[{ingredient_id:"", qty:"", unit:""}] })
  const [prodType,     setProdType]     = useState("") // 'sub' | 'product'
  const [prodSubId,    setProdSubId]    = useState("")
  const [prodProductSku, setProdProductSku] = useState("")
  const [prodBatchQty, setProdBatchQty] = useState("")
  const [prodYield,    setProdYield]    = useState("")
  const [prodYieldUnit,setProdYieldUnit]= useState("")
  const [prodUsed,     setProdUsed]     = useState([])
  const [prodNotes,    setProdNotes]    = useState("")
  const [prodDate,     setProdDate]     = useState(new Date().toISOString().slice(0,10))
  const [reqDate,      setReqDate]      = useState(new Date().toISOString().slice(0,10))
  const [reqNotes,     setReqNotes]     = useState("")
  const [reqItems,     setReqItems]     = useState([{ ingredient_id:"", qty:"", unit:"" }])
  const [stationStaff, setStationStaff] = useState({})
  const [allStaff,     setAllStaff]     = useState([])

  // Use ingredient_id (not the sub_recipes row's own id) as the option value — that's the
  // id staff_submissions/stock_movements actually deduct against. See RecipeEditor.jsx's
  // `all` list for the same fix applied there.
  const subRecipeOptions = subRecipes.map(s => {
    const ing = ingredientsById[s.ingredient_id]
    return { id: s.ingredient_id||s.id, name:s.name, unit: ing?.unit||s.yield_unit||s.unit||"gr", cost_per_unit: ing?.cost_per_unit||s.cost_per_unit||0 }
  })

  useEffect(() => { loadStaff(); loadData() }, [])
  useEffect(() => { if (station) loadData() }, [station])

  function buildStationStaff(rows) {
    const map = {}
    Object.keys(STATION_DEPTS).forEach(st => {
      map[st] = rows.filter(r => (r.role||[]).some(role => STATION_DEPTS[st].includes(role))).map(r=>r.name)
    })
    return map
  }

  function buildAllStaff(rows) {
    return [...new Set(rows.map(r=>r.name))].sort()
  }

  async function loadStaff() {
    const cached = await offlineStore.getCache('staff')
    if (cached?.length) { setStationStaff(buildStationStaff(cached)); setAllStaff(buildAllStaff(cached)) }
    try {
      const { data } = await supabase.from("staff").select("name,role,active").eq("active", true)
      if (data) { setStationStaff(buildStationStaff(data)); setAllStaff(buildAllStaff(data)); offlineStore.setCache('staff', data) }
    } catch { /* offline — cached already applied */ }
  }

  async function loadData() {
    // Load from cache immediately for offline startup
    const [cachedIngs, cachedSubs, cachedSubIngs, cachedFrozenProds, cachedAllProds, cachedFrozenRecipes] = await Promise.all([
      offlineStore.getCache('ingredients'),
      offlineStore.getCache('sub_recipes'),
      offlineStore.getCache('sub_recipe_ingredients'),
      offlineStore.getCache('frozen_products'),
      offlineStore.getCache('all_products'),
      offlineStore.getCache('recipes'),
    ])
    if (cachedIngs?.length)   { setIngredientsById(Object.fromEntries(cachedIngs.map(i=>[i.id,i]))); setIngredients(cachedIngs.filter(i => !i.name.includes("(sub)"))); setOpnameCounts(cachedIngs.map(i=>({ ingredient_id:i.id, name:i.name, unit:i.unit, conversions:i.conversions||[], input_unit:i.unit, system_qty:i.stock||0, actual_qty:"" }))) }
    if (cachedSubs?.length)   setSubRecipes(cachedSubs)
    if (cachedSubIngs?.length) setSubRecipeIngs(cachedSubIngs)
    if (cachedFrozenProds?.length) setFrozenProducts(cachedFrozenProds)
    if (cachedAllProds?.length) setAllProducts(cachedAllProds)
    if (cachedFrozenRecipes?.length) setFrozenRecipes(cachedFrozenRecipes)
    if ((stationStaff[station]||[]).length === 1) setStaffName(stationStaff[station][0])

    // Refresh from Supabase in background
    try {
      const [{ data:ings }, { data:subs }, { data:subIngs }, { data:frozenProds }, { data:allProds }, { data:allRecipes }] = await Promise.all([
        supabase.from("ingredients").select("id,name,unit,stock,cost_per_unit,supplier,station,conversions").order("name"),
        supabase.from("sub_recipes").select("*").order("name"),
        supabase.from("sub_recipe_ingredients").select("*"),
        supabase.from("products").select("sku,name,cat,price").eq("cat","Frozen Food").eq("active",true).order("name"),
        supabase.from("products").select("sku,name,cat").eq("active",true).order("name"),
        supabase.from("recipes").select("product_id,ingredient_id,qty,unit,ingredient_name"),
      ])
      if (ings)    { setIngredientsById(Object.fromEntries(ings.map(i=>[i.id,i]))); setIngredients(ings.filter(i => !i.name.includes("(sub)"))); setOpnameCounts(ings.map(i=>({ ingredient_id:i.id, name:i.name, unit:i.unit, conversions:i.conversions||[], input_unit:i.unit, system_qty:i.stock||0, actual_qty:"" }))); offlineStore.setCache('ingredients', ings) }
      if (subs)    { setSubRecipes(subs); offlineStore.setCache('sub_recipes', subs) }
      if (subIngs) { setSubRecipeIngs(subIngs); offlineStore.setCache('sub_recipe_ingredients', subIngs) }
      if (frozenProds) { setFrozenProducts(frozenProds); offlineStore.setCache('frozen_products', frozenProds) }
      if (allProds) { setAllProducts(allProds); offlineStore.setCache('all_products', allProds) }
      if (allRecipes)   { setFrozenRecipes(allRecipes); offlineStore.setCache('recipes', allRecipes) }
    } catch { /* offline — already loaded from cache */ }
  }

  function selectSubRecipe(subId) {
    setProdType("sub"); setProdProductSku("")
    setProdSubId(subId)
    if (!subId) { setProdUsed([]); return }
    const sub = subRecipes.find(s=>s.id===subId)
    if (sub) { setProdYield(sub.yield_qty||""); setProdYieldUnit(sub.yield_unit||sub.unit||"gr") }
    const lines = subRecipeIngs.filter(l=>l.sub_recipe_id===subId)
    if (lines.length) {
      setProdUsed(lines.map(l=>{ const ing=ingredients.find(i=>i.id===l.ingredient_id); return { ingredient_id:l.ingredient_id, name:ing?.name||"", qty:String(l.qty), unit:l.unit||ing?.unit||"" } }))
    } else {
      setProdUsed([{ ingredient_id:"", qty:"", unit:"" }])
    }
  }

  // Frozen retail products (e.g. "Ayam Taliwang Frozen") produced/packed directly from a
  // prep ingredient via the same `recipes` link POS.jsx uses to cost/deduct at sale time —
  // see selectSubRecipe() above for the parallel sub-recipe path.
  function selectFrozenProduct(sku) {
    setProdType("product"); setProdSubId("")
    setProdProductSku(sku)
    if (!sku) { setProdUsed([]); return }
    const lines = frozenRecipes.filter(l=>l.product_id===sku)
    if (lines.length) {
      setProdUsed(lines.map(l=>{ const ing=ingredientsById[l.ingredient_id]; return { ingredient_id:l.ingredient_id, name:ing?.name||l.ingredient_name||"", qty:String(l.qty), unit:l.unit||ing?.unit||"" } }))
    } else {
      setProdUsed([{ ingredient_id:"", qty:"", unit:"" }])
    }
  }

  function selectProductionTarget(compositeId) {
    if (!compositeId) { setProdType(""); setProdSubId(""); setProdProductSku(""); setProdUsed([]); return }
    const sep = compositeId.indexOf(":")
    const type = compositeId.slice(0, sep)
    const id   = compositeId.slice(sep + 1)
    if (type === "prod") selectFrozenProduct(id)
    else selectSubRecipe(id)
  }

  async function submit(type, data) {
    if (!staffName) { alert("Please select who is submitting"); return }
    setSaving(true)
    const { error } = await supabase.from("staff_submissions").insert({
      id:"SS-"+Date.now(), type, status:"pending",
      submitted_by: staffName,
      submitted_at: new Date().toISOString(),
      data: { ...data, station, submitted_by: staffName }
    })
    setSaving(false)
    if (error) { alert("Failed to submit report: "+error.message+"\n\nPlease try again or tell your manager."); return }
    setDone(true)
  }

  async function submitOpname() {
    const filled = opnameCounts.filter(i=>i.actual_qty!=="")
    if (!filled.length) { alert("Enter at least one count"); return }
    await submit("opname", { date:opnameDate||new Date().toISOString().slice(0,10), items:filled.map(i=>{
      const enteredQty = parseNum(i.actual_qty)||0
      const ing = ingredients.find(x=>x.id===i.ingredient_id)
      const actual_qty = toBaseUnit(ing, enteredQty, i.input_unit||i.unit)
      return { ...i, entered_qty:enteredQty, entered_unit:i.input_unit||i.unit, actual_qty, diff:actual_qty-i.system_qty }
    }) })
  }

  async function submitWaste() {
    const ing = ingredientsById[wasteForm.ingredient_id]
    if (!ing||!wasteForm.qty) { alert("Select ingredient and quantity"); return }
    await submit("waste", { ingredient_id:ing.id, ingredient_name:ing.name, qty:parseNum(wasteForm.qty), unit:ing.unit, reason:wasteForm.reason, notes:wasteForm.notes, date:wasteForm.date||new Date().toISOString().slice(0,10), estimated_cost:(parseNum(wasteForm.qty)||0)*(ing.cost_per_unit||0) })
  }

  async function submitConsumption() {
    const ing = ingredientsById[consumptionForm.ingredient_id]
    if (!ing||!consumptionForm.qty) { alert("Select ingredient and quantity"); return }
    await submit("consumption", { ingredient_id:ing.id, ingredient_name:ing.name, qty:parseNum(consumptionForm.qty), unit:ing.unit, notes:consumptionForm.notes, date:consumptionForm.date||new Date().toISOString().slice(0,10), estimated_cost:(parseNum(consumptionForm.qty)||0)*(ing.cost_per_unit||0) })
  }

  async function submitProduction() {
    if (prodType === "product") {
      if (!prodProductSku) { alert("Pilih item terlebih dahulu"); return }
      if (!prodBatchQty || parseNum(prodBatchQty) <= 0) { alert("Masukkan jumlah pack"); return }
      const product = frozenProducts.find(p => p.sku === prodProductSku)
      const lines   = frozenRecipes.filter(l => l.product_id === prodProductSku)
      const packs   = parseNum(prodBatchQty)
      const ingredients_used = lines.map(l => {
        const ing = ingredientsById[l.ingredient_id]
        return { ingredient_id:l.ingredient_id, name:ing?.name||l.ingredient_name||"", qty:Math.round(l.qty*packs*100)/100, unit:l.unit||ing?.unit||"" }
      })
      // No sub_recipe_id/item_id on purpose — approveOne() in StaffSubmissions.jsx only adds
      // output stock when one of those resolves to a real ingredient. A frozen retail pack has
      // no separate finished-goods stock: packing just consumes the prep ingredient directly
      // (deductStock() in POS.jsx skips Frozen Food products at sale time to match).
      await submit("production", {
        product_sku: prodProductSku,
        item_name: product?.name || "",
        batch_qty: packs,
        actual_yield: packs,
        yield_unit: "pack",
        notes: prodNotes,
        date: prodDate||new Date().toISOString().slice(0,10),
        needs_recipe_review: false,
        ingredients_used
      })
      return
    }
    if (!prodSubId) { alert("Pilih resep terlebih dahulu"); return }
    if (!prodBatchQty || parseNum(prodBatchQty) <= 0) { alert("Masukkan jumlah batch"); return }
    const sub     = subRecipes.find(s => s.id === prodSubId)
    const lines   = subRecipeIngs.filter(l => l.sub_recipe_id === prodSubId)
    const batches = parseNum(prodBatchQty)
    const ingredients_used = lines.map(l => {
      const ing = ingredients.find(i => i.id === l.ingredient_id)
      return { ingredient_id:l.ingredient_id, name:ing?.name||"", qty:Math.round(l.qty*batches*100)/100, unit:l.unit||ing?.unit||"" }
    })
    await submit("production", {
      sub_recipe_id: prodSubId,
      item_name: sub?.name || "",
      batch_qty: batches,
      actual_yield: Math.round((sub?.yield_qty||1) * batches * 100)/100,
      yield_unit: sub?.yield_unit || sub?.unit || "gr",
      notes: prodNotes,
      date: prodDate||new Date().toISOString().slice(0,10),
      needs_recipe_review: false,
      ingredients_used
    })
  }

  
  async function submitTrial() {
    if (!trialForm.trialName.trim()) { alert("Nama trial harus diisi"); return }
    const validItems = trialForm.items.filter(i => i.ingredient_id && i.qty)
    if (validItems.length === 0) { alert("Pilih minimal 1 bahan dan qty"); return }
    
    await submit("trial", {
      trialName: trialForm.trialName,
      notes: trialForm.notes,
      items: validItems.map(it => {
        const ing = ingredients.find(x => x.id === it.ingredient_id)
        return {
          ingredient_id: it.ingredient_id,
          ingredient_name: ing?.name,
          qty: parseNum(it.qty),
          unit: it.unit
        }
      })
    })
  }

  async function submitRequisition() {
    const valid = reqItems.filter(i=>i.ingredient_id&&parseNum(i.qty)>0)
    if (!valid.length) { alert("Add at least one item"); return }
    await submit("requisition", {
      needed_by: reqDate, notes: reqNotes,
      items: valid.map(i=>{ const ing=ingredients.find(x=>x.id===i.ingredient_id); return { ingredient_id:i.ingredient_id, ingredient_name:ing?.name||"", qty:parseNum(i.qty), unit:i.unit||ing?.unit||"", supplier:ing?.supplier||"" } })
    })
  }

  function reset(forceHome) {
    setDone(false); setScreen(forceHome || station ? "home" : "consumption"); setStaffName(""); setOpnameSearch("")
    setOpnameDate(new Date().toISOString().slice(0,10))
    setWasteForm({ ingredient_id:"", qty:"", reason:"Expired", notes:"", date:new Date().toISOString().slice(0,10) })
    setConsumptionForm({ ingredient_id:"", qty:"", notes:"", date:new Date().toISOString().slice(0,10) })
    setProdType(""); setProdSubId(""); setProdProductSku(""); setProdBatchQty(""); setProdYield(""); setProdYieldUnit(""); setProdUsed([]); setProdNotes("")
    setProdDate(new Date().toISOString().slice(0,10))
    setReqDate(new Date().toISOString().slice(0,10)); setReqNotes(""); setReqItems([{ ingredient_id:"", qty:"", unit:"" }])
    setTrialForm({ trialName:"", notes:"", items:[{ingredient_id:"", qty:"", unit:""}] })
    if ((stationStaff[station]||[]).length === 1) setStaffName(stationStaff[station][0])
  }

  const stationColor = station ? STATIONS[station].color : "#F59E0B"

  const UOM_OPTIONS = ["kg", "gr", "L", "ml", "pcs", "pack", "ikat", "btg", "lbr", "porsi", "bks", "kaleng", "botol", "cup"]

  const s = {
    wrap:{ height:"100dvh", display:"flex", flexDirection:"column", background:"#f5f6fa", fontFamily:"system-ui,sans-serif", fontSize:15, overflow:"hidden" },
    header:{ background: stationColor, color:"#fff", padding:"12px 18px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:10 },
    body:{ flex:1, overflowY:"auto", overflowX:"hidden", WebkitOverflowScrolling:"touch", padding:"14px 16px", maxWidth:480, margin:"0 auto", paddingBottom:120 },
    card:{ background:"#fff", borderRadius:14, padding:16, marginBottom:12, boxShadow:"0 2px 8px rgba(0,0,0,0.06)" },
    label:{ fontSize:12, fontWeight:700, color:"#666", marginBottom:6, display:"block", textTransform:"uppercase", letterSpacing:"0.4px" },
    input:{ width:"100%", padding:"11px 13px", border:"1.5px solid #e0e0e0", borderRadius:10, fontSize:15, boxSizing:"border-box", fontFamily:"inherit", outline:"none" },
    btn:{ width:"100%", padding:"14px", borderRadius:12, border:"none", fontSize:15, fontWeight:700, cursor:"pointer", marginBottom:8, fontFamily:"inherit" },
    backBtn:{ background:"none", border:"none", color:"#fff", fontSize:22, cursor:"pointer", padding:0, lineHeight:1 },
    fixedBottom:{ position:"fixed", bottom:0, left:0, right:0, padding:"12px 16px", background:"#fff", borderTop:"1px solid #eee", zIndex:10 },
  }

  const Logo = () => (
    <img src="/logo-staff.png" alt="PawonLoka" style={{ height:36, width:36, borderRadius:8, objectFit:"cover" }} />
  )

  // Station picker screen
  if (!station && screen !== "consumption") return (
    <div style={s.wrap}>
      <datalist id="uom-options">{UOM_OPTIONS.map(u=><option key={u} value={u}/>)}</datalist>
      <div style={{ ...s.header, background:"#1a1a2e" }}><Logo /><span style={{ fontSize:17, fontWeight:800 }}>PawonLoka Staff</span></div>
      <div style={s.body}>
        <div style={{ ...s.card, marginTop:24 }}>
          <div style={{ textAlign:"center", marginBottom:24 }}>
            <img src="/logo-staff.png" alt="PawonLoka" style={{ width:72, height:72, borderRadius:14, objectFit:"cover", marginBottom:12 }} />
            <div style={{ fontSize:19, fontWeight:800 }}>Select Your Station</div>
            <div style={{ fontSize:13, color:"#888", marginTop:4 }}>Pick your station to continue</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {Object.entries(STATIONS).map(([name, cfg]) => (
              <button key={name} onClick={()=>setStation(name)}
                style={{ ...s.btn, background:cfg.color, color:"#fff", marginBottom:0, fontSize:17, letterSpacing:"0.3px" }}>
                {name}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, margin:"18px 4px" }}>
          <div style={{ flex:1, height:1, background:"#e0e0e0" }} />
          <span style={{ fontSize:12, color:"#999", fontWeight:700 }}>OR</span>
          <div style={{ flex:1, height:1, background:"#e0e0e0" }} />
        </div>
        <div style={{ ...s.card, padding:0, overflow:"hidden" }}>
          <button onClick={()=>setScreen("consumption")}
            style={{ ...s.btn, background:"#F59E0B", color:"#fff", marginBottom:0, textAlign:"left", display:"flex", alignItems:"center", gap:14, padding:"18px 16px", borderRadius:0 }}>
            <span style={{ fontSize:28 }}>🍽️</span>
            <div>
              <div style={{ fontSize:16 }}>Staff Meal / Personal Use</div>
              <div style={{ fontSize:12, fontWeight:400, opacity:0.85, marginTop:2 }}>Log food or drink you took for yourself</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )

  if (done) return (
    <div style={s.wrap}>
      <datalist id="uom-options">{UOM_OPTIONS.map(u=><option key={u} value={u}/>)}</datalist>
      <div style={s.header}><Logo /><span style={{ fontSize:17, fontWeight:800 }}>{station ? `${station} Station` : "PawonLoka Staff"}</span></div>
      <div style={{ ...s.body, textAlign:"center", paddingTop:60 }}>
        <div style={{ fontSize:56, marginBottom:16 }}>✅</div>
        <div style={{ fontSize:20, fontWeight:800, marginBottom:8 }}>Submitted!</div>
        <div style={{ fontSize:14, color:"#666", marginBottom:28 }}>Report sent to manager for review.</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10, maxWidth:280, margin:"0 auto" }}>
          <button onClick={()=>reset()} style={{ ...s.btn, background:stationColor, color:"#fff", marginBottom:0 }}>Submit Another</button>
          <button onClick={()=>{ reset(true); setStation(null) }} style={{ ...s.btn, background:"#f0f0f0", color:"#333", marginBottom:0 }}>{station ? "Change Station" : "Back to Menu"}</button>
        </div>
      </div>
    </div>
  )

  if (screen==="home") return (
    <div style={s.wrap}>
      <datalist id="uom-options">{UOM_OPTIONS.map(u=><option key={u} value={u}/>)}</datalist>
      <div style={s.header}>
        <Logo />
        <div style={{ flex:1 }}>
          <div style={{ fontSize:17, fontWeight:800 }}>PawonLoka Staff</div>
          <div style={{ fontSize:12, opacity:0.85 }}>{station} Station</div>
        </div>
        <button onClick={()=>setStation(null)} style={{ background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", borderRadius:8, padding:"5px 11px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Change</button>
      </div>
      <div style={s.body}>
        <div style={{ fontSize:13, color:"#888", marginBottom:14, marginTop:4 }}>What do you want to report?</div>
        {MENU_ITEMS.filter(m=>MENUS[station].includes(m.screen)).map(b=>(
          <div key={b.screen} style={{ ...s.card, padding:0, overflow:"hidden" }}>
            <button onClick={()=>setScreen(b.screen)} style={{ ...s.btn, background:b.bg, color:"#fff", marginBottom:0, textAlign:"left", display:"flex", alignItems:"center", gap:14, padding:"18px 16px", borderRadius:0 }}>
              <span style={{ fontSize:28 }}>{b.icon}</span>
              <div>
                <div style={{ fontSize:16 }}>{b.label}</div>
                <div style={{ fontSize:12, fontWeight:400, opacity:0.85, marginTop:2 }}>{b.sub}</div>
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  )

  if (screen==="opname") {
    const filteredOp = opnameCounts.filter(i=>!opnameSearch||i.name.toLowerCase().includes(opnameSearch.toLowerCase()))
    const filledCount = opnameCounts.filter(i=>i.actual_qty!=="").length
    return (
      <div style={s.wrap}>
      <datalist id="uom-options">{UOM_OPTIONS.map(u=><option key={u} value={u}/>)}</datalist>
        <div style={s.header}>
          <button onClick={()=>setScreen("home")} style={s.backBtn}>←</button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:17, fontWeight:800 }}>Stock Count</div>
            <div style={{ fontSize:11, opacity:0.8 }}>{filledCount} items filled</div>
          </div>
        </div>
        <div style={s.body}>
          <div style={{ ...s.card, marginBottom:10 }}>
            <StaffPicker color={stationColor} value={staffName} onChange={setStaffName} staffList={stationStaff[station]||[]} />
          </div>
          <div style={{ ...s.card, marginBottom:10 }}>
            <label style={s.label}>Count Date *</label>
            <input type="date" value={opnameDate} onChange={e=>setOpnameDate(e.target.value)} style={s.input} max={new Date().toISOString().slice(0,10)} />
          </div>
          <div style={{ ...s.card, padding:"10px 12px", marginBottom:10, display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:16 }}>🔍</span>
            <input value={opnameSearch} onChange={e=>setOpnameSearch(e.target.value)} placeholder="Search ingredient..." style={{ ...s.input, border:"none", padding:"4px 0", fontSize:14, flex:1 }} />
            {opnameSearch && <button onClick={()=>setOpnameSearch("")} style={{ background:"none", border:"none", color:"#999", fontSize:18, cursor:"pointer", padding:0 }}>✕</button>}
          </div>
          <div style={{ fontSize:12, color:"#888", marginBottom:10 }}>Only fill items you counted. Leave blank to skip.</div>
          {filteredOp.map((item)=>{
            const realIdx = opnameCounts.findIndex(x=>x.ingredient_id===item.ingredient_id)
            const filled = item.actual_qty !== ""
            return (
              <div key={item.ingredient_id} style={{ ...s.card, padding:"11px 14px", display:"flex", alignItems:"center", gap:10, marginBottom:8, borderLeft:`3px solid ${filled?"#00875A":"#e0e0e0"}` }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</div>
                  <div style={{ fontSize:11, color:"#888" }}>System: {fmt(item.system_qty)} {item.unit}</div>
                </div>
                <input type="text" inputMode="decimal" value={item.actual_qty}
                  onChange={e=>setOpnameCounts(prev=>prev.map((x,i)=>i===realIdx?{...x,actual_qty:e.target.value}:x))}
                  placeholder="—" style={{ ...s.input, width:76, textAlign:"center", padding:"9px 6px", fontSize:15, flexShrink:0, background:filled?"#f0fff8":"#fafafa", borderColor:filled?"#00875A":"#e0e0e0" }} />
                {(item.conversions||[]).length > 0 ? (
                  <select value={item.input_unit||item.unit}
                    onChange={e=>setOpnameCounts(prev=>prev.map((x,i)=>i===realIdx?{...x,input_unit:e.target.value}:x))}
                    style={{ fontSize:11, color:"#888", minWidth:48, flexShrink:0, border:"1px solid #e0e0e0", borderRadius:6, padding:"4px 2px", background:"#fff" }}>
                    <option value={item.unit}>{item.unit}</option>
                    {item.conversions.map(c => <option key={c.unit} value={c.unit}>{c.unit}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize:11, color:"#888", minWidth:24, flexShrink:0 }}>{item.unit}</span>
                )}
              </div>
            )
          })}
        </div>
        <div style={s.fixedBottom}>
          <div style={{ maxWidth:480, margin:"0 auto" }}>
            <button onClick={submitOpname} disabled={saving} style={{ ...s.btn, background:stationColor, color:"#fff", marginBottom:0 }}>{saving?"Submitting...":"Submit Count"+(filledCount>0?` (${filledCount} items)`:"")}</button>
          </div>
        </div>
      </div>
    )
  }

  if (screen==="waste") return (
    <div style={s.wrap}>
      <datalist id="uom-options">{UOM_OPTIONS.map(u=><option key={u} value={u}/>)}</datalist>
      <div style={s.header}>
        <button onClick={()=>setScreen("home")} style={s.backBtn}>←</button>
        <span style={{ fontSize:17, fontWeight:800 }}>Waste / Spoilage</span>
      </div>
      <div style={s.body}>
        <div style={s.card}>
          <StaffPicker color={stationColor} value={staffName} onChange={setStaffName} staffList={stationStaff[station]||[]} />
        </div>
        <div style={s.card}>
          <label style={s.label}>Date *</label>
          <input type="date" value={wasteForm.date} onChange={e=>setWasteForm(f=>({...f,date:e.target.value}))} style={s.input} max={new Date().toISOString().slice(0,10)} />
        </div>
        <div style={s.card}>
          <label style={s.label}>Ingredient / Sub-Recipe *</label>
          <SearchableSelect options={[...ingredients, ...subRecipeOptions].sort((a,b)=>a.name.localeCompare(b.name))} value={wasteForm.ingredient_id} onChange={v=>setWasteForm(f=>({...f,ingredient_id:v}))} placeholder="— Search ingredient or sub-recipe —" />
          <label style={{ ...s.label, marginTop:14 }}>Quantity *</label>
          <input type="text" inputMode="decimal" value={wasteForm.qty} onChange={e=>setWasteForm(f=>({...f,qty:e.target.value}))} style={s.input} placeholder="0" />
          {wasteForm.ingredient_id && wasteForm.qty && (
            <div style={{ marginTop:8, padding:"9px 13px", background:"#fff0ed", borderRadius:10, fontSize:13, color:"#DE350B", fontWeight:700 }}>
              Est. Loss: Rp {fmt((parseNum(wasteForm.qty)||0)*(ingredientsById[wasteForm.ingredient_id]?.cost_per_unit||0))}
            </div>
          )}
          <label style={{ ...s.label, marginTop:14 }}>Reason *</label>
          <select value={wasteForm.reason} onChange={e=>setWasteForm(f=>({...f,reason:e.target.value}))} style={s.input}>
            {REASONS.map(r=><option key={r}>{r}</option>)}
          </select>
          <label style={{ ...s.label, marginTop:14 }}>Notes</label>
          <input value={wasteForm.notes} onChange={e=>setWasteForm(f=>({...f,notes:e.target.value}))}
            style={{ ...s.input, direction:'ltr', unicodeBidi:'plaintext' }} placeholder="Optional"
            dir="ltr" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
        </div>
        <button onClick={submitWaste} disabled={saving} style={{ ...s.btn, background:"#DE350B", color:"#fff" }}>{saving?"Submitting...":"Submit Waste Report"}</button>
      </div>
    </div>
  )

  if (screen==="consumption") return (
    <div style={s.wrap}>
      <datalist id="uom-options">{UOM_OPTIONS.map(u=><option key={u} value={u}/>)}</datalist>
      <div style={s.header}>
        <button onClick={()=>setScreen("home")} style={s.backBtn}>←</button>
        <span style={{ fontSize:17, fontWeight:800 }}>Staff Meal / Personal Use</span>
      </div>
      <div style={s.body}>
        <div style={s.card}>
          <StaffPicker color={stationColor} value={staffName} onChange={setStaffName} staffList={station ? (stationStaff[station]||[]) : allStaff} />
        </div>
        <div style={s.card}>
          <label style={s.label}>Date *</label>
          <input type="date" value={consumptionForm.date} onChange={e=>setConsumptionForm(f=>({...f,date:e.target.value}))} style={s.input} max={new Date().toISOString().slice(0,10)} />
        </div>
        <div style={s.card}>
          <label style={s.label}>Ingredient / Sub-Recipe *</label>
          <SearchableSelect options={[...ingredients, ...subRecipeOptions].sort((a,b)=>a.name.localeCompare(b.name))} value={consumptionForm.ingredient_id} onChange={v=>setConsumptionForm(f=>({...f,ingredient_id:v}))} placeholder="— Search ingredient or sub-recipe —" />
          <label style={{ ...s.label, marginTop:14 }}>Quantity *</label>
          <input type="text" inputMode="decimal" value={consumptionForm.qty} onChange={e=>setConsumptionForm(f=>({...f,qty:e.target.value}))} style={s.input} placeholder="0" />
          {consumptionForm.ingredient_id && consumptionForm.qty && (
            <div style={{ marginTop:8, padding:"9px 13px", background:"#fff8e6", borderRadius:10, fontSize:13, color:"#B45309", fontWeight:700 }}>
              Est. Cost: Rp {fmt((parseNum(consumptionForm.qty)||0)*(ingredientsById[consumptionForm.ingredient_id]?.cost_per_unit||0))}
            </div>
          )}
          <label style={{ ...s.label, marginTop:14 }}>Notes</label>
          <input value={consumptionForm.notes} onChange={e=>setConsumptionForm(f=>({...f,notes:e.target.value}))}
            style={{ ...s.input, direction:'ltr', unicodeBidi:'plaintext' }} placeholder="Optional"
            dir="ltr" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
        </div>
        <button onClick={submitConsumption} disabled={saving} style={{ ...s.btn, background:"#F59E0B", color:"#fff" }}>{saving?"Submitting...":"Submit Report"}</button>
      </div>
    </div>
  )

  if (screen==="production") {
    const selectedSub     = prodType==="sub"     ? subRecipes.find(s => s.id === prodSubId) : null
    const selectedProduct = prodType==="product" ? frozenProducts.find(p => p.sku === prodProductSku) : null
    const selectedItem    = selectedSub || selectedProduct
    const batchQty    = parseNum(prodBatchQty) || 0
    const recipeLines = prodType==="product"
      ? (prodProductSku ? frozenRecipes.filter(l => l.product_id === prodProductSku) : [])
      : (prodSubId ? subRecipeIngs.filter(l => l.sub_recipe_id === prodSubId) : [])
    const preview     = recipeLines.map(l => {
      const ing   = prodType==="product" ? ingredientsById[l.ingredient_id] : ingredients.find(i => i.id === l.ingredient_id)
      const total = l.qty * batchQty
      return { name:ing?.name||l.ingredient_name||"", perBatch:l.qty, unit:l.unit||ing?.unit||"", total, cost:total*(ing?.cost_per_unit||0) }
    })
    const totalCost = preview.reduce((s,p) => s+p.cost, 0)
    const canSubmit = !saving && ((prodType==="sub" && prodSubId) || (prodType==="product" && prodProductSku)) && batchQty > 0
    const productionOptions = [
      ...subRecipes.map(r => ({ id:"sub:"+r.id, name:r.name })),
      ...frozenProducts.map(p => ({ id:"prod:"+p.sku, name:p.name })),
    ].sort((a,b)=>a.name.localeCompare(b.name))
    const productionValue = prodType==="product" ? (prodProductSku?"prod:"+prodProductSku:"") : (prodSubId?"sub:"+prodSubId:"")

    return (
      <div style={s.wrap}>
      <datalist id="uom-options">{UOM_OPTIONS.map(u=><option key={u} value={u}/>)}</datalist>
        <div style={s.header}>
          <button onClick={()=>setScreen("home")} style={s.backBtn}>←</button>
          <span style={{ fontSize:17, fontWeight:800 }}>Production Batch</span>
        </div>
        <div style={s.body}>

          {/* Staff */}
          <div style={s.card}>
            <StaffPicker color={stationColor} value={staffName} onChange={setStaffName} staffList={stationStaff[station]||[]} />
          </div>

          {/* Date */}
          <div style={s.card}>
            <label style={s.label}>Tanggal Produksi *</label>
            <input type="date" value={prodDate} onChange={e=>setProdDate(e.target.value)} style={s.input} max={new Date().toISOString().slice(0,10)} />
          </div>

          {/* Step 1 — Recipe/product selector */}
          <div style={s.card}>
            <label style={s.label}>Item yang diproduksi *</label>
            <SearchableSelect
              options={productionOptions}
              value={productionValue}
              onChange={v => selectProductionTarget(v)}
              placeholder="— Pilih resep atau item frozen —"
            />
            {selectedSub && (
              <div style={{ marginTop:8, padding:"8px 12px", background:"#f0fff8", borderRadius:8, fontSize:12, color:"#00875A", fontWeight:700 }}>
                1 batch = {selectedSub.yield_qty} {selectedSub.yield_unit||"gr"} {selectedSub.name}
              </div>
            )}
            {selectedProduct && (
              <div style={{ marginTop:8, padding:"8px 12px", background:"#f0fff8", borderRadius:8, fontSize:12, color:"#00875A", fontWeight:700 }}>
                1 pack = 1 {selectedProduct.name}
              </div>
            )}
            {!productionOptions.length && (
              <div style={{ fontSize:12, color:"#999", marginTop:8 }}>
                Belum ada resep. Minta manager tambahkan di Backoffice → Recipes.
              </div>
            )}
          </div>

          {/* Step 2 — Batch count */}
          {selectedItem && (
            <div style={s.card}>
              <label style={{ ...s.label, marginBottom:10 }}>{prodType==="product" ? "Berapa pack yang dibuat hari ini? *" : "Berapa resep yang dibuat hari ini? *"}</label>
              <input
                type="text" inputMode="decimal"
                value={prodBatchQty}
                onChange={e => setProdBatchQty(e.target.value)}
                style={{ ...s.input, fontSize:32, fontWeight:900, textAlign:"center", padding:18 }}
                placeholder="0"
              />
            </div>
          )}

          {/* Step 3 — Read-only ingredient preview */}
          {selectedItem && batchQty > 0 && preview.length > 0 && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:10, color:"#444" }}>
                📋 Bahan yang akan dipakai
                <span style={{ fontSize:11, fontWeight:400, color:"#999", marginLeft:6 }}>otomatis dari resep × {batchQty} {prodType==="product"?"pack":"batch"}</span>
              </div>
              {preview.map((p,i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #f5f5f5" }}>
                  <span style={{ fontSize:13, fontWeight:600, color:"#222" }}>{p.name}</span>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:11, color:"#aaa" }}>{p.perBatch} × {batchQty}</div>
                    <div style={{ fontSize:14, fontWeight:800, color:"#00875A" }}>{p.total} {p.unit}</div>
                  </div>
                </div>
              ))}
              {totalCost > 0 && (
                <div style={{ marginTop:10, padding:"9px 13px", background:"#f0fff8", borderRadius:9, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:12, fontWeight:700, color:"#00875A" }}>Estimasi biaya</span>
                  <span style={{ fontSize:15, fontWeight:900, color:"#00875A" }}>Rp {Number(totalCost).toLocaleString("id-ID")}</span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {selectedItem && (
            <div style={s.card}>
              <label style={s.label}>Catatan (opsional)</label>
              <input value={prodNotes} onChange={e=>setProdNotes(e.target.value)}
                style={{ ...s.input, direction:'ltr', unicodeBidi:'plaintext' }} placeholder="Tambah catatan jika perlu..."
                dir="ltr" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
            </div>
          )}

          <button
            onClick={submitProduction}
            disabled={!canSubmit}
            style={{ ...s.btn, background:canSubmit?"#00875A":"#ccc", color:"#fff" }}
          >
            {saving ? "Mengirim..." : "Kirim Laporan Produksi"}
          </button>
        </div>
      </div>
    )
  }

  
  if (screen==="trial") return (
    <div style={s.wrap}>
      <datalist id="uom-options">{UOM_OPTIONS.map(u=><option key={u} value={u}/>)}</datalist>
      <div style={s.header}>
        <div style={{ fontSize:18, fontWeight:800 }}>🧪 Trial / R&D</div>
        <button onClick={()=>setScreen("home")} style={s.backBtn}>←</button>
      </div>
      <div style={s.body}>
        <div style={{ background:"#FEF3C7", padding:12, borderRadius:8, fontSize:12, color:"#92400E", marginBottom:16 }}>
          Mencatat bahan untuk testing resep baru, foto menu, dll. Tidak masuk ke penjualan atau waste.
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={s.label}>Nama Menu/Trial *</div>
          <input list="menu-options" type="text" value={trialForm.trialName} onChange={e=>setTrialForm({...trialForm, trialName:e.target.value})} placeholder="Pilih menu atau ketik nama trial baru..." style={{...s.input, padding:"12px 14px", fontSize:15}} />
          <datalist id="menu-options">
            {allProducts.map(p => <option key={p.sku} value={p.name} />)}
          </datalist>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={s.label}>Catatan (Opsional)</div>
          <input type="text" value={trialForm.notes} onChange={e=>setTrialForm({...trialForm, notes:e.target.value})} placeholder="Contoh: Photoshoot GoFood" style={{...s.input, padding:"12px 14px", fontSize:15}} />
        </div>
        
        <div style={s.label}>Bahan Baku Yang Dipakai *</div>
        <div style={{ ...s.card, padding:10 }}>
          {trialForm.items.map((item, i) => {
            const selIng = ingredients.find(x=>x.id===item.ingredient_id)
            const unitOptions = selIng ? [selIng.unit, ...(selIng.conversions||[]).map(c=>c.unit)].filter((u,idx,arr)=>u&&arr.indexOf(u)===idx) : []
            return (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 70px 60px 28px", gap:6, marginBottom:10, alignItems:"center" }}>
                <SearchableSelect options={ingredients} value={item.ingredient_id} onChange={v=>{ const ing=ingredients.find(x=>x.id===v); setTrialForm(prev=>{ const newArr=[...prev.items]; newArr[i]={...newArr[i], ingredient_id:v, unit:biggestUnit(ing)}; return {...prev, items:newArr} }) }} placeholder="Cari bahan..." />
                <input type="text" inputMode="decimal" value={item.qty} onChange={e=>setTrialForm(prev=>{ const newArr=[...prev.items]; newArr[i]={...newArr[i], qty:e.target.value}; return {...prev, items:newArr} })} style={{ ...s.input, padding:"10px 8px", fontSize:14, textAlign:"center" }} placeholder="0" />
                {unitOptions.length>0
                  ? <select value={item.unit} onChange={e=>setTrialForm(prev=>{ const newArr=[...prev.items]; newArr[i]={...newArr[i], unit:e.target.value}; return {...prev, items:newArr} })} style={{ ...s.input, padding:"10px 6px", fontSize:13, textAlign:"center" }}>
                      {unitOptions.map(u=><option key={u} value={u}>{u}</option>)}
                    </select>
                  : <input list="uom-options" value={item.unit} onChange={e=>setTrialForm(prev=>{ const newArr=[...prev.items]; newArr[i]={...newArr[i], unit:e.target.value}; return {...prev, items:newArr} })} style={{ ...s.input, padding:"10px 6px", fontSize:13, textAlign:"center" }} placeholder="kg" />
                }
                {trialForm.items.length>1 ? <button onClick={()=>setTrialForm(prev=>{ const newArr=prev.items.filter((_,idx)=>idx!==i); return {...prev, items:newArr} })} style={{ background:"none", border:"none", color:"#DE350B", fontSize:18, cursor:"pointer", padding:0 }}>✕</button> : <div/>}
              </div>
            )
          })}
          <button onClick={()=>setTrialForm(prev=>({...prev, items:[...prev.items, {ingredient_id:"", qty:"", unit:""}]}))} style={{ width:"100%", padding:12, background:"#F1F5F9", border:"1px dashed #cbd5e1", borderRadius:8, color:"#475569", fontWeight:600, cursor:"pointer", marginTop:4 }}>+ Tambah Bahan Lain</button>
        </div>
        <button onClick={submitTrial} disabled={saving} style={{ ...s.btn, background:"#6366F1", color:"#fff", marginTop:16 }}>{saving?"Submitting...":"Kirim Trial Menu"}</button>
      </div>
    </div>
  )

  if (screen==="requisition") return (
    <div style={s.wrap}>
      <datalist id="uom-options">{UOM_OPTIONS.map(u=><option key={u} value={u}/>)}</datalist>
      <div style={s.header}>
        <button onClick={()=>setScreen("home")} style={s.backBtn}>←</button>
        <span style={{ fontSize:17, fontWeight:800 }}>Request Ingredients</span>
      </div>
      <div style={s.body}>
        <div style={s.card}>
          <StaffPicker color={stationColor} value={staffName} onChange={setStaffName} staffList={stationStaff[station]||[]} />
        </div>
        <div style={s.card}>
          <div style={{ marginBottom:14 }}>
            <label style={s.label}>Needed By *</label>
            <input type="date" value={reqDate} onChange={e=>setReqDate(e.target.value)} style={s.input} />
          </div>
          <label style={s.label}>Notes</label>
          <input value={reqNotes} onChange={e=>setReqNotes(e.target.value)}
            style={{ ...s.input, direction:'ltr', unicodeBidi:'plaintext' }} placeholder="e.g. urgent, for dinner service..."
            dir="ltr" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
        </div>
        <div style={s.card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:14, fontWeight:700 }}>Items Needed</div>
            <button onClick={()=>setReqItems(prev=>[...prev,{ingredient_id:"",qty:"",unit:""}])} style={{ background:"#374151", border:"none", borderRadius:8, padding:"6px 14px", fontSize:13, cursor:"pointer", fontWeight:700, color:"#fff", fontFamily:"inherit" }}>+ Add Item</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"40px 1fr 70px 60px 28px", gap:6, marginBottom:8 }}>
            {["#","INGREDIENT","QTY","UNIT",""].map((h,i)=><div key={i} style={{ fontSize:10, fontWeight:700, color:"#999", textTransform:"uppercase" }}>{h}</div>)}
          </div>
          {reqItems.map((item,i)=>{
            const selIng = ingredients.find(x=>x.id===item.ingredient_id)
            const unitOptions = selIng ? [selIng.unit, ...(selIng.conversions||[]).map(c=>c.unit)].filter((u,idx,arr)=>u&&arr.indexOf(u)===idx) : []
            return (
            <div key={i} style={{ display:"grid", gridTemplateColumns:"40px 1fr 70px 60px 28px", gap:6, marginBottom:10, alignItems:"center" }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#999", textAlign:"center" }}>{i+1}</div>
              <SearchableSelect options={ingredients} value={item.ingredient_id} onChange={v=>{ const ing=ingredients.find(x=>x.id===v); setReqItems(prev=>prev.map((x,idx)=>idx===i?{...x,ingredient_id:v,unit:biggestUnit(ing)}:x)) }} placeholder="Search..." />
              <input type="text" inputMode="decimal" value={item.qty} onChange={e=>setReqItems(prev=>prev.map((x,idx)=>idx===i?{...x,qty:e.target.value}:x))} style={{ ...s.input, padding:"10px 8px", fontSize:14, textAlign:"center" }} placeholder="0" />
              {unitOptions.length>0
                ? <select value={item.unit} onChange={e=>setReqItems(prev=>prev.map((x,idx)=>idx===i?{...x,unit:e.target.value}:x))} style={{ ...s.input, padding:"10px 6px", fontSize:13, textAlign:"center" }}>
                    {unitOptions.map(u=><option key={u} value={u}>{u}</option>)}
                  </select>
                : <input list="uom-options" value={item.unit} onChange={e=>setReqItems(prev=>prev.map((x,idx)=>idx===i?{...x,unit:e.target.value}:x))} style={{ ...s.input, padding:"10px 6px", fontSize:13, textAlign:"center" }} placeholder="kg" />
              }
              {reqItems.length>1 ? <button onClick={()=>setReqItems(prev=>prev.filter((_,idx)=>idx!==i))} style={{ background:"none", border:"none", color:"#DE350B", fontSize:18, cursor:"pointer", padding:0 }}>✕</button> : <div/>}
            </div>
            )
          })}
        </div>
        <button onClick={submitRequisition} disabled={saving} style={{ ...s.btn, background:"#374151", color:"#fff" }}>{saving?"Submitting...":"Submit Request"}</button>
      </div>
    </div>
  )

  return null
}
