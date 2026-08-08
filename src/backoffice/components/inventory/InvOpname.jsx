import { useState, useEffect } from "react"
import { supabase } from "../../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }

export default function InvOpname() {
  const [sessions,    setSessions]    = useState([])
  const [ingredients, setIngredients] = useState([])
  const [activeCount, setActiveCount] = useState(null) // null or array of count items
  const [viewModal,   setViewModal]   = useState(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data:s }, { data:i }] = await Promise.all([
      supabase.from("stock_opname").select("*").order("created_at", { ascending:false }),
      supabase.from("ingredients").select("*").order("name"),
    ])
    setSessions(s||[]); setIngredients(i||[])
    setLoading(false)
  }

  function startOpname() {
    setActiveCount(ingredients.map(i => ({
      ingredient_id: i.id, ingredient_name: i.name, unit: i.unit,
      system_qty: i.stock||0, actual_qty: i.stock||0, cost_per: i.cost_per_unit||0, notes:""
    })))
  }

  function updateActual(idx, val) {
    setActiveCount(prev => prev.map((item,i) => i===idx ? {...item, actual_qty:parseFloat(val)||0} : item))
  }

  async function submitOpname() {
    if (!confirm("Submit stock count? Stock will be adjusted by the counted variance (actual − system) on top of live stock.")) return
    setSubmitting(true)
    try {
      const items = activeCount.map(item => ({
        ...item, diff: item.actual_qty - item.system_qty,
        value_diff: (item.actual_qty - item.system_qty) * item.cost_per
      }))
      const totalVariance = items.reduce((a,i) => a+i.value_diff, 0)
      const sessionId = "OPN-"+String(sessions.length+1).padStart(3,"0")
      const { error:opnErr } = await supabase.from("stock_opname").insert({
        id: sessionId, date: new Date().toISOString().slice(0,10),
        status:"Completed", items, total_variance:totalVariance
      })
      if (opnErr) throw opnErr
      // Apply the counted DIFFERENCE on top of current live stock (not an overwrite), so any
      // activity that happened while this session was open isn't erased.
      for (const item of items) {
        const { data:freshIng } = await supabase.from("ingredients").select("stock").eq("id", item.ingredient_id).maybeSingle()
        const newStock = Math.max(0, (freshIng?.stock ?? item.system_qty) + item.diff)
        const { error:updErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id", item.ingredient_id)
        if (updErr) throw updErr
        if (item.diff !== 0) {
          const { error:movErr } = await supabase.from("stock_movements").insert({
            id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
            type:"Adjustment", ingredient_id:item.ingredient_id, ingredient_name:item.ingredient_name,
            qty:item.diff, unit:item.unit, ref:sessionId,
            note:"Stock opname "+sessionId,
            date:new Date().toISOString().slice(0,10),
            time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
          })
          if (movErr) throw movErr
        }
      }
      await load()
      setActiveCount(null)
    } catch(e) { alert("Error submitting stock count: "+e.message) }
    setSubmitting(false)
  }

  if (activeCount) {
    return (
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"var(--ink)" }}>📋 Active Stock Count Session</div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setActiveCount(null)} className="bo-btn bo-btn-ghost">Cancel</button>
            <button onClick={submitOpname} disabled={submitting} className="bo-btn bo-btn-primary">{submitting?"Submitting...":"Submit Count"}</button>
          </div>
        </div>
        <div className="bo-card" style={{ padding:0, overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
          <table className="bo-table">
            <thead><tr><th>Ingredient</th><th>Unit</th><th>System Stock</th><th>Actual Count</th><th>Difference</th><th>Value Diff</th></tr></thead>
            <tbody>
              {activeCount.map((item,idx) => {
                const diff = item.actual_qty - item.system_qty
                const valDiff = diff * item.cost_per
                return (
                  <tr key={item.ingredient_id}>
                    <td style={{ fontWeight:600 }}>{item.ingredient_name}</td>
                    <td>{item.unit}</td>
                    <td>{item.system_qty}</td>
                    <td>
                      <input type="number" value={item.actual_qty} onChange={e=>updateActual(idx,e.target.value)}
                        style={{ width:80, padding:"5px 8px", border:"1.5px solid var(--surface3)", borderRadius:"var(--r)", fontSize:13 }} />
                    </td>
                    <td style={{ fontWeight:700, color:diff===0?"var(--ink5)":diff<0?"var(--red)":"var(--green)" }}>
                      {diff>=0?"+":""}{diff.toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </td>
                    <td style={{ fontSize:12, color:valDiff<0?"var(--red)":valDiff>0?"var(--green)":"var(--ink5)" }}>
                      {valDiff!==0?(valDiff>=0?"+":"")+fmt(Math.abs(valDiff)):"—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <span style={{ fontSize:13, color:"var(--ink4)", fontWeight:600 }}>{sessions.length} past opname sessions</span>
        <button onClick={startOpname} className="bo-btn bo-btn-primary">+ Start New Stock Count</button>
      </div>

      {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div>
      : sessions.length === 0 ? <div style={{ textAlign:"center", color:"var(--ink5)", padding:48 }}>No opname sessions yet</div>
      : (
        <div className="bo-card" style={{ padding:0, overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
          <table className="bo-table">
            <thead><tr><th>Session ID</th><th>Date</th><th>Items Counted</th><th>Total Variance</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight:700, fontFamily:"monospace", fontSize:12 }}>{s.id}</td>
                  <td>{s.date}</td>
                  <td>{(s.items||[]).length} items</td>
                  <td style={{ fontWeight:700, color:s.total_variance<0?"var(--red)":s.total_variance>0?"var(--green)":"var(--ink5)" }}>
                    {s.total_variance>=0?"+":""}{fmt(s.total_variance)}
                  </td>
                  <td><span className="bo-badge bo-badge-green">Completed</span></td>
                  <td><button onClick={()=>setViewModal(s)} className="bo-btn bo-btn-ghost bo-btn-sm">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setViewModal(null)}>
          <div className="bo-modal" style={{ maxWidth:600, maxHeight:"92vh" }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">{viewModal.id} — Stock Count Report</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>{viewModal.date}</div>
              </div>
              <button className="bo-modal-close" onClick={()=>setViewModal(null)}>✕</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
                <div style={{ padding:12, background:"var(--surface)", borderRadius:"var(--r)", textAlign:"center" }}>
                  <div style={{ fontSize:11, color:"var(--ink5)" }}>Items Counted</div>
                  <div style={{ fontSize:20, fontWeight:800 }}>{(viewModal.items||[]).length}</div>
                </div>
                <div style={{ padding:12, background:"var(--surface)", borderRadius:"var(--r)", textAlign:"center" }}>
                  <div style={{ fontSize:11, color:"var(--ink5)" }}>Variances</div>
                  <div style={{ fontSize:20, fontWeight:800, color:(viewModal.items||[]).filter(i=>i.diff!==0).length>0?"var(--amber)":"var(--green)" }}>
                    {(viewModal.items||[]).filter(i=>i.diff!==0).length}
                  </div>
                </div>
                <div style={{ padding:12, background:viewModal.total_variance<0?"var(--red-lt)":"var(--green-lt)", borderRadius:"var(--r)", textAlign:"center" }}>
                  <div style={{ fontSize:11, color:"var(--ink5)" }}>Value Impact</div>
                  <div style={{ fontSize:16, fontWeight:800, color:viewModal.total_variance<0?"var(--red)":"var(--green)" }}>
                    {viewModal.total_variance>=0?"+":""}{fmt(viewModal.total_variance)}
                  </div>
                </div>
              </div>
              <table className="bo-table">
                <thead><tr><th>Ingredient</th><th>System</th><th>Actual</th><th>Diff</th><th>Value</th></tr></thead>
                <tbody>
                  {(viewModal.items||[]).filter(i=>i.diff!==0).map((i,idx)=>(
                    <tr key={idx}>
                      <td style={{ fontWeight:600 }}>{i.ingredient_name}</td>
                      <td>{i.system_qty} {i.unit}</td>
                      <td>{i.actual_qty} {i.unit}</td>
                      <td style={{ color:i.diff<0?"var(--red)":"var(--green)", fontWeight:700 }}>{i.diff>=0?"+":""}{i.diff?.toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                      <td style={{ color:i.value_diff<0?"var(--red)":"var(--green)", fontWeight:600 }}>{i.value_diff>=0?"+":""}{fmt(i.value_diff)}</td>
                    </tr>
                  ))}
                  {!(viewModal.items||[]).some(i=>i.diff!==0) && (
                    <tr><td colSpan={5} style={{ textAlign:"center", color:"var(--green)", padding:"20px 0", fontWeight:600 }}>✓ No variances found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="bo-modal-footer"><button onClick={()=>setViewModal(null)} className="bo-btn bo-btn-ghost">Close</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
