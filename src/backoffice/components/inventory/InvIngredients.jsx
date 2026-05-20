import { useState, useEffect } from "react"
import { supabase } from "../../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }
function fmtDec(n) { return "Rp " + Number(n||0).toLocaleString("id-ID", { minimumFractionDigits:2, maximumFractionDigits:2 }) }

const UNITS = ["gr","kg","ml","L","Galon","pcs","Ekor","butir","biji","buah","ikat","lembar","bungkus","pack","sachet","botol","tsp","tbsp","cup","porsi","portion","slice"]
const EMPTY = { name:"", sku:"", unit:"gr", min_stock:0, stock:0, cost_per_unit:0, supplier:"", category:"General", conversions:[], last_purchase_price:0, last_purchase_unit:"" }

export default function InvIngredients() {
  const [ingredients, setIngredients] = useState([])
  const [suppliers,   setSuppliers]   = useState([])
  const [search,      setSearch]      = useState("")
  const [filter,      setFilter]      = useState("all")
  const [modal,       setModal]       = useState(null)
  const [form,        setForm]        = useState(EMPTY)
  const [convs,       setConvs]       = useState([]) // [{unit, qty, sku, last_price}]
  const [saving,      setSaving]      = useState(false)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data:ings }, { data:sups }] = await Promise.all([
      supabase.from("ingredients").select("*").order("name"),
      supabase.from("suppliers").select("id,name"),
    ])
    setIngredients(ings||[])
    setSuppliers(sups||[])
    setLoading(false)
  }

  const lowStock = ingredients.filter(i => i.min_stock > 0 && i.stock <= i.min_stock && i.stock > 0)
  const outStock = ingredients.filter(i => i.stock <= 0)
  const semi     = ingredients.filter(i => i.category === "Semi-finished")

  const filtered = ingredients
    .filter(i => filter==="low" ? lowStock.includes(i) : filter==="out" ? outStock.includes(i) : filter==="semi" ? semi.includes(i) : true)
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.sku?.toLowerCase().includes(search.toLowerCase()))

  function openAdd() {
    setForm(EMPTY)
    setConvs([])
    setModal("add")
  }

  function openEdit(i) {
    setForm({...i})
    setConvs(i.conversions || [])
    setModal("edit")
  }

  function closeModal() { setModal(null); setForm(EMPTY); setConvs([]) }

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
      category:           form.category||"General",
      conversions:        convs,
      last_purchase_price:parseFloat(form.last_purchase_price)||0,
      last_purchase_unit: form.last_purchase_unit||null,
    }
    if (modal==="add") await supabase.from("ingredients").insert({ ...payload, id:"ING-"+Date.now() })
    else await supabase.from("ingredients").update(payload).eq("id", form.id)
    await load(); closeModal(); setSaving(false)
  }

  async function deleteIngredient(id) {
    if (!confirm("Delete this ingredient?")) return
    await supabase.from("ingredients").delete().eq("id", id)
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
          {[["all",`All (${ingredients.length})`],["low",`Low Stock (${lowStock.length})`],["out",`Out of Stock (${outStock.length})`],["semi",`Semi-finished (${semi.length})`]].map(([f,l])=>(
            <button key={f} onClick={()=>setFilter(f)} className={"bo-btn bo-btn-sm "+(filter===f?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--ink5)" }}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} className="bo-input" placeholder="Search..." style={{ paddingLeft:28, width:180 }} />
          </div>
          <button onClick={openAdd} className="bo-btn bo-btn-primary">+ Add Ingredient</button>
        </div>
      </div>

      <div className="bo-card" style={{ padding:0, overflow:"hidden" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
          <table className="bo-table">
            <thead>
              <tr><th>Ingredient</th><th>SKU</th><th>Category</th><th>Base Unit</th><th>Stock</th><th>Min Stock</th><th>WAC / Unit</th><th>Stock Value</th><th>Supplier</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(i => {
                const val = (i.stock||0)*(i.cost_per_unit||0)
                const st  = stockStatus(i)
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
                    <td><span className="bo-badge bo-badge-blue">{i.category||"General"}</span></td>
                    <td>{i.unit}</td>
                    <td style={{ fontWeight:700, color:st.color }}>{i.stock||0}</td>
                    <td style={{ color:"var(--ink5)" }}>{i.min_stock||"—"}</td>
                    <td>
                      {i.cost_per_unit > 0
                        ? <span style={{ fontWeight:700, color:"var(--ink2)" }}>{fmtDec(i.cost_per_unit)}/{i.unit}</span>
                        : <span style={{ color:"var(--ink5)" }}>—</span>
                      }
                    </td>
                    <td style={{ fontWeight:600 }}>{val>0?fmt(val):"—"}</td>
                    <td style={{ fontSize:12, color:"var(--ink4)" }}>{i.supplier||"—"}</td>
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
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&closeModal()}>
          <div className="bo-modal" style={{ maxWidth:640, maxHeight:"92vh" }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">{modal==="add"?"Add Ingredient":"Edit — "+form.name}</div>
              <button className="bo-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto" }}>

              {/* Basic info */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="bo-input" autoFocus /></div>
                <div><label className="bo-label">SKU</label><input value={form.sku||""} onChange={e=>setForm(f=>({...f,sku:e.target.value}))} className="bo-input" placeholder="Auto if empty" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Category</label>
                  <select value={form.category||"General"} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="bo-select">
                    <option>General</option><option>Semi-finished</option><option>Protein</option><option>Vegetables</option><option>Beverages</option><option>Dry Goods</option><option>Packaging</option><option>Bakery</option>
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
                <div style={{ display:"grid", gridTemplateColumns:"120px 1fr 140px 140px 140px 32px", gap:8, marginBottom:6 }}>
                  {["UNIT *","CONVERSION","HARGA MODAL","HARGA BELI","SKU",""].map((h,i)=>(
                    <div key={i} style={{ fontSize:10, fontWeight:700, color:"var(--ink4)", letterSpacing:"0.5px" }}>{h}</div>
                  ))}
                </div>

                {/* Base unit row (always shown) */}
                <div style={{ display:"grid", gridTemplateColumns:"120px 1fr 140px 140px 140px 32px", gap:8, marginBottom:8, padding:"8px 10px", background:"var(--surface)", borderRadius:"var(--r)", border:"1px solid var(--surface3)" }}>
                  <select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} className="bo-select" style={{ fontSize:12 }}>
                    {UNITS.map(u=><option key={u}>{u}</option>)}
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
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"120px 1fr 140px 140px 140px 32px", gap:8, marginBottom:8, padding:"8px 10px", background:"#fff", borderRadius:"var(--r)", border:"1px solid var(--surface3)" }}>
                      <select value={c.unit} onChange={e=>updateConv(i,"unit",e.target.value)} className="bo-select" style={{ fontSize:12 }}>
                        {UNITS.map(u=><option key={u}>{u}</option>)}
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
    </div>
  )
}
