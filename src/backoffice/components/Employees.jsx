
import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

const ROLES   = ["Cashier","Manager","Waiter","Kitchen","Owner"]
const COLORS  = ["#0066FF","#00875A","#FF8B00","#6554C0","#DE350B","#00B8D9"]
const EMPTY   = { name:"", role:"Cashier", pin:"", color:"#0066FF", active:true }

export default function Employees() {
  const [staff, setStaff]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [showPin, setShowPin] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from("staff").select("*").order("name")
    setStaff(data || [])
    setLoading(false)
  }

  function openAdd() { setForm(EMPTY); setModal("add") }
  function openEdit(s) { setForm({ ...s, pin: s.pin || "" }); setModal("edit") }
  function closeModal() { setModal(false); setForm(EMPTY) }

  async function save() {
    if (!form.name || !form.pin) return
    if (form.pin.length !== 4 || !/^\d+$/.test(form.pin)) { alert("PIN must be 4 digits"); return }
    setSaving(true)
    const payload = { name:form.name.trim(), role:form.role, pin:form.pin, color:form.color, active:form.active !== false }
    if (modal === "add") {
      await supabase.from("staff").insert({ ...payload, id:"STAFF-"+Date.now() })
    } else {
      await supabase.from("staff").update(payload).eq("id", form.id)
    }
    await load()
    closeModal()
    setSaving(false)
  }

  async function toggleActive(s) {
    await supabase.from("staff").update({ active: !s.active }).eq("id", s.id)
    setStaff(prev => prev.map(x => x.id === s.id ? { ...x, active: !x.active } : x))
  }

  async function deleteStaff(id) {
    if (!confirm("Delete this employee?")) return
    await supabase.from("staff").delete().eq("id", id)
    setStaff(prev => prev.filter(s => s.id !== id))
  }

  function initials(name) { return name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
        <button onClick={openAdd} className="bo-btn bo-btn-primary">+ Add Employee</button>
      </div>

      {loading ? (
        <div style={{ textAlign:"center", color:"var(--ink5)", padding:40 }}>Loading...</div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
          {staff.map(s => (
            <div key={s.id} style={{ background:"#fff", border:"1.5px solid var(--surface3)", borderRadius:16, overflow:"hidden", opacity: s.active ? 1 : 0.6 }}>
              <div style={{ padding:"16px 16px 12px", display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:46, height:46, borderRadius:"50%", background: s.color || "#0066FF", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, color:"#fff", flexShrink:0 }}>
                  {initials(s.name)}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:"var(--ink)" }}>{s.name}</div>
                  <div style={{ fontSize:11, color:"var(--ink5)", marginTop:2 }}>{s.role}</div>
                </div>
                <span className={"bo-badge " + (s.active ? "bo-badge-green" : "bo-badge-amber")}>
                  {s.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div style={{ padding:"0 16px 12px", fontSize:12, color:"var(--ink3)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span>PIN:</span>
                  <span style={{ fontFamily:"monospace", fontWeight:700, letterSpacing:2 }}>
                    {showPin[s.id] ? s.pin : "••••"}
                  </span>
                  <button onClick={() => setShowPin(p => ({...p, [s.id]: !p[s.id]}))}
                    style={{ fontSize:11, color:"var(--brand)", background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>
                    {showPin[s.id] ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div style={{ display:"flex", borderTop:"1px solid var(--surface3)" }}>
                <button onClick={() => openEdit(s)} style={{ flex:1, padding:9, fontSize:12, fontWeight:600, color:"var(--ink4)", background:"none", border:"none", borderRight:"1px solid var(--surface3)", cursor:"pointer" }}>Edit</button>
                <button onClick={() => toggleActive(s)} style={{ flex:1, padding:9, fontSize:12, fontWeight:600, color: s.active?"var(--amber)":"var(--green)", background:"none", border:"none", borderRight:"1px solid var(--surface3)", cursor:"pointer" }}>
                  {s.active ? "Deactivate" : "Activate"}
                </button>
                <button onClick={() => deleteStaff(s.id)} style={{ flex:1, padding:9, fontSize:12, fontWeight:600, color:"var(--red)", background:"none", border:"none", cursor:"pointer" }}>Delete</button>
              </div>
            </div>
          ))}
          {staff.length === 0 && (
            <div style={{ gridColumn:"1/-1", textAlign:"center", color:"var(--ink5)", padding:40 }}>No employees yet</div>
          )}
        </div>
      )}

      {modal && (
        <div className="bo-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">{modal === "add" ? "Add Employee" : "Edit Employee"}</div>
              <button className="bo-modal-close" onClick={closeModal}>x</button>
            </div>
            <div className="bo-modal-body">
              <div className="bo-form-row">
                <label className="bo-label">Full Name *</label>
                <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} className="bo-input" placeholder="Employee name" autoFocus />
              </div>
              <div className="bo-form-row">
                <label className="bo-label">Role</label>
                <select value={form.role} onChange={e => setForm(f=>({...f,role:e.target.value}))} className="bo-select">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="bo-form-row">
                <label className="bo-label">PIN (4 digits) *</label>
                <input value={form.pin} onChange={e => setForm(f=>({...f,pin:e.target.value.slice(0,4)}))} className="bo-input" placeholder="e.g. 1234" type="password" maxLength={4} />
              </div>
              <div className="bo-form-row">
                <label className="bo-label">Color</label>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
                  {COLORS.map(c => (
                    <div key={c} onClick={() => setForm(f=>({...f,color:c}))}
                      style={{ width:30, height:30, borderRadius:"50%", background:c, cursor:"pointer", border: form.color===c?"3px solid var(--ink)":"3px solid transparent", transform:form.color===c?"scale(1.15)":"scale(1)", transition:"all 0.15s" }} />
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
              <button onClick={save} disabled={saving||!form.name||!form.pin} className="bo-btn bo-btn-primary">
                {saving ? "Saving..." : modal === "add" ? "Add Employee" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
