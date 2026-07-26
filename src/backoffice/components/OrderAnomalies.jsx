import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

const fmt = n => "Rp " + Math.round(n||0).toLocaleString("id-ID")

export default function OrderAnomalies() {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{load()},[])

  async function load(){
    setLoading(true)
    const {data} = await supabase.from("order_anomalies").select("*").order("created_at",{ascending:false}).limit(500)
    setRows(data||[]); setLoading(false)
  }

  return (
    <div>
      <p style={{fontSize:12,color:"var(--ink5)",marginBottom:16,maxWidth:640}}>
        Setiap order yang total-nya tidak sesuai dengan jumlah item-nya otomatis tercatat di sini
        oleh database, jadi masalah seperti ini langsung ketahuan — tidak perlu menunggu laporan
        bulanan atau komplain vendor.
      </p>
      <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center"}}>
        <span style={{fontSize:12,color:"var(--ink5)"}}>{rows.length} anomali tercatat</span>
        <button onClick={load} className="bo-btn bo-btn-ghost bo-btn-sm" style={{marginLeft:"auto"}}>↻ Refresh</button>
      </div>
      <div className="bo-card" style={{padding:0,overflow:"hidden"}}>
        {loading?<div style={{padding:40,textAlign:"center",color:"var(--ink5)"}}>Loading...</div>:(
          <table className="bo-table">
            <thead><tr><th>Waktu</th><th>Order</th><th>Total Tersimpan</th><th>Seharusnya</th><th>Selisih</th></tr></thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.id}>
                  <td style={{fontSize:11,color:"var(--ink5)",whiteSpace:"nowrap"}}>{new Date(r.created_at).toLocaleString("id-ID",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</td>
                  <td style={{fontWeight:600,fontSize:12}}>{r.order_id}</td>
                  <td style={{fontSize:12}}>{fmt(r.stored_total)}</td>
                  <td style={{fontSize:12,color:"var(--ink4)"}}>{fmt(r.expected_total)}</td>
                  <td style={{fontSize:12,fontWeight:700,color: r.diff>0 ? "var(--red)" : "var(--amber)"}}>{r.diff>0?"+":""}{fmt(r.diff)}</td>
                </tr>
              ))}
              {rows.length===0&&<tr><td colSpan={5} style={{textAlign:"center",color:"var(--ink5)",padding:"32px 0"}}>Belum ada anomali — semua order konsisten</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
