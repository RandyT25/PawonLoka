
import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

const TYPES  = ["Percentage","Fixed Amount","Buy X Get Y","Free Item"]
const EMPTY  = { name:"", type:"Percentage", value:"", minOrder:"", code:"", active:true, startDate:"", endDate:"", description:"" }

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }

export default function Promotions() {
  const [promos, setPromos]   = useState([])
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from("promos").select("*").order("created_at", { ascending: false })
    setPromos(data || [])
    setLoading(false)
  }

  function openAdd()  { setForm(EMPTY); setModal("add") }
  function openEdit(p){ setForm({ ...p, value: String(p.value||""), minOrder: String(p.min_order||"") }); setModal("edit") }
  function closeModal(){ setModal(false); setForm(EMPTY) }

  async function save() {
    if (!form.name || !form.value) return
    setSaving(true)
    const payload = {
      name:        form.name.trim(),
      type:        form.type,
      value:       parseFloat(form.value) || 0,
      min_order:   parseInt(form.minOrder) || 0,
      code:        form.code?.trim().toUpperCase() || null,
      active:      form.active !== false,
      start_date:  form.startDate || null,
      end_date:    form.endDate || null,
      description: form.description || null,
    }
    if (modal === "add") {
      await supabase.from("promos").insert({ ...payload, id: "PROMO-" + Date.now() })
    } else {
      await supabase.from("promos").update(payload).eq("id", form.id)
    }
    await load()
    closeModal()
    setSaving(false)
  }

  async function toggleActive(p) {
    await supabase.from("promos").update({ active: !p.active }).eq("id", p.id)
    setPromos(prev => prev.map(x => x.id === p.id ? { ...x, active: !x.active } : x))
  }

  async function deletePromo(id) {
    if (!confirm("Delete this promotion?")) return
    await supabase.from("promos").delete().eq("id", id)
    setPromos(prev => prev.filter(p => p.id !== id))
  }

  function displayValue(p) {
    if (p.type === "Percentage")   return p.value + "%"
    if (p.type === "Fixed Amount") return fmt(p.value)
    return String(p.value)
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:13, color:"var(--ink4)" }}>
          {promos.filter(p=>p.active).length} active · {promos.length} total
        </div>
        <button onClick={openAdd} className="bo-btn bo-btn-primary">+ Add Promotion</button>
      </div>

      {loading ? (
        <div style={{ textAlign:"center", color:"var(--ink5)", padding:40 }}>Loading...</div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
          {promos.map(p => (
            <div key={p.id} style={{ background: p.active ? "var(--brand-lt)" : "#fff", border: "1.5px solid " + (p.active ? "rgba(0,102,255,0.25)" : "var(--surface3)"), borderRadius:16, padding:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:"var(--ink)" }}>{p.name}</div>
                  <div style={{ fontSize:11, color:"var(--ink5)", marginTop:2 }}>{p.type}</div>
                </div>
                <span className={"bo-badge " + (p.active ? "bo-badge-green" : "bo-badge-amber")}>
                  {p.active ? "Active" : "Off"}
                </span>
              </div>
              <div style={{ fontSize:28, fontWeight:900, color:"var(--brand)", letterSpacing:-1, marginBottom:4 }}>
                {displayValue(p)}
              </div>
              {p.code && (
                <div style={{ fontSize:12, fontWeight:700, color:"var(--ink3)", marginBottom:4 }}>
                  Code: <span style={{ fontFamily:"monospace", background:"var(--surface2)", padding:"2px 8px", borderRadius:6 }}>{p.code}</span>
                </div>
              )}
              {p.min_order > 0 && (
                <div style={{ fontSize:11, color:"var(--ink5)", marginBottom:4 }}>Min order: {fmt(p.min_order)}</div>
              )}
              {(p.start_date || p.end_date) && (
                <div style={{ fontSize:11, color:"var(--ink5)", marginBottom:8 }}>
                  {p.start_date || "—"} → {p.end_date || "—"}
                </div>
              )}
              <div style={{ display:"flex", gap:6, marginTop:12, paddingTop:12, borderTop:"1px solid rgba(0,0,0,0.06)" }}>
                <button onClick={() => openEdit(p)} className="bo-btn bo-btn-ghost bo-btn-sm">Edit</button>
                <button onClick={() => toggleActive(p)} className="bo-btn bo-btn-ghost bo-btn-sm">
                  {p.active ? "Deactivate" : "Activate"}
                </button>
                <button onClick={() => deletePromo(p.id)} className="bo-btn bo-btn-danger bo-btn-sm" style={{ marginLeft:"auto" }}>Delete</button>
              </div>
            </div>
          ))}
          {promos.length === 0 && (
            <div style={{ gridColumn:"1/-1", textAlign:"center", color:"var(--ink5)", padding:40 }}>No promotions yet</div>
          )}
        </div>
      )}

      {modal && (
        <div className="bo-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">{modal === "add" ? "Add Promotion" : "Edit Promotion"}</div>
              <button className="bo-modal-close" onClick={closeModal}>x</button>
            </div>
            <div className="bo-modal-body">
              <div className="bo-form-row">
                <label className="bo-label">Name *</label>
                <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} className="bo-input" placeholder="e.g. Happy Hour 20%" autoFocus />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div>
                  <label className="bo-label">Type</label>
                  <select value={form.type} onChange={e => setForm(f=>({...f,type:e.target.value}))} className="bo-select">
                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="bo-label">Value *</label>
                  <input type="number" value={form.value} onChange={e => setForm(f=>({...f,value:e.target.value}))} className="bo-input" placeholder={form.type==="Percentage"?"e.g. 20":"e.g. 10000"} />
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div>
                  <label className="bo-label">Voucher Code</label>
                  <input value={form.code||""} onChange={e => setForm(f=>({...f,code:e.target.value.toUpperCase()}))} className="bo-input" placeholder="e.g. HAPPY20" />
                </div>
                <div>
                  <label className="bo-label">Min Order (Rp)</label>
                  <input type="number" value={form.minOrder||""} onChange={e => setForm(f=>({...f,minOrder:e.target.value}))} className="bo-input" placeholder="0 = no minimum" />
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div>
                  <label className="bo-label">Start Date</label>
                  <input type="date" value={form.startDate||""} onChange={e => setForm(f=>({...f,startDate:e.target.value}))} className="bo-input" />
                </div>
                <div>
                  <label className="bo-label">End Date</label>
                  <input type="date" value={form.endDate||""} onChange={e => setForm(f=>({...f,endDate:e.target.value}))} className="bo-input" />
                </div>
              </div>
              <div className="bo-form-row">
                <label className="bo-label">Description</label>
                <input value={form.description||""} onChange={e => setForm(f=>({...f,description:e.target.value}))} className="bo-input" placeholder="Optional note" />
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <label className="bo-label" style={{ marginBottom:0 }}>Active</label>
                <input type="checkbox" checked={form.active !== false} onChange={e => setForm(f=>({...f,active:e.target.checked}))} style={{ width:16, height:16, accentColor:"var(--brand)" }} />
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={closeModal} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving||!form.name||!form.value} className="bo-btn bo-btn-primary">
                {saving ? "Saving..." : modal === "add" ? "Add" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
