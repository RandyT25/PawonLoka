import { useState, useEffect } from "react"
import { supabase } from "../../../lib/supabase"
import { FOOD_CATEGORIES_FALLBACK, SUPPLY_CATEGORIES_FALLBACK, isSupplyCategory, isFoodCategory } from "../../lib/ingredientCategories"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }
function fmtDec(n) { return "Rp " + Number(n||0).toLocaleString("id-ID", { minimumFractionDigits:2, maximumFractionDigits:2 }) }

const UNITS_FALLBACK = ["gr","kg","ml","L","Galon","pcs","Ekor","butir","biji","buah","ikat","lembar","bungkus","pack","sachet","botol","Can","tsp","tbsp","cup","porsi","portion","slice"]
function emptyForm(mode) {
  // No default category or unit pre-selection — every ingredient needs a deliberate choice, not
  // a silent "General"/"gr" fallback (that's exactly how items kept landing in a category nobody
  // meant to pick, or a unit nobody meant to set — see the Lemon Local/gr-vs-pcs waste bug).
  // save() blocks submission until both are actually chosen.
  return { name:"", sku:"", unit:"", min_stock:0, stock:0, cost_per_unit:0, supplier:"",
    category: "",
    track_stock: mode!=="supplies",
    station:["Kitchen"], conversions:[], last_purchase_price:0, last_purchase_unit:"" }
}

export default function InvIngredients({ mode="ingredients" }) {
  const EMPTY = emptyForm(mode)
  const isSupplies = mode==="supplies"
  const bucketFilter = isSupplies ? isSupplyCategory : isFoodCategory
  const [ingredients, setIngredients] = useState([])
  const [suppliers,   setSuppliers]   = useState([])
  const [search,      setSearch]      = useState("")
  const [filter,      setFilter]      = useState("all")
  const [modal,       setModal]       = useState(null)
  const [form,        setForm]        = useState(EMPTY)
  const [convs,       setConvs]       = useState([]) // [{unit, qty, sku, last_price}]
  const [saving,      setSaving]      = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [trackStockTouched, setTrackStockTouched] = useState(false)
  const [unitsList, setUnitsList] = useState(UNITS_FALLBACK)
  const [foodCatsList, setFoodCatsList] = useState(FOOD_CATEGORIES_FALLBACK)
  const [supplyCatsList, setSupplyCatsList] = useState(SUPPLY_CATEGORIES_FALLBACK)
  const [bulkModal, setBulkModal] = useState(false)
  const [bulkRows,  setBulkRows]  = useState([])
  const [bulkSaving,setBulkSaving]= useState(false)
  const [sortBy,  setSortBy]  = useState("name")
  const [sortDir, setSortDir] = useState("asc")
  const [quickEdit, setQuickEdit] = useState(null) // {id, field}
  const [quickVal,  setQuickVal]  = useState("")
  // Ingredients tab also offers Supply categories (grouped, so it's clear which is which) —
  // otherwise anyone adding a cleaning/packaging item from this tab has no correct option
  // and lands on the food-only default, which is how items ended up miscategorized before.
  const categoryOptions = isSupplies ? supplyCatsList : [...foodCatsList, ...supplyCatsList]
  function CategoryOptions() {
    if (isSupplies) return supplyCatsList.map(c=><option key={c}>{c}</option>)
    return <>
      <optgroup label="Food">{foodCatsList.map(c=><option key={c}>{c}</option>)}</optgroup>
      <optgroup label="Supplies">{supplyCatsList.map(c=><option key={c}>{c}</option>)}</optgroup>
    </>
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    supabase.from("app_settings").select("units").eq("id","main").maybeSingle()
      .then(({data}) => { if (data?.units?.length) setUnitsList(data.units.map(u=>u.name)) })
    supabase.from("app_settings").select("food_categories,supply_categories").eq("id","main").maybeSingle()
      .then(({data}) => {
        if (data?.food_categories?.length) setFoodCatsList(data.food_categories.map(c=>c.name))
        if (data?.supply_categories?.length) setSupplyCatsList(data.supply_categories.map(c=>c.name))
      })
  }, [])

  async function load() {
    setLoading(true)
    const [{ data:ings }, { data:sups }] = await Promise.all([
      supabase.from("ingredients").select("*").order("name"),
      supabase.from("suppliers").select("id,name"),
    ])
    setIngredients((ings||[]).filter(i => bucketFilter(i.category)))
    setSuppliers(sups||[])
    setLoading(false)
  }

  const lowStock = ingredients.filter(i => i.min_stock > 0 && i.stock <= i.min_stock && i.stock > 0)
  const outStock = ingredients.filter(i => i.stock <= 0)
  const semi     = ingredients.filter(i => i.category === "Semi-finished")

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d==="asc" ? "desc" : "asc")
    else { setSortBy(col); setSortDir("asc") }
  }

  const filtered = ingredients
    .filter(i => filter==="low" ? lowStock.includes(i) : filter==="out" ? outStock.includes(i) : filter==="semi" ? semi.includes(i) : true)
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.sku?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => {
      let av = a[sortBy], bv = b[sortBy]
      if (sortBy==="stock") { av = av||0; bv = bv||0 }
      else { av = (av||"").toString().toLowerCase(); bv = (bv||"").toString().toLowerCase() }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir==="asc" ? cmp : -cmp
    })

  // Quick edit — click a cell to edit it in place without opening the full modal
  function startQuickEdit(item, field) { setQuickEdit({ id:item.id, field }); setQuickVal(item[field] ?? "") }
  function cancelQuickEdit() { setQuickEdit(null); setQuickVal("") }
  async function saveQuickEdit(item, field) {
    let value = quickVal
    if (field==="stock" || field==="min_stock" || field==="cost_per_unit") value = parseFloat(value)||0
    if (value === (item[field] ?? "")) { cancelQuickEdit(); return }
    await supabase.from("ingredients").update({ [field]: value }).eq("id", item.id)
    setIngredients(prev => prev.map(x => x.id===item.id ? { ...x, [field]:value } : x))
    cancelQuickEdit()
  }

  function openAdd() {
    setForm(EMPTY)
    setConvs([])
    setTrackStockTouched(false)
    setModal("add")
  }

  function openEdit(i) {
    setForm({...i, track_stock: i.track_stock !== false})
    setConvs(i.conversions || [])
    setTrackStockTouched(true)
    setModal("edit")
  }

  function closeModal() { setModal(null); setForm(EMPTY); setConvs([]) }

  // Bulk add — quick multi-row grid for adding several items at once
  function emptyBulkRow() { return { name:"", unit:"", category:"", stock:0, cost_per_unit:0, supplier:"" } }
  function openBulk()            { setBulkRows(Array.from({length:5}, emptyBulkRow)); setBulkModal(true) }
  function closeBulk()           { setBulkModal(false); setBulkRows([]) }
  function addBulkRow()          { setBulkRows(r => [...r, emptyBulkRow()]) }
  function removeBulkRow(i)      { setBulkRows(r => r.filter((_,idx)=>idx!==i)) }
  function updateBulkRow(i,k,v)  { setBulkRows(r => r.map((x,idx)=>idx===i?{...x,[k]:v}:x)) }

  async function saveBulk() {
    const valid = bulkRows.filter(r => r.name.trim())
    if (!valid.length) return
    const missingCat = valid.filter(r => !r.category)
    if (missingCat.length) { alert("Pilih kategori untuk semua baris terlebih dahulu: " + missingCat.map(r=>r.name.trim()).join(", ")); return }
    const missingUnit = valid.filter(r => !r.unit)
    if (missingUnit.length) { alert("Pilih satuan untuk semua baris terlebih dahulu: " + missingUnit.map(r=>r.name.trim()).join(", ")); return }
    setBulkSaving(true)
    const payload = valid.map((r,idx) => ({
      id:            "ING-"+Date.now()+"-"+idx,
      name:          r.name.trim(),
      sku:           r.name.trim().toLowerCase().replace(/\s+/g,"-").slice(0,20),
      unit:          r.unit,
      category:      r.category,
      stock:         parseFloat(r.stock)||0,
      min_stock:     0,
      cost_per_unit: parseFloat(r.cost_per_unit)||0,
      supplier:      r.supplier || null,
      track_stock:   mode!=="supplies",
      station:       ["Kitchen"],
      conversions:   [],
      last_purchase_price: 0,
      last_purchase_unit:  null,
    }))
    const { error } = await supabase.from("ingredients").insert(payload)
    if (error) { alert("Error: "+error.message); setBulkSaving(false); return }
    await load()
    closeBulk()
    setBulkSaving(false)
  }

  // Conversion helpers
  function addConv()        { setConvs(c => [...c, { unit:"kg", qty:1000, sku:"", last_price:0 }]) }
  function removeConv(i)    { setConvs(c => c.filter((_,idx)=>idx!==i)) }
  function updateConv(i,k,v){ setConvs(c => c.map((x,idx)=>idx===i?{...x,[k]:v}:x)) }

  // Cost per base unit from a conversion
  function costPerBase(conv) {
    if (!conv.qty || !conv.last_price) return 0
    return conv.last_price / conv.qty
  }

  // WAC from all conversions that have prices
  function wacFromConvs() {
    const withPrice = convs.filter(c => c.last_price > 0 && c.qty > 0)
    if (!withPrice.length) return form.cost_per_unit || 0
    const totalCost = withPrice.reduce((a,c) => a + c.last_price, 0)
    const totalBase = withPrice.reduce((a,c) => a + parseFloat(c.qty||0), 0)
    return totalBase > 0 ? totalCost / totalBase : 0
  }

  async function save() {
    if (!form.name) return
    if (!form.category) { alert("Pilih kategori terlebih dahulu."); return }
    if (!form.unit) { alert("Pilih satuan terlebih dahulu."); return }
    // Warn on a conversion factor that's almost certainly wrong (e.g. "1 kg = 1 gr" instead of 1000) —
    // this silently inflates WAC by orders of magnitude once a purchase is made in that unit.
    const BIG_UNITS = ["kg","L","Galon","dus","karung","box","sack","pack","sachet","bungkus","botol","ikat"]
    const SMALL_BASE_UNITS = ["gr","ml","pcs"]
    const suspect = convs.find(c =>
      BIG_UNITS.includes(c.unit) && SMALL_BASE_UNITS.includes(form.unit) && (parseFloat(c.qty)||0) <= 1
    )
    if (suspect) {
      const ok = confirm(`1 ${suspect.unit} = ${suspect.qty} ${form.unit} — sepertinya salah (misal maksud Anda 1000?). Simpan juga?`)
      if (!ok) return
    }
    setSaving(true)
    const wac = wacFromConvs()
    const payload = {
      name:               form.name.trim(),
      sku:                form.sku || form.name.toLowerCase().replace(/\s+/g,"-").slice(0,20),
      unit:               form.unit,
      min_stock:          parseFloat(form.min_stock)||0,
      stock:              parseFloat(form.stock)||0,
      cost_per_unit:      wac || parseFloat(form.cost_per_unit)||0,
      supplier:           form.supplier||null,
      category:           form.category,
      track_stock:        form.track_stock !== false,
      station:            Array.isArray(form.station)&&form.station.length ? form.station : ["Kitchen"],
      conversions:        convs,
      last_purchase_price:parseFloat(form.last_purchase_price)||0,
      last_purchase_unit: form.last_purchase_unit||null,
    }
    if (modal==="add") await supabase.from("ingredients").insert({ ...payload, id:"ING-"+Date.now() })
    else await supabase.from("ingredients").update(payload).eq("id", form.id)
    await load(); closeModal(); setSaving(false)
  }

  async function deleteIngredient(id) {
    const { data:pending } = await supabase.from("staff_submissions").select("id,type,data").eq("status","pending")
    const stillReferenced = (pending||[]).some(s =>
      (s.data?.items||[]).some(i => i.ingredient_id === id) ||
      (s.data?.ingredients_used||[]).some(i => i.ingredient_id === id) ||
      s.data?.ingredient_id === id
    )
    const warning = stillReferenced
      ? "This ingredient still has a pending staff submission (stock count / production / waste / request) referencing it. Deleting it now will make that submission show \"ingredient deleted\" when reviewed. Delete anyway?"
      : "Delete this ingredient?"
    if (!confirm(warning)) return
    // Cascade: delete sub_recipe_ingredients, sub_recipes, recipes, market_prices linked to
    // this ingredient — market_prices has a real FK constraint (market_prices_ingredient_id_fkey)
    // that blocks deleting the ingredient if left behind. Check every step's error — a silent
    // failure here (e.g. RLS, FK) would otherwise leave the ingredient live in the DB while the
    // UI acts like it's gone.
    const { error: sriErr } = await supabase.from("sub_recipe_ingredients").delete().eq("ingredient_id", id)
    if (sriErr) { alert("Failed to delete: "+sriErr.message); return }
    const { error: srErr } = await supabase.from("sub_recipes").delete().eq("ingredient_id", id)
    if (srErr) { alert("Failed to delete: "+srErr.message); return }
    const { error: recErr } = await supabase.from("recipes").delete().eq("ingredient_id", id)
    if (recErr) { alert("Failed to delete: "+recErr.message); return }
    const { error: mpErr } = await supabase.from("market_prices").delete().eq("ingredient_id", id)
    if (mpErr) { alert("Failed to delete: "+mpErr.message); return }
    const { error: ingErr } = await supabase.from("ingredients").delete().eq("id", id)
    if (ingErr) { alert("Failed to delete: "+ingErr.message); return }
    setIngredients(prev => prev.filter(i => i.id !== id))
    closeModal()
  }

  function stockStatus(i) {
    if (i.stock <= 0)                              return { color:"var(--red)",   label:"Out" }
    if (i.min_stock > 0 && i.stock <= i.min_stock) return { color:"var(--amber)", label:"Low" }
    return { color:"var(--green)", label:"OK" }
  }

  const wacPreview = wacFromConvs()

  return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {[["all",`All (${ingredients.length})`],["low",`Low Stock (${lowStock.length})`],["out",`Out of Stock (${outStock.length})`],...(isSupplies?[]:[["semi",`Semi-finished (${semi.length})`]])].map(([f,l])=>(
            <button key={f} onClick={()=>setFilter(f)} className={"bo-btn bo-btn-sm "+(filter===f?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--ink5)" }}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} className="bo-input" placeholder="Search..." style={{ paddingLeft:28, width:180 }} />
          </div>
          <button onClick={openBulk} className="bo-btn bo-btn-ghost">+ Bulk Add</button>
          <button onClick={openAdd} className="bo-btn bo-btn-primary">+ Add {isSupplies?"Supply Item":"Ingredient"}</button>
        </div>
      </div>

      <div className="bo-card" style={{ padding:0, overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
          <table className="bo-table">
            <thead>
              <tr>
                <th onClick={()=>toggleSort("name")} style={{ cursor:"pointer", userSelect:"none", whiteSpace:"nowrap" }}>{isSupplies?"Item":"Ingredient"} {sortBy==="name" && (sortDir==="asc"?"▲":"▼")}</th>
                <th>SKU</th>
                <th onClick={()=>toggleSort("category")} style={{ cursor:"pointer", userSelect:"none", whiteSpace:"nowrap" }}>Category {sortBy==="category" && (sortDir==="asc"?"▲":"▼")}</th>
                <th>Unit</th>
                <th onClick={()=>toggleSort("stock")} style={{ cursor:"pointer", userSelect:"none", whiteSpace:"nowrap" }}>Stock {sortBy==="stock" && (sortDir==="asc"?"▲":"▼")}</th>
                <th>Min Stock</th>
                <th>WAC / Unit</th>
                <th>Stock Value</th>
                <th>Supplier</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(i => {
                const val = (i.stock||0)*(i.cost_per_unit||0)
                const st  = stockStatus(i)
                const editing = field => quickEdit?.id===i.id && quickEdit?.field===field
                return (
                  <tr key={i.id}>
                    <td>
                      <div style={{ fontWeight:700 }}>{i.name}</div>
                      {i.category==="Semi-finished" && <div style={{ fontSize:10, fontWeight:700, color:"#6554C0" }}>SEMI-FINISHED</div>}
                      {(i.conversions||[]).length > 0 && (
                        <div style={{ fontSize:10, color:"var(--ink5)" }}>
                          {(i.conversions||[]).map(c => `1 ${c.unit} = ${c.qty} ${i.unit}`).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td style={{ fontFamily:"monospace", fontSize:11, color:"var(--ink5)" }}>{i.sku||"—"}</td>
                    <td onClick={()=>!editing("category")&&startQuickEdit(i,"category")} style={{ cursor:"pointer" }} title="Click to quick-edit">
                      {editing("category") ? (
                        <select autoFocus value={quickVal} onChange={e=>setQuickVal(e.target.value)}
                          onBlur={()=>saveQuickEdit(i,"category")} onKeyDown={e=>{ if(e.key==="Enter") saveQuickEdit(i,"category"); if(e.key==="Escape") cancelQuickEdit() }}
                          className="bo-select" style={{ fontSize:12 }} onClick={e=>e.stopPropagation()}>
                          {categoryOptions.map(c=><option key={c}>{c}</option>)}
                        </select>
                      ) : i.category
                          ? <span className="bo-badge bo-badge-blue">{i.category}</span>
                          : <span className="bo-badge" style={{ background:"var(--red-lt)", color:"var(--red)" }} title="No category set — click to fix">⚠ Uncategorized</span>}
                    </td>
                    <td>{i.unit}</td>
                    <td onClick={()=>!editing("stock")&&startQuickEdit(i,"stock")} style={{ cursor:"pointer", fontWeight:700, color:st.color }} title="Click to quick-edit">
                      {editing("stock") ? (
                        <input autoFocus type="number" value={quickVal} onChange={e=>setQuickVal(e.target.value)}
                          onBlur={()=>saveQuickEdit(i,"stock")} onKeyDown={e=>{ if(e.key==="Enter") saveQuickEdit(i,"stock"); if(e.key==="Escape") cancelQuickEdit() }}
                          className="bo-input" style={{ width:80, fontSize:12 }} onClick={e=>e.stopPropagation()} />
                      ) : (i.stock||0)}
                    </td>
                    <td onClick={()=>!editing("min_stock")&&startQuickEdit(i,"min_stock")} style={{ cursor:"pointer", color:"var(--ink5)" }} title="Click to quick-edit">
                      {editing("min_stock") ? (
                        <input autoFocus type="number" value={quickVal} onChange={e=>setQuickVal(e.target.value)}
                          onBlur={()=>saveQuickEdit(i,"min_stock")} onKeyDown={e=>{ if(e.key==="Enter") saveQuickEdit(i,"min_stock"); if(e.key==="Escape") cancelQuickEdit() }}
                          className="bo-input" style={{ width:80, fontSize:12 }} onClick={e=>e.stopPropagation()} />
                      ) : (i.min_stock||"—")}
                    </td>
                    <td onClick={()=>!editing("cost_per_unit")&&startQuickEdit(i,"cost_per_unit")} style={{ cursor:"pointer" }} title="Click to quick-edit">
                      {editing("cost_per_unit") ? (
                        <input autoFocus type="number" value={quickVal} onChange={e=>setQuickVal(e.target.value)}
                          onBlur={()=>saveQuickEdit(i,"cost_per_unit")} onKeyDown={e=>{ if(e.key==="Enter") saveQuickEdit(i,"cost_per_unit"); if(e.key==="Escape") cancelQuickEdit() }}
                          className="bo-input" style={{ width:100, fontSize:12 }} onClick={e=>e.stopPropagation()} />
                      ) : i.cost_per_unit > 0
                        ? <span style={{ fontWeight:700, color:"var(--ink2)" }}>{fmtDec(i.cost_per_unit)}/{i.unit}</span>
                        : <span style={{ color:"var(--ink5)" }}>—</span>
                      }
                    </td>
                    <td style={{ fontWeight:600 }}>{val>0?fmt(val):"—"}</td>
                    <td onClick={()=>!editing("supplier")&&startQuickEdit(i,"supplier")} style={{ cursor:"pointer", fontSize:12, color:"var(--ink4)" }} title="Click to quick-edit">
                      {editing("supplier") ? (
                        <select autoFocus value={quickVal||""} onChange={e=>setQuickVal(e.target.value)}
                          onBlur={()=>saveQuickEdit(i,"supplier")} onKeyDown={e=>{ if(e.key==="Enter") saveQuickEdit(i,"supplier"); if(e.key==="Escape") cancelQuickEdit() }}
                          className="bo-select" style={{ fontSize:12 }} onClick={e=>e.stopPropagation()}>
                          <option value="">— none —</option>
                          {suppliers.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                        </select>
                      ) : (i.supplier||"—")}
                    </td>
                    <td><span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10, background:st.color+"22", color:st.color }}>{st.label}</span></td>
                    <td>
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={()=>openEdit(i)} className="bo-btn bo-btn-ghost bo-btn-sm">Edit</button>
                        <button onClick={()=>deleteIngredient(i.id)} className="bo-btn bo-btn-danger bo-btn-sm">✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length===0 && <tr><td colSpan={11} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No ingredients found</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&closeModal()}>
          <div className="bo-modal" style={{ maxWidth:820, maxHeight:"92vh" }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">{modal==="add"?`Add ${isSupplies?"Supply Item":"Ingredient"}`:"Edit — "+form.name}</div>
              <button className="bo-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto" }}>

              {/* Basic info */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="bo-input" autoFocus /></div>
                <div><label className="bo-label">SKU</label><input value={form.sku||""} onChange={e=>setForm(f=>({...f,sku:e.target.value}))} className="bo-input" placeholder="Auto if empty" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Category *</label>
                  <select value={form.category||""} onChange={e=>{
                    const category = e.target.value
                    setForm(f=>({ ...f, category, track_stock: trackStockTouched ? f.track_stock : isFoodCategory(category) }))
                  }} className="bo-select" style={!form.category?{ borderColor:"var(--red)" }:undefined}>
                    <option value="">— Select category —</option>
                    <CategoryOptions/>
                  </select>
                </div>

                <div><label className="bo-label">Supplier</label>
                  <select value={form.supplier||""} onChange={e=>setForm(f=>({...f,supplier:e.target.value}))} className="bo-select">
                    <option value="">— Select supplier —</option>
                    {suppliers.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Current Stock</label><input type="number" value={form.stock||0} onChange={e=>setForm(f=>({...f,stock:e.target.value}))} className="bo-input" /></div>
                <div><label className="bo-label">Min Stock Alert</label><input type="number" value={form.min_stock||0} onChange={e=>setForm(f=>({...f,min_stock:e.target.value}))} className="bo-input" /></div>
              </div>
              <div style={{ marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
                <input type="checkbox" id="track_stock" checked={form.track_stock!==false} onChange={e=>{
                  setTrackStockTouched(true)
                  setForm(f=>({...f,track_stock:e.target.checked}))
                }} />
                <label htmlFor="track_stock" className="bo-label" style={{ marginBottom:0, cursor:"pointer" }}>Track Stock (affects Purchase Order stock/cost updates)</label>
              </div>

              {/* UOM Section */}
              <div style={{ borderTop:"1px solid var(--surface3)", paddingTop:16, marginTop:4 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:800, color:"var(--ink)" }}>Unit Information</div>
                    <div style={{ fontSize:11, color:"var(--ink5)", marginTop:2 }}>Define base unit and purchase unit conversions</div>
                  </div>
                  <button onClick={addConv} className="bo-btn bo-btn-ghost bo-btn-sm">+ Add Unit</button>
                </div>

                {/* Header row */}
                <div style={{ display:"grid", gridTemplateColumns:"90px 140px 100px 110px 1fr 28px", gap:8, marginBottom:6 }}>
                  {["UNIT *","CONVERSION","HARGA MODAL","HARGA BELI","SKU",""].map((h,i)=>(
                    <div key={i} style={{ fontSize:10, fontWeight:700, color:"var(--ink4)", letterSpacing:"0.5px" }}>{h}</div>
                  ))}
                </div>

                {/* Base unit row (always shown) */}
                <div style={{ display:"grid", gridTemplateColumns:"90px 140px 100px 110px 1fr 28px", gap:8, marginBottom:8, padding:"8px 10px", background:"var(--surface)", borderRadius:"var(--r)", border:"1px solid var(--surface3)" }}>
                  <select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} className="bo-select" style={!form.unit?{ fontSize:12, borderColor:"var(--red)" }:{ fontSize:12 }}>
                    <option value="">— Satuan —</option>
                    {unitsList.map(u=><option key={u}>{u}</option>)}
                  </select>
                  <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:"var(--ink4)" }}>
                    <span>1</span>
                    <span style={{ fontWeight:700 }}>{form.unit}</span>
                    <span style={{ fontSize:10 }}>(base)</span>
                  </div>
                  <div style={{ fontSize:12, color:"var(--ink3)", display:"flex", alignItems:"center" }}>
                    {form.cost_per_unit > 0 ? fmtDec(form.cost_per_unit) : <span style={{ color:"var(--ink5)" }}>—</span>}
                  </div>
                  <input type="number" value={form.cost_per_unit||0} onChange={e=>setForm(f=>({...f,cost_per_unit:e.target.value}))} className="bo-input" style={{ fontSize:12 }} placeholder="Manual cost" />
                  <div style={{ fontSize:11, color:"var(--ink5)", display:"flex", alignItems:"center" }}>{form.sku||"—"}</div>
                  <div />
                </div>

                {/* Conversion rows */}
                {convs.map((c, i) => {
                  const cpb = c.qty > 0 && c.last_price > 0 ? c.last_price / parseFloat(c.qty) : 0
                  return (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"90px 140px 100px 110px 1fr 28px", gap:8, marginBottom:8, padding:"8px 10px", background:"#fff", borderRadius:"var(--r)", border:"1px solid var(--surface3)" }}>
                      <select value={c.unit} onChange={e=>updateConv(i,"unit",e.target.value)} className="bo-select" style={{ fontSize:12 }}>
                        {unitsList.map(u=><option key={u}>{u}</option>)}
                      </select>
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <input type="number" value={c.qty} onChange={e=>updateConv(i,"qty",e.target.value)} className="bo-input" style={{ width:80, fontSize:12 }} placeholder="1000" />
                        <span style={{ fontSize:12, color:"var(--ink4)", whiteSpace:"nowrap" }}>{form.unit}</span>
                      </div>
                      <div style={{ fontSize:12, color:"var(--ink3)", display:"flex", alignItems:"center" }}>
                        {cpb > 0 ? fmtDec(cpb) : <span style={{ color:"var(--ink5)" }}>—</span>}
                      </div>
                      <input type="number" value={c.last_price||0} onChange={e=>updateConv(i,"last_price",e.target.value)} className="bo-input" style={{ fontSize:12 }} placeholder="Last buy price" />
                      <input value={c.sku||""} onChange={e=>updateConv(i,"sku",e.target.value)} className="bo-input" style={{ fontSize:12 }} placeholder={form.sku+" "+c.unit} />
                      <button onClick={()=>removeConv(i)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize:16, padding:0 }}>✕</button>
                    </div>
                  )
                })}

                {/* Conversion summary */}
                {convs.length > 0 && (
                  <div style={{ fontSize:11, color:"var(--ink5)", marginTop:4 }}>
                    {convs.map(c => `1 ${c.unit} = ${c.qty} ${form.unit}`).join(" · ")}
                  </div>
                )}

                {/* WAC preview */}
                {(convs.some(c=>c.last_price>0) || form.cost_per_unit > 0) && (
                  <div style={{ marginTop:12, padding:"10px 14px", background:"var(--brand-lt)", border:"1px solid rgba(0,102,255,0.2)", borderRadius:"var(--r)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:12, fontWeight:700, color:"var(--brand)" }}>Weighted Avg Cost (WAC)</span>
                    <span style={{ fontSize:15, fontWeight:900, color:"var(--brand)" }}>{fmtDec(wacPreview)}/{form.unit}</span>
                  </div>
                )}
              </div>

            </div>
            <div className="bo-modal-footer">
              <button onClick={closeModal} className="bo-btn bo-btn-ghost">Cancel</button>
              {modal==="edit" && <button onClick={()=>deleteIngredient(form.id)} className="bo-btn bo-btn-danger">Delete</button>}
              <button onClick={save} disabled={saving||!form.name} className="bo-btn bo-btn-primary">{saving?"Saving...":modal==="add"?"Add":"Save"}</button>
            </div>
          </div>
        </div>
      )}

      {bulkModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&closeBulk()}>
          <div className="bo-modal" style={{ maxWidth:920, maxHeight:"92vh" }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">Bulk Add {isSupplies?"Supply Items":"Ingredients"}</div>
                <div style={{ fontSize:11, color:"var(--ink5)", marginTop:2 }}>Fill in as many rows as you need, then save them all at once. Rows with no name are ignored.</div>
              </div>
              <button className="bo-modal-close" onClick={closeBulk}>✕</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 90px 150px 90px 110px 150px 28px", gap:8, marginBottom:6 }}>
                {["NAME *","UNIT","CATEGORY","STOCK","COST/UNIT","SUPPLIER",""].map((h,i)=>(
                  <div key={i} style={{ fontSize:10, fontWeight:700, color:"var(--ink4)", letterSpacing:"0.5px" }}>{h}</div>
                ))}
              </div>
              {bulkRows.map((r,i) => (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 90px 150px 90px 110px 150px 28px", gap:8, marginBottom:6 }}>
                  <input value={r.name} onChange={e=>updateBulkRow(i,"name",e.target.value)} className="bo-input" style={{ fontSize:12 }} placeholder={isSupplies?"e.g. Sedotan":"e.g. Bawang Merah"} />
                  <select value={r.unit} onChange={e=>updateBulkRow(i,"unit",e.target.value)} className="bo-select" style={r.name.trim()&&!r.unit?{ fontSize:12, borderColor:"var(--red)" }:{ fontSize:12 }}>
                    <option value="">— Satuan —</option>
                    {unitsList.map(u=><option key={u}>{u}</option>)}
                  </select>
                  <select value={r.category} onChange={e=>updateBulkRow(i,"category",e.target.value)} className="bo-select" style={r.name.trim()&&!r.category?{ fontSize:12, borderColor:"var(--red)" }:{ fontSize:12 }}>
                    <option value="">— Category —</option>
                    <CategoryOptions/>
                  </select>
                  <input type="number" value={r.stock} onChange={e=>updateBulkRow(i,"stock",e.target.value)} className="bo-input" style={{ fontSize:12 }} placeholder="0" />
                  <input type="number" value={r.cost_per_unit} onChange={e=>updateBulkRow(i,"cost_per_unit",e.target.value)} className="bo-input" style={{ fontSize:12 }} placeholder="0" />
                  <select value={r.supplier} onChange={e=>updateBulkRow(i,"supplier",e.target.value)} className="bo-select" style={{ fontSize:12 }}>
                    <option value="">— Supplier —</option>
                    {suppliers.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                  <button onClick={()=>removeBulkRow(i)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize:16, padding:0 }}>✕</button>
                </div>
              ))}
              <button onClick={addBulkRow} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ marginTop:6 }}>+ Add Row</button>
            </div>
            <div className="bo-modal-footer">
              <button onClick={closeBulk} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={saveBulk} disabled={bulkSaving||!bulkRows.some(r=>r.name.trim())} className="bo-btn bo-btn-primary">
                {bulkSaving ? "Saving..." : `Save ${bulkRows.filter(r=>r.name.trim()).length||""} Item${bulkRows.filter(r=>r.name.trim()).length===1?"":"s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
