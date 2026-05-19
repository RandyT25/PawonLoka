
import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [search, setSearch]       = useState("")
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from("customers").select("*").order("name")
    setCustomers(data || [])
    setLoading(false)
  }

  const filtered = customers.filter(c =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  function tier(points) {
    if (points >= 5000) return { label:"Gold",   color:"#FF8B00", bg:"#FFF7E6" }
    if (points >= 1000) return { label:"Silver",  color:"#6B778C", bg:"#F4F5F7" }
    return                     { label:"Bronze",  color:"#E65100", bg:"#FFF3E0" }
  }

  async function adjustPoints(customer, amount) {
    const newPoints = Math.max(0, (customer.points || 0) + amount)
    await supabase.from("customers").update({ points: newPoints }).eq("id", customer.id)
    setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, points: newPoints } : c))
    if (selected?.id === customer.id) setSelected(s => ({ ...s, points: newPoints }))
  }

  return (
    <div>
      {/* Stats */}
      <div className="bo-metrics" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="bo-met blue">
          <div className="bo-met-label">Total Customers</div>
          <div className="bo-met-val">{customers.length}</div>
        </div>
        <div className="bo-met amber">
          <div className="bo-met-label">Gold</div>
          <div className="bo-met-val">{customers.filter(c=>(c.points||0)>=5000).length}</div>
          <div className="bo-met-sub">5000+ pts</div>
        </div>
        <div className="bo-met green">
          <div className="bo-met-label">Total Points</div>
          <div className="bo-met-val">{customers.reduce((s,c)=>s+(c.points||0),0).toLocaleString("id-ID")}</div>
        </div>
        <div className="bo-met blue">
          <div className="bo-met-label">Avg Visits</div>
          <div className="bo-met-val">{customers.length ? Math.round(customers.reduce((s,c)=>s+(c.visits||0),0)/customers.length) : 0}</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom:14 }}>
        <input placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} className="bo-input" style={{ maxWidth:320 }} />
      </div>

      {/* Table */}
      <div className="bo-card" style={{ padding:0, overflow:"hidden" }}>
        {loading ? (
          <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div>
        ) : (
          <table className="bo-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Tier</th>
                <th>Points</th>
                <th>Visits</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const t = tier(c.points || 0)
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:34, height:34, borderRadius:"50%", background: t.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:t.color, flexShrink:0 }}>
                          {c.name?.slice(0,2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight:700 }}>{c.name}</div>
                          {c.dob && <div style={{ fontSize:11, color:"var(--ink5)" }}>DOB: {c.dob}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ color:"var(--ink3)" }}>{c.phone || "-"}</td>
                    <td>
                      <span style={{ fontSize:11, fontWeight:800, padding:"3px 9px", borderRadius:20, background:t.bg, color:t.color }}>
                        {t.label}
                      </span>
                    </td>
                    <td style={{ fontWeight:700 }}>{(c.points||0).toLocaleString("id-ID")} pts</td>
                    <td>{c.visits || 0}</td>
                    <td>
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={() => adjustPoints(c, 100)} className="bo-btn bo-btn-ghost bo-btn-sm">+100</button>
                        <button onClick={() => adjustPoints(c, -100)} className="bo-btn bo-btn-ghost bo-btn-sm">-100</button>
                        <button onClick={() => setSelected(c)} className="bo-btn bo-btn-primary bo-btn-sm">View</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No customers found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="bo-overlay" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">{selected.name}</div>
              <button className="bo-modal-close" onClick={() => setSelected(null)}>x</button>
            </div>
            <div className="bo-modal-body">
              {[
                ["Phone",  selected.phone || "-"],
                ["DOB",    selected.dob || "-"],
                ["Points", (selected.points||0).toLocaleString("id-ID") + " pts"],
                ["Visits", selected.visits || 0],
                ["Tier",   tier(selected.points||0).label],
              ].map(([l,v]) => (
                <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--surface3)", fontSize:13 }}>
                  <span style={{ color:"var(--ink4)", fontWeight:600 }}>{l}</span>
                  <span style={{ fontWeight:700, color:"var(--ink)" }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"var(--ink4)", marginBottom:8 }}>Adjust Points</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {[-500,-100,100,500,1000].map(n => (
                    <button key={n} onClick={() => adjustPoints(selected, n)} className={"bo-btn bo-btn-sm " + (n>0?"bo-btn-primary":"bo-btn-ghost")}>
                      {n>0?"+"+n:n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
