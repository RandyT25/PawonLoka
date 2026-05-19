import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

const SHAPES = ["square", "round", "rectangle"]
const EMPTY  = { name:"", capacity:4, shape:"square", section:"Indoor", active:true }
const SECTIONS = ["Indoor", "Outdoor", "VIP Room", "Bar"]

export default function FloorPlan() {
  const [tables,  setTables]  = useState([])
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState("All")

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from("tables").select("*").order("name")
    if (error) console.error("FloorPlan load error:", error)
    setTables(data || [])
    setLoading(false)
  }

  const sections = ["All", ...Array.from(new Set(tables.map(t => t.section).filter(Boolean))), ...SECTIONS]
    .filter((v, i, a) => a.indexOf(v) === i)

  const filtered = tables.filter(t => section === "All" || t.section === section)

  function openAdd()   { setForm(EMPTY); setModal("add") }
  function openEdit(t) { setForm({ ...t }); setModal("edit") }
  function closeModal(){ setModal(false); setForm(EMPTY) }

  async function save() {
    if (!form.name) return
    setSaving(true)
    const payload = {
      name:     form.name.trim(),
      capacity: parseInt(form.capacity) || 4,
      shape:    form.shape || "square",
      section:  form.section || "Indoor",
      active:   form.active !== false,
    }
    if (modal === "add") {
      await supabase.from("tables").insert({ ...payload, id: "TBL-" + Date.now() })
    } else {
      await supabase.from("tables").update(payload).eq("id", form.id)
    }
    await load()
    closeModal()
    setSaving(false)
  }

  async function toggleActive(t) {
    await supabase.from("tables").update({ active: !t.active }).eq("id", t.id)
    setTables(prev => prev.map(x => x.id === t.id ? { ...x, active: !x.active } : x))
  }

  async function deleteTable(id) {
    if (!confirm("Delete this table?")) return
    await supabase.from("tables").delete().eq("id", id)
    setTables(prev => prev.filter(t => t.id !== id))
  }

  function TableShape({ shape, name, capacity, active }) {
    const base = {
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      fontWeight:800, fontSize:13, color: active ? "var(--ink)" : "var(--ink5)",
      background: active ? "#fff" : "var(--surface2)",
      border: "2px solid " + (active ? "var(--surface3)" : "var(--surface3)"),
      cursor:"default", userSelect:"none",
    }
    if (shape === "round")
      return <div style={{ ...base, width:72, height:72, borderRadius:"50%" }}><span>{name}</span><span style={{ fontSize:10, color:"var(--ink5)" }}>{capacity}p</span></div>
    if (shape === "rectangle")
      return <div style={{ ...base, width:100, height:60, borderRadius:10 }}><span>{name}</span><span style={{ fontSize:10, color:"var(--ink5)" }}>{capacity}p</span></div>
    return <div style={{ ...base, width:72, height:72, borderRadius:12 }}><span>{name}</span><span style={{ fontSize:10, color:"var(--ink5)" }}>{capacity}p</span></div>
  }

  // Stats
  const total    = tables.length
  const active   = tables.filter(t => t.active).length
  const capacity = tables.reduce((s, t) => s + (t.capacity || 0), 0)

  return (
    <div>
      {/* Stats */}
      <div className="bo-metrics" style={{ gridTemplateColumns:"repeat(3,1fr)", marginBottom:16 }}>
        <div className="bo-met blue">
          <div className="bo-met-label">Total Tables</div>
          <div className="bo-met-val">{total}</div>
        </div>
        <div className="bo-met green">
          <div className="bo-met-label">Active</div>
          <div className="bo-met-val">{active}</div>
        </div>
        <div className="bo-met amber">
          <div className="bo-met-label">Total Capacity</div>
          <div className="bo-met-val">{capacity} pax</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:4 }}>
          {sections.map(s => (
            <button key={s} onClick={() => setSection(s)}
              className={"bo-btn bo-btn-sm " + (section === s ? "bo-btn-primary" : "bo-btn-ghost")}>
              {s}
            </button>
          ))}
        </div>
        <button onClick={openAdd} className="bo-btn bo-btn-primary" style={{ marginLeft:"auto" }}>
          + Add Table
        </button>
      </div>

      {/* Floor grid */}
      {loading ? (
        <div style={{ textAlign:"center", color:"var(--ink5)", padding:40 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bo-card" style={{ textAlign:"center", color:"var(--ink5)", padding:48 }}>
          No tables yet — click + Add Table to get started
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12 }}>
          {filtered.map(t => (
            <div key={t.id} style={{
              background:"#fff", border:"1.5px solid var(--surface3)", borderRadius:16,
              overflow:"hidden", opacity: t.active ? 1 : 0.6
            }}>
              {/* Visual */}
              <div style={{ padding:16, display:"flex", justifyContent:"center", alignItems:"center", background:"var(--surface)", minHeight:100 }}>
                <TableShape shape={t.shape} name={t.name} capacity={t.capacity} active={t.active} />
              </div>
              {/* Info */}
              <div style={{ padding:"10px 14px" }}>
                <div style={{ fontSize:14, fontWeight:800, color:"var(--ink)" }}>{t.name}</div>
                <div style={{ fontSize:11, color:"var(--ink5)", marginTop:2 }}>
                  {t.section} · {t.capacity} pax · {t.shape}
                </div>
                <span className={"bo-badge " + (t.active ? "bo-badge-green" : "bo-badge-amber")} style={{ marginTop:6 }}>
                  {t.active ? "Active" : "Inactive"}
                </span>
              </div>
              {/* Actions */}
              <div style={{ display:"flex", borderTop:"1px solid var(--surface3)" }}>
                <button onClick={() => openEdit(t)} style={{ flex:1, padding:9, fontSize:12, fontWeight:600, color:"var(--ink4)", background:"none", border:"none", borderRight:"1px solid var(--surface3)", cursor:"pointer" }}>Edit</button>
                <button onClick={() => toggleActive(t)} style={{ flex:1, padding:9, fontSize:12, fontWeight:600, color: t.active ? "var(--amber)" : "var(--green)", background:"none", border:"none", borderRight:"1px solid var(--surface3)", cursor:"pointer" }}>
                  {t.active ? "Hide" : "Show"}
                </button>
                <button onClick={() => deleteTable(t.id)} style={{ flex:1, padding:9, fontSize:12, fontWeight:600, color:"var(--red)", background:"none", border:"none", cursor:"pointer" }}>Del</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="bo-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">{modal === "add" ? "Add Table" : "Edit Table"}</div>
              <button className="bo-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div className="bo-form-row">
                <label className="bo-label">Table Name *</label>
                <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} className="bo-input" placeholder="e.g. Table 1, VIP 1" autoFocus />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div>
                  <label className="bo-label">Capacity (pax)</label>
                  <input type="number" min={1} max={20} value={form.capacity} onChange={e => setForm(f=>({...f,capacity:e.target.value}))} className="bo-input" />
                </div>
                <div>
                  <label className="bo-label">Section</label>
                  <select value={form.section} onChange={e => setForm(f=>({...f,section:e.target.value}))} className="bo-select">
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="bo-form-row">
                <label className="bo-label">Shape</label>
                <div style={{ display:"flex", gap:8 }}>
                  {SHAPES.map(sh => (
                    <button key={sh} type="button"
                      onClick={() => setForm(f=>({...f,shape:sh}))}
                      className={"bo-btn bo-btn-sm " + (form.shape===sh ? "bo-btn-primary" : "bo-btn-ghost")}
                      style={{ textTransform:"capitalize" }}>
                      {sh === "round" ? "⭕ Round" : sh === "rectangle" ? "▬ Long" : "⬛ Square"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <label className="bo-label" style={{ marginBottom:0 }}>Active</label>
                <input type="checkbox" checked={form.active !== false} onChange={e => setForm(f=>({...f,active:e.target.checked}))} style={{ width:16, height:16, accentColor:"var(--brand)" }} />
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={closeModal} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving || !form.name} className="bo-btn bo-btn-primary">
                {saving ? "Saving..." : modal === "add" ? "Add Table" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
