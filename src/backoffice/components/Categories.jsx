
import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

const COLORS = ["#0066FF","#00875A","#FF8B00","#DE350B","#6554C0","#00B8D9","#FF5630","#36B37E"]
const EMPTY  = { name:"", icon:"🏷", color:"#0066FF" }

export default function Categories() {
  const [cats, setCats]     = useState([])
  const [products, setProducts] = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("categories").select("*").order("name"),
      supabase.from("products").select("id,category"),
    ])
    setCats(c || [])
    setProducts(p || [])
    setLoading(false)
  }

  function countProducts(catName) {
    return products.filter(p => p.category === catName).length
  }

  function openAdd() { setForm(EMPTY); setModal("add") }
  function openEdit(c) { setForm({ ...c }); setModal("edit") }
  function closeModal() { setModal(false); setForm(EMPTY) }

  async function save() {
    if (!form.name) return
    setSaving(true)
    const payload = { name: form.name.trim(), icon: form.icon || "🏷", color: form.color || "#0066FF" }
    if (modal === "add") {
      await supabase.from("categories").insert({ ...payload, id: "CAT-" + Date.now() })
    } else {
      await supabase.from("categories").update(payload).eq("id", form.id)
    }
    await load()
    closeModal()
    setSaving(false)
  }

  async function deleteCategory(id, name) {
    const count = products.filter(p => p.category === name).length
    if (count > 0) { alert("Cannot delete — " + count + " products are in this category. Reassign them first."); return }
    if (!confirm("Delete category " + name + "?")) return
    await supabase.from("categories").delete().eq("id", id)
    setCats(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
        <button onClick={openAdd} className="bo-btn bo-btn-primary">+ Add Category</button>
      </div>

      {loading ? (
        <div style={{ textAlign:"center", color:"var(--ink5)", padding:40 }}>Loading...</div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 }}>
          {cats.map(c => (
            <div key={c.id} style={{ background:"#fff", border:"1.5px solid var(--surface3)", borderRadius:16, overflow:"hidden" }}>
              <div style={{ height:72, background: c.color || "#0066FF", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px" }}>
                <span style={{ fontSize:32 }}>{c.icon}</span>
                <span style={{ fontSize:11, fontWeight:700, background:"rgba(255,255,255,0.2)", color:"#fff", padding:"2px 8px", borderRadius:20 }}>
                  {countProducts(c.name)} items
                </span>
              </div>
              <div style={{ padding:"12px 14px" }}>
                <div style={{ fontSize:14, fontWeight:800, color:"var(--ink)" }}>{c.name}</div>
              </div>
              <div style={{ display:"flex", borderTop:"1px solid var(--surface3)" }}>
                <button onClick={() => openEdit(c)} style={{ flex:1, padding:9, fontSize:12, fontWeight:600, color:"var(--ink4)", background:"none", border:"none", borderRight:"1px solid var(--surface3)", cursor:"pointer" }}>Edit</button>
                <button onClick={() => deleteCategory(c.id, c.name)} style={{ flex:1, padding:9, fontSize:12, fontWeight:600, color:"var(--red)", background:"none", border:"none", cursor:"pointer" }}>Delete</button>
              </div>
            </div>
          ))}
          {cats.length === 0 && (
            <div style={{ gridColumn:"1/-1", textAlign:"center", color:"var(--ink5)", padding:40 }}>No categories yet</div>
          )}
        </div>
      )}

      {modal && (
        <div className="bo-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">{modal === "add" ? "Add Category" : "Edit Category"}</div>
              <button className="bo-modal-close" onClick={closeModal}>x</button>
            </div>
            <div className="bo-modal-body">
              <div style={{ display:"grid", gridTemplateColumns:"64px 1fr", gap:12, marginBottom:14 }}>
                <div>
                  <label className="bo-label">Icon</label>
                  <input value={form.icon} onChange={e => setForm(f=>({...f, icon:e.target.value}))} className="bo-input" style={{ textAlign:"center", fontSize:24, padding:"6px" }} />
                </div>
                <div>
                  <label className="bo-label">Name *</label>
                  <input value={form.name} onChange={e => setForm(f=>({...f, name:e.target.value}))} className="bo-input" placeholder="Category name" autoFocus />
                </div>
              </div>
              <div className="bo-form-row">
                <label className="bo-label">Color</label>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
                  {COLORS.map(c => (
                    <div key={c} onClick={() => setForm(f=>({...f, color:c}))}
                      style={{ width:30, height:30, borderRadius:"50%", background:c, cursor:"pointer", border: form.color===c ? "3px solid var(--ink)" : "3px solid transparent", transform: form.color===c ? "scale(1.15)" : "scale(1)", transition:"all 0.15s" }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={closeModal} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving || !form.name} className="bo-btn bo-btn-primary">
                {saving ? "Saving..." : modal === "add" ? "Add" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
