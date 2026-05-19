import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

const COLORS = ["#0066FF","#00875A","#FF8B00","#DE350B","#6554C0","#00B8D9","#FF5630","#36B37E"]
const EMPTY  = { name:"", icon:"🏷", color:"#0066FF" }

export default function Categories() {
  const [cats,     setCats]     = useState([])
  const [products, setProducts] = useState([])
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState(EMPTY)
  const [saving,   setSaving]   = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [dragIdx,  setDragIdx]  = useState(null)
  const [showMap,  setShowMap]  = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("categories").select("*").order("sort"),
      supabase.from("products").select("sku,name,icon,cat").order("name"),
    ])
    setCats(c || [])
    setProducts(p || [])
    setLoading(false)
  }

  function countProducts(catName) {
    return products.filter(p => p.cat === catName).length
  }

  function getProducts(catName) {
    return products.filter(p => p.cat === catName)
  }

  function openAdd()  { setForm(EMPTY); setModal("add") }
  function openEdit(c){ setForm({ ...c }); setModal("edit") }
  function closeModal(){ setModal(false); setForm(EMPTY) }

  async function save() {
    if (!form.name) return
    setSaving(true)
    const payload = { name:form.name.trim(), icon:form.icon||"🏷", color:form.color||"#0066FF" }
    if (modal === "add") {
      const maxSort = cats.length ? Math.max(...cats.map(c=>c.sort||0)) : 0
      await supabase.from("categories").insert({ ...payload, id:"CAT-"+Date.now(), sort:maxSort+1 })
    } else {
      await supabase.from("categories").update(payload).eq("id", form.id)
    }
    await load()
    closeModal()
    setSaving(false)
  }

  async function deleteCategory(id, name) {
    const count = products.filter(p => p.cat === name).length
    if (count > 0) { alert(`Cannot delete — ${count} products are in this category. Reassign them first.`); return }
    if (!confirm(`Delete category "${name}"?`)) return
    await supabase.from("categories").delete().eq("id", id)
    setCats(prev => prev.filter(c => c.id !== id))
  }

  // Drag to reorder
  function onDragStart(i) { setDragIdx(i) }
  function onDragOver(e, i) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === i) return
    const reordered = [...cats]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(i, 0, moved)
    setDragIdx(i)
    setCats(reordered)
  }
  async function onDragEnd() {
    setDragIdx(null)
    // Save new sort order
    await Promise.all(cats.map((c, i) =>
      supabase.from("categories").update({ sort: i + 1 }).eq("id", c.id)
    ))
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:13, color:"var(--ink4)", fontWeight:600 }}>{cats.length} categories · Drag to reorder</span>
          <button onClick={()=>setShowMap(s=>!s)} className="bo-btn bo-btn-ghost bo-btn-sm">
            {showMap ? "Hide" : "Show"} Category → Products Map
          </button>
        </div>
        <button onClick={openAdd} className="bo-btn bo-btn-primary">+ Add Category</button>
      </div>

      {loading ? (
        <div style={{ textAlign:"center", color:"var(--ink5)", padding:40 }}>Loading...</div>
      ) : (
        <>
          {/* Category list */}
          <div className="bo-card" style={{ padding:0, overflow:"hidden", marginBottom:16 }}>
            <table className="bo-table">
              <thead>
                <tr>
                  <th style={{ width:40 }}></th>
                  <th style={{ width:60 }}>Icon</th>
                  <th style={{ width:40 }}>#</th>
                  <th>Name</th>
                  <th>Products</th>
                  <th>Color</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c, i) => (
                  <tr key={c.id}
                    draggable
                    onDragStart={() => onDragStart(i)}
                    onDragOver={e => onDragOver(e, i)}
                    onDragEnd={onDragEnd}
                    style={{ cursor:"grab", background: dragIdx===i ? "var(--brand-lt)" : "transparent" }}
                  >
                    <td style={{ color:"var(--ink5)", fontSize:18, textAlign:"center", cursor:"grab" }}>⠿</td>
                    <td style={{ fontSize:28, textAlign:"center" }}>{c.icon}</td>
                    <td style={{ color:"var(--ink5)", fontWeight:700, textAlign:"center" }}>{i+1}</td>
                    <td style={{ fontWeight:800, fontSize:14, color:"var(--ink)" }}>{c.name}</td>
                    <td>
                      <span style={{ fontSize:12, fontWeight:700, color:"var(--ink3)" }}>
                        {countProducts(c.name)} products
                      </span>
                    </td>
                    <td>
                      <div style={{ width:24, height:24, borderRadius:6, background:c.color||"var(--brand)" }} />
                    </td>
                    <td>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={()=>openEdit(c)} className="bo-btn bo-btn-ghost bo-btn-sm">Edit</button>
                        <button onClick={()=>deleteCategory(c.id,c.name)} className="bo-btn bo-btn-danger bo-btn-sm">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {cats.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No categories yet</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Category → Products Map */}
          {showMap && (
            <div className="bo-card">
              <div className="bo-card-title">Category → Products Map</div>
              <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                {cats.map(c => {
                  const prods = getProducts(c.name)
                  return (
                    <div key={c.id} style={{ display:"flex", alignItems:"flex-start", padding:"10px 0", borderBottom:"1px solid var(--surface2)", gap:12 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:180, flexShrink:0 }}>
                        <span style={{ fontSize:20 }}>{c.icon}</span>
                        <span style={{ fontWeight:800, fontSize:13, color:"var(--ink)" }}>{c.name}</span>
                        <span style={{ fontSize:11, fontWeight:700, color:"var(--ink5)", background:"var(--surface)", padding:"2px 7px", borderRadius:10 }}>{prods.length}</span>
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:4, flex:1 }}>
                        {prods.map(p => (
                          <span key={p.sku} style={{ fontSize:11, background:"var(--surface)", border:"1px solid var(--surface3)", borderRadius:20, padding:"3px 10px", color:"var(--ink3)", fontWeight:500 }}>
                            {p.icon} {p.name}
                          </span>
                        ))}
                        {prods.length === 0 && <span style={{ fontSize:11, color:"var(--ink5)" }}>No products</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {modal && (
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&closeModal()}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">{modal==="add"?"Add Category":"Edit Category"}</div>
              <button className="bo-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div style={{ display:"grid", gridTemplateColumns:"64px 1fr", gap:12, marginBottom:14 }}>
                <div>
                  <label className="bo-label">Icon</label>
                  <input value={form.icon} onChange={e=>setForm(f=>({...f,icon:e.target.value}))} className="bo-input" style={{ textAlign:"center", fontSize:24, padding:"6px" }} />
                </div>
                <div>
                  <label className="bo-label">Name *</label>
                  <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="bo-input" placeholder="Category name" autoFocus />
                </div>
              </div>
              <div className="bo-form-row">
                <label className="bo-label">Color</label>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
                  {COLORS.map(c => (
                    <div key={c} onClick={()=>setForm(f=>({...f,color:c}))}
                      style={{ width:30, height:30, borderRadius:"50%", background:c, cursor:"pointer", border:form.color===c?"3px solid var(--ink)":"3px solid transparent", transform:form.color===c?"scale(1.15)":"scale(1)", transition:"all 0.15s" }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={closeModal} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving||!form.name} className="bo-btn bo-btn-primary">
                {saving?"Saving...":modal==="add"?"Add":"Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
