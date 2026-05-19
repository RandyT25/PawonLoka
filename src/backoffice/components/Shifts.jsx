import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }

export default function Shifts() {
  const [shifts,  setShifts]  = useState([])
  const [loading, setLoading] = useState(true)
  const [range,   setRange]   = useState("week")

  useEffect(() => { load() }, [range])

  async function load() {
    setLoading(true)
    const now=new Date(), from=new Date()
    if (range==="today") { from.setHours(0,0,0,0) }
    if (range==="week")  { from.setDate(now.getDate()-7) }
    if (range==="month") { from.setDate(1); from.setHours(0,0,0,0) }
    const {data} = await supabase.from("shifts").select("*").gte("opened_at",from.toISOString()).order("opened_at",{ascending:false})
    setShifts(data||[]); setLoading(false)
  }

  function duration(s) {
    if (!s.opened_at||!s.closed_at) return "Open"
    const ms=new Date(s.closed_at)-new Date(s.opened_at)
    return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m`
  }

  const totalSales  = shifts.reduce((s,x)=>s+(x.total_sales||0),0)
  const totalOrders = shifts.reduce((s,x)=>s+(x.total_orders||0),0)
  const openShifts  = shifts.filter(s=>!s.closed_at).length

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[["today","Today"],["week","This Week"],["month","This Month"]].map(([v,l])=>(
          <button key={v} onClick={()=>setRange(v)} className={"bo-btn bo-btn-sm "+(range===v?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
        ))}
      </div>
      <div className="bo-metrics" style={{gridTemplateColumns:"repeat(3,1fr)",marginBottom:16}}>
        <div className="bo-met blue"><div className="bo-met-label">Total Sales</div><div className="bo-met-val">{fmt(totalSales)}</div></div>
        <div className="bo-met green"><div className="bo-met-label">Total Orders</div><div className="bo-met-val">{totalOrders}</div></div>
        <div className="bo-met amber"><div className="bo-met-label">Open Shifts</div><div className="bo-met-val">{openShifts}</div></div>
      </div>
      <div className="bo-card" style={{padding:0,overflow:"hidden"}}>
        {loading?<div style={{padding:40,textAlign:"center",color:"var(--ink5)"}}>Loading...</div>:(
          <table className="bo-table">
            <thead><tr><th>Staff</th><th>Opened</th><th>Closed</th><th>Duration</th><th>Orders</th><th>Sales</th><th>Status</th></tr></thead>
            <tbody>
              {shifts.map(s=>(
                <tr key={s.id}>
                  <td style={{fontWeight:700}}>{s.staff_name||"-"}</td>
                  <td style={{fontSize:12,color:"var(--ink4)"}}>{s.opened_at?new Date(s.opened_at).toLocaleString("id-ID",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"-"}</td>
                  <td style={{fontSize:12,color:"var(--ink4)"}}>{s.closed_at?new Date(s.closed_at).toLocaleString("id-ID",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"-"}</td>
                  <td>{duration(s)}</td>
                  <td>{s.total_orders||0}</td>
                  <td style={{fontWeight:700}}>{fmt(s.total_sales||0)}</td>
                  <td><span className={"bo-badge "+(s.closed_at?"bo-badge-green":"bo-badge-amber")}>{s.closed_at?"Closed":"Open"}</span></td>
                </tr>
              ))}
              {shifts.length===0&&<tr><td colSpan={7} style={{textAlign:"center",color:"var(--ink5)",padding:"32px 0"}}>No shifts in this period</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
