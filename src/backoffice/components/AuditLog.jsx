import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

export default function AuditLog() {
  const [logs,   setLogs]   =useState([])
  const [loading,setLoading]=useState(true)
  const [search, setSearch] =useState("")

  useEffect(()=>{load()},[])

  async function load(){
    setLoading(true)
    const {data}=await supabase.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(200)
    setLogs(data||[]); setLoading(false)
  }

  const filtered=logs.filter(l=>!search||JSON.stringify(l).toLowerCase().includes(search.toLowerCase()))
  const actionColor={CREATE:"var(--green)",UPDATE:"var(--brand)",DELETE:"var(--red)",LOGIN:"var(--amber)",VOID:"var(--red)"}

  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} className="bo-input" placeholder="Search logs..." style={{maxWidth:300}} />
        <span style={{fontSize:12,color:"var(--ink5)",marginLeft:"auto"}}>{filtered.length} entries</span>
        <button onClick={load} className="bo-btn bo-btn-ghost bo-btn-sm">↻ Refresh</button>
      </div>
      <div className="bo-card" style={{padding:0,overflow:"hidden"}}>
        {loading?<div style={{padding:40,textAlign:"center",color:"var(--ink5)"}}>Loading...</div>:(
          <table className="bo-table">
            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Module</th><th>Details</th></tr></thead>
            <tbody>
              {filtered.map(l=>(
                <tr key={l.id}>
                  <td style={{fontSize:11,color:"var(--ink5)",whiteSpace:"nowrap"}}>{new Date(l.created_at).toLocaleString("id-ID",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</td>
                  <td style={{fontWeight:600}}>{l.user_name||"-"}</td>
                  <td><span style={{fontSize:11,fontWeight:700,color:actionColor[l.action]||"var(--ink4)"}}>{l.action}</span></td>
                  <td style={{fontSize:12,color:"var(--ink3)"}}>{l.module||"-"}</td>
                  <td style={{fontSize:11,color:"var(--ink5)",maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.details||"-"}</td>
                </tr>
              ))}
              {filtered.length===0&&<tr><td colSpan={5} style={{textAlign:"center",color:"var(--ink5)",padding:"32px 0"}}>No audit logs yet</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
