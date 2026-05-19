import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }

function tier(points) {
  if (points >= 5000) return { label:"Gold",   color:"#FF8B00", bg:"#FFF7E6" }
  if (points >= 1000) return { label:"Silver", color:"#6B778C", bg:"#F4F5F7" }
  return                     { label:"Bronze", color:"#E65100", bg:"#FFF3E0" }
}

const EMPTY_EDIT = { name:"", phone:"", dob:"", notes:"" }

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [search,    setSearch]    = useState("")
  const [tierFilter,setTierFilter]= useState("all")
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState(null)  // view modal
  const [editing,   setEditing]   = useState(null)  // edit modal
  const [editForm,  setEditForm]  = useState(EMPTY_EDIT)
  const [saving,    setSaving]    = useState(false)
  const [adjPoints, setAdjPoints] = useState("")

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from("customers").select("*").order("name")
    setCustomers(data || [])
    setLoading(false)
  }

  const filtered = customers.filter(c => {
    const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
    const t = tier(c.points||0)
    const matchTier = tierFilter === "all" || t.label.toLowerCase() === tierFilter
    return matchSearch && matchTier
  })

  function openEdit(c) {
    setEditForm({ name:c.name||"", phone:c.phone||"", dob:c.dob||"", notes:c.notes||"" })
    setAdjPoints("")
    setEditing(c)
    setSelected(null)
  }

  async function saveEdit() {
    if (!editForm.name) return
    setSaving(true)
    const payload = { name:editForm.name.trim(), phone:editForm.phone||null, dob:editForm.dob||null, notes:editForm.notes||null }
    // apply point adjustment if entered
    if (adjPoints !== "" && !isNaN(parseInt(adjPoints))) {
      const newPoints = Math.max(0, (editing.points||0) + parseInt(adjPoints))
      payload.points = newPoints
    }
    await supabase.from("customers").update(payload).eq("id", editing.id)
    await load()
    setEditing(null)
    setSaving(false)
  }

  async function deleteCustomer(id) {
    if (!confirm("Delete this customer?")) return
    await supabase.from("customers").delete().eq("id", id)
    setCustomers(prev => prev.filter(c => c.id !== id))
    setSelected(null)
  }

  return (
    <div>
      {/* KPI cards */}
      <div className="bo-metrics" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="bo-met blue">
          <div className="bo-met-label">Total Customers</div>
          <div className="bo-met-val">{customers.length}</div>
        </div>
        <div className="bo-met amber">
          <div className="bo-met-label">🥇 Gold</div>
          <div className="bo-met-val">{customers.filter(c=>(c.points||0)>=5000).length}</div>
          <div className="bo-met-sub">5000+ pts</div>
        </div>
        <div className="bo-met green">
          <div className="bo-met-label">🥈 Silver</div>
          <div className="bo-met-val">{customers.filter(c=>(c.points||0)>=1000&&(c.points||0)<5000).length}</div>
          <div className="bo-met-sub">1000–4999 pts</div>
        </div>
        <div className="bo-met blue">
          <div className="bo-met-label">Avg Visits</div>
          <div className="bo-met-val">{customers.length ? Math.round(customers.reduce((s,c)=>s+(c.visits||0),0)/customers.length) : 0}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
        <input placeholder="Search by name or phone..." value={search} onChange={e=>setSearch(e.target.value)} className="bo-input" style={{ maxWidth:280 }} />
        <div style={{ display:"flex", gap:4 }}>
          {[["all","All"],["gold","🥇 Gold"],["silver","🥈 Silver"],["bronze","🥉 Bronze"]].map(([v,l])=>(
            <button key={v} onClick={()=>setTierFilter(v)} className={"bo-btn bo-btn-sm "+(tierFilter===v?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bo-card" style={{ padding:0, overflow:"hidden" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
          <table className="bo-table">
            <thead>
              <tr><th>Customer</th><th>Phone</th><th>Tier</th><th>Points</th><th>Visits</th><th>Total Spent</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const t = tier(c.points||0)
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:34, height:34, borderRadius:"50%", background:t.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:t.color, flexShrink:0 }}>
                          {c.name?.slice(0,2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight:700 }}>{c.name}</div>
                          {c.dob && <div style={{ fontSize:11, color:"var(--ink5)" }}>DOB: {c.dob}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ color:"var(--ink3)" }}>{c.phone||"-"}</td>
                    <td>
                      <span style={{ fontSize:11, fontWeight:800, padding:"3px 9px", borderRadius:20, background:t.bg, color:t.color }}>
                        {t.label}
                      </span>
                    </td>
                    <td style={{ fontWeight:700 }}>{(c.points||0).toLocaleString("id-ID")} pts</td>
                    <td>{c.visits||0}</td>
                    <td style={{ fontWeight:600, color:"var(--brand)" }}>{fmt(c.total_spent||0)}</td>
                    <td>
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={()=>setSelected(c)} className="bo-btn bo-btn-ghost bo-btn-sm">View</button>
                        <button onClick={()=>openEdit(c)} className="bo-btn bo-btn-primary bo-btn-sm">Edit</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length===0 && <tr><td colSpan={7} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No customers found</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* View modal */}
      {selected && (
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&setSelected(null)}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">{selected.name}</div>
              <button className="bo-modal-close" onClick={()=>setSelected(null)}>✕</button>
            </div>
            <div className="bo-modal-body">
              {[
                ["Phone",       selected.phone||"-"],
                ["DOB",         selected.dob||"-"],
                ["Tier",        tier(selected.points||0).label],
                ["Points",      (selected.points||0).toLocaleString("id-ID")+" pts"],
                ["Visits",      selected.visits||0],
                ["Total Spent", fmt(selected.total_spent||0)],
                ["Notes",       selected.notes||"-"],
              ].map(([l,v])=>(
                <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--surface3)", fontSize:13 }}>
                  <span style={{ color:"var(--ink4)", fontWeight:600 }}>{l}</span>
                  <span style={{ fontWeight:700, color:"var(--ink)" }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>deleteCustomer(selected.id)} className="bo-btn bo-btn-danger">Delete</button>
              <button onClick={()=>openEdit(selected)} className="bo-btn bo-btn-primary">Edit</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&setEditing(null)}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">Edit — {editing.name}</div>
              <button className="bo-modal-close" onClick={()=>setEditing(null)}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div className="bo-form-row"><label className="bo-label">Name *</label><input value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))} className="bo-input" /></div>
              <div className="bo-form-row"><label className="bo-label">Phone</label><input value={editForm.phone} onChange={e=>setEditForm(f=>({...f,phone:e.target.value}))} className="bo-input" /></div>
              <div className="bo-form-row"><label className="bo-label">Date of Birth</label><input type="date" value={editForm.dob} onChange={e=>setEditForm(f=>({...f,dob:e.target.value}))} className="bo-input" /></div>
              <div className="bo-form-row"><label className="bo-label">Notes</label><input value={editForm.notes} onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))} className="bo-input" placeholder="Optional notes" /></div>

              {/* Points adjustment — only in edit modal */}
              <div style={{ marginTop:16, padding:"14px 16px", background:"var(--surface)", borderRadius:"var(--r)", border:"1px solid var(--surface3)" }}>
                <div style={{ fontSize:12, fontWeight:700, color:"var(--ink4)", marginBottom:8 }}>
                  Manual Point Adjustment
                  <span style={{ fontSize:11, color:"var(--ink5)", fontWeight:400, marginLeft:6 }}>Current: {(editing.points||0).toLocaleString("id-ID")} pts</span>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
                  {[-500,-100,100,500,1000].map(n=>(
                    <button key={n} type="button" onClick={()=>setAdjPoints(String(n))}
                      className={"bo-btn bo-btn-sm "+(adjPoints===String(n)?(n>0?"bo-btn-primary":"bo-btn-danger"):"bo-btn-ghost")}>
                      {n>0?"+"+n:n}
                    </button>
                  ))}
                </div>
                <input type="number" value={adjPoints} onChange={e=>setAdjPoints(e.target.value)} className="bo-input" placeholder="Or type custom amount (e.g. +200 or -50)" />
                {adjPoints !== "" && !isNaN(parseInt(adjPoints)) && (
                  <div style={{ fontSize:11, color:"var(--ink5)", marginTop:4 }}>
                    New total: {Math.max(0,(editing.points||0)+parseInt(adjPoints)).toLocaleString("id-ID")} pts
                  </div>
                )}
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setEditing(null)} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={saveEdit} disabled={saving||!editForm.name} className="bo-btn bo-btn-primary">{saving?"Saving...":"Save Changes"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
