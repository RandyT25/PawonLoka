import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n) {
  if (n === 0) return "free"
  return (n > 0 ? "+" : "") + "Rp " + Math.abs(Number(n)).toLocaleString("id-ID")
}

const TYPES = [
  { value:"single", label:"Single select (choose one)" },
  { value:"multi",  label:"Multi select (choose many)" },
  { value:"size",   label:"Size selector" },
]
const TYPE_COLORS = {
  single: { bg:"#E3FCEF", color:"#00875A" },
  multi:  { bg:"#E8F0FF", color:"#0066FF" },
  size:   { bg:"#FFF7E6", color:"#FF8B00" },
}
const EMPTY_MOD = { name:"", type:"single", required:false, linked_cats:[], linked_products:[] }
const EMPTY_OPT = { name:"", price:0, ingredient_id:"", qty:1 }

export default function Modifiers() {
  const [modifiers,  setModifiers]  = useState([])
  const [categories, setCategories] = useState([])
  const [products,   setProducts]   = useState([])
  const [ingredients,setIngredients]= useState([])
  const [prodSearch, setProdSearch]  = useState("")
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(null)
  const [form,       setForm]       = useState(EMPTY_MOD)
  const [options,    setOptions]    = useState([{ ...EMPTY_OPT }])
  const [saving,     setSaving]     = useState(false)
  const [expanded,   setExpanded]   = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data:mods }, { data:cats }, { data:prods }, { data:ings }] = await Promise.all([
      supabase.from("modifier_groups").select("*").order("name"),
      supabase.from("categories").select("*").order("sort"),
      supabase.from("products").select("sku,name,cat,active").eq("active",true).order("name"),
      supabase.from("ingredients").select("id,name,unit").order("name"),
    ])
    setModifiers(mods||[])
    setCategories(cats||[])
    setProducts(prods||[])
    setIngredients(ings||[])
    setLoading(false)
  }

  function openAdd() {
    setForm(EMPTY_MOD)
    setOptions([{ ...EMPTY_OPT }])
    setModal("add")
  }

  function openEdit(m) {
    setForm({
      id: m.id, name: m.name, type: m.type||"single",
      required: m.required||false,
      linked_cats: m.linked_cats||[],
      linked_products: m.linked_products||[],
    })
    setOptions((m.options||[]).length ? m.options.map(o=>({...o})) : [{ ...EMPTY_OPT }])
    setModal("edit")
  }

  function closeModal() { setModal(null); setForm(EMPTY_MOD); setOptions([{ ...EMPTY_OPT }]) }

  function addOption()       { setOptions(o => [...o, { ...EMPTY_OPT }]) }
  function removeOption(i)   { setOptions(o => o.filter((_,idx)=>idx!==i)) }
  function updateOption(i,k,v){ setOptions(o => o.map((x,idx)=>idx===i?{...x,[k]:v}:x)) }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const validOpts = options.filter(o=>o.name.trim()).map(o=>({...o, price:parseFloat(o.price)||0, ingredient_id: o.ingredient_id||null, qty: parseFloat(o.qty)||1}))
    const payload = {
      name:     form.name.trim(),
      type:     form.type,
      required: form.required,
      options:  validOpts,
      linked_cats:     form.linked_cats||[],
      linked_products: form.linked_products||[],
    }
    if (modal==="add") {
      await supabase.from("modifier_groups").insert({ id:"MOD-"+Date.now(), ...payload })
    } else {
      await supabase.from("modifier_groups").update(payload).eq("id", form.id)
    }
    await load(); closeModal(); setSaving(false)
  }

  async function deleteModifier(id) {
    if (!confirm("Delete this modifier group?")) return
    await supabase.from("modifier_groups").delete().eq("id", id)
    setModifiers(prev=>prev.filter(m=>m.id!==id))
  }

  function toggleExpand(id) { setExpanded(e=>({...e,[id]:!e[id]})) }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <span style={{ fontSize:13, color:"var(--ink4)", fontWeight:600 }}>{modifiers.length} modifier groups</span>
        <button onClick={openAdd} className="bo-btn bo-btn-primary">+ Add Modifier Group</button>
      </div>

      {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {modifiers.map(m => {
            const tc = TYPE_COLORS[m.type]||TYPE_COLORS.single
            const isOpen = expanded[m.id]
            return (
              <div key={m.id} className="bo-card" style={{ marginBottom:0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, flex:1 }}>
                    <button onClick={()=>toggleExpand(m.id)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, color:"var(--ink4)", padding:0 }}>{isOpen?"▼":"▶"}</button>
                    <div>
                      <div style={{ fontWeight:800, fontSize:14 }}>{m.name}</div>
                      <div style={{ display:"flex", gap:6, marginTop:3, flexWrap:"wrap" }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10, background:tc.bg, color:tc.color }}>{m.type}</span>
                        {m.required && <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10, background:"var(--red-lt)", color:"var(--red)" }}>Required</span>}
                        <span style={{ fontSize:11, color:"var(--ink5)" }}>{(m.options||[]).length} options</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={()=>openEdit(m)} className="bo-btn bo-btn-ghost bo-btn-sm">Edit</button>
                    <button onClick={()=>deleteModifier(m.id)} className="bo-btn bo-btn-danger bo-btn-sm">Delete</button>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid var(--surface3)" }}>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                      {(m.options||[]).map((o,i)=>(
                        <div key={i} style={{ padding:"6px 12px", background:"var(--surface)", borderRadius:"var(--r)", fontSize:13 }}>
                          <span style={{ fontWeight:600 }}>{o.name}</span>
                          <span style={{ color:"var(--ink4)", marginLeft:6 }}>{fmt(o.price||0)}</span>
                        </div>
                      ))}
                      {!(m.options||[]).length && <div style={{ fontSize:13, color:"var(--ink5)" }}>No options yet</div>}
                    </div>
                    {(m.linked_cats||[]).length > 0 && (
                      <div style={{ marginTop:10, fontSize:11, color:"var(--ink5)" }}>
                        Linked categories: {(m.linked_cats||[]).join(", ")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {modifiers.length===0 && (
            <div style={{ textAlign:"center", color:"var(--ink5)", padding:48, fontSize:14 }}>
              No modifier groups yet. Click + Add to create one.
            </div>
          )}
        </div>
      )}

      {modal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&closeModal()}>
          <div className="bo-modal" style={{ maxWidth:560, maxHeight:"92vh" }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">{modal==="add"?"Add Modifier Group":"Edit — "+form.name}</div>
              <button className="bo-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div>
                  <label className="bo-label">Name *</label>
                  <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="bo-input" autoFocus placeholder="e.g. Spice Level" />
                </div>
                <div>
                  <label className="bo-label">Type</label>
                  <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="bo-select">
                    {TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:16 }}>
                <input type="checkbox" checked={form.required} onChange={e=>setForm(f=>({...f,required:e.target.checked}))} style={{ width:16, height:16, accentColor:"var(--brand)" }} />
                <span style={{ fontSize:13, fontWeight:600 }}>Required (customer must choose)</span>
              </label>

              <div style={{ borderTop:"1px solid var(--surface3)", paddingTop:14, marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <label className="bo-label" style={{ marginBottom:0 }}>Options</label>
                  <button onClick={addOption} className="bo-btn bo-btn-ghost bo-btn-sm">+ Add Option</button>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 90px 140px 60px 36px", gap:8, marginBottom:6 }}>
                  {["OPTION NAME","PRICE (+/-)","LINK INGREDIENT","QTY",""].map((h,i)=><div key={i} style={{ fontSize:10, fontWeight:700, color:"var(--ink4)" }}>{h}</div>)}
                </div>
                {options.map((opt,i)=>(
                  <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 90px 140px 60px 36px", gap:8, marginBottom:8 }}>
                    <input value={opt.name} onChange={e=>updateOption(i,"name",e.target.value)} className="bo-input" placeholder="e.g. Extra Spicy" />
                    <input type="number" value={opt.price||""} onChange={e=>updateOption(i,"price",e.target.value)} onFocus={e=>{if(e.target.value==="0")e.target.select()}} className="bo-input" placeholder="0" />
                    <select value={opt.ingredient_id||""} onChange={e=>updateOption(i,"ingredient_id",e.target.value)} className="bo-select" style={{ fontSize:12, padding:"0 6px" }}>
                      <option value="">-- None --</option>
                      {ingredients.map(ing=><option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>)}
                    </select>
                    <input type="number" value={opt.qty||""} onChange={e=>updateOption(i,"qty",e.target.value)} disabled={!opt.ingredient_id} className="bo-input" placeholder="1" min="0" step="any" />
                    <button onClick={()=>removeOption(i)} className="bo-btn bo-btn-danger bo-btn-sm" style={{ padding:"0 10px" }}>✕</button>
                  </div>
                ))}
                {options.length===0 && <div style={{ fontSize:12, color:"var(--ink5)", padding:"8px 0" }}>Add at least one option</div>}
              </div>

              <div>
                <label className="bo-label">Link to Categories (optional)</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {categories.map(cat=>{
                    const linked = (form.linked_cats||[]).includes(cat.id||cat.name)
                    return (
                      <button key={cat.id||cat.name} onClick={()=>setForm(f=>({...f,linked_cats:linked?(f.linked_cats||[]).filter(x=>x!==(cat.id||cat.name)):[...(f.linked_cats||[]),cat.id||cat.name]}))}
                        style={{ padding:"5px 12px", borderRadius:20, fontSize:12, fontWeight:600, cursor:"pointer", border:"1.5px solid "+(linked?"var(--brand)":"var(--surface3)"), background:linked?"var(--brand-lt)":"#fff", color:linked?"var(--brand)":"var(--ink4)" }}>
                        {cat.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{borderTop:"1px solid var(--surface3)",paddingTop:14,marginTop:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <label className="bo-label" style={{marginBottom:0}}>Link to Products</label>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {(form.linked_products||[]).length>0 && <span style={{fontSize:11,fontWeight:700,color:"var(--brand)"}}>{(form.linked_products||[]).length} selected</span>}
                    <button onClick={()=>setForm(f=>({...f,linked_products:[]}))} className="bo-btn bo-btn-ghost bo-btn-sm" style={{fontSize:11}}>Clear all</button>
                  </div>
                </div>
                <input value={prodSearch} onChange={e=>setProdSearch(e.target.value)} className="bo-input" placeholder="Search products..." style={{marginBottom:10}} />
                <div style={{maxHeight:240,overflowY:"auto",border:"1px solid var(--surface3)",borderRadius:8}}>
                  {(() => {
                    const cats = [...new Set(products.map(p=>p.cat).filter(Boolean))]
                    const filtered = products.filter(p=>!prodSearch||p.name.toLowerCase().includes(prodSearch.toLowerCase()))
                    if(filtered.length===0) return <div style={{padding:16,textAlign:"center",color:"var(--ink5)",fontSize:12}}>No products found</div>
                    const groups = prodSearch ? {"All Results": filtered} : cats.reduce((g,cat)=>{ g[cat]=filtered.filter(p=>p.cat===cat); return g },{})
                    return Object.entries(groups).filter(([,ps])=>ps.length>0).map(([cat,ps])=>(
                      <div key={cat}>
                        <div style={{padding:"6px 12px",background:"var(--surface)",fontSize:10,fontWeight:800,color:"var(--ink4)",textTransform:"uppercase",letterSpacing:"0.5px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid var(--surface3)"}}>
                          <span>{cat}</span>
                          <button onClick={()=>{
                            const skus=ps.map(p=>p.sku)
                            const allLinked=skus.every(s=>(form.linked_products||[]).includes(s))
                            setForm(f=>({...f,linked_products:allLinked?(f.linked_products||[]).filter(x=>!skus.includes(x)):[...new Set([...(f.linked_products||[]),...skus])]}))
                          }} style={{fontSize:10,fontWeight:700,color:"var(--brand)",background:"none",border:"none",cursor:"pointer"}}>
                            {ps.every(p=>(form.linked_products||[]).includes(p.sku))?"Deselect all":"Select all"}
                          </button>
                        </div>
                        {ps.map(p=>{
                          const linked=(form.linked_products||[]).includes(p.sku)
                          return (
                            <div key={p.sku} onClick={()=>setForm(f=>({...f,linked_products:linked?(f.linked_products||[]).filter(x=>x!==p.sku):[...(f.linked_products||[]),p.sku]}))}
                              style={{padding:"8px 12px",display:"flex",alignItems:"center",gap:8,cursor:"pointer",borderBottom:"1px solid var(--surface)",background:linked?"var(--brand-lt)":"#fff"}}
                              onMouseEnter={e=>e.currentTarget.style.background=linked?"var(--brand-lt)":"var(--surface)"}
                              onMouseLeave={e=>e.currentTarget.style.background=linked?"var(--brand-lt)":"#fff"}>
                              <div style={{width:16,height:16,borderRadius:4,border:"1.5px solid "+(linked?"var(--brand)":"var(--surface3)"),background:linked?"var(--brand)":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                                {linked && <span style={{color:"#fff",fontSize:10,fontWeight:900}}>v</span>}
                              </div>
                              <span style={{fontSize:13,fontWeight:linked?700:400,color:linked?"var(--brand)":"var(--ink)"}}>{p.name}</span>
                            </div>
                          )
                        })}
                      </div>
                    ))
                  })()}
                </div>
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={closeModal} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving||!form.name.trim()} className="bo-btn bo-btn-primary">{saving?"Saving...":modal==="add"?"Add":"Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
