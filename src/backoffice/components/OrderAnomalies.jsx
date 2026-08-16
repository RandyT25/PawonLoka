import { useState, useEffect, Fragment } from "react"
import { supabase } from "../../lib/supabase"

const fmt = n => "Rp " + Math.round(n||0).toLocaleString("id-ID")

export default function OrderAnomalies() {
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [deleting,  setDeleting]  = useState(null) // id being deleted, or 'all'
  const [expanded,  setExpanded]  = useState(null) // id of the row currently expanded, or null

  useEffect(()=>{load()},[])

  async function load(){
    setLoading(true)
    const {data} = await supabase.from("order_anomalies").select("*").order("created_at",{ascending:false}).limit(500)
    setRows(data||[]); setLoading(false)
  }

  async function deleteOne(id){
    setDeleting(id)
    await supabase.from("order_anomalies").delete().eq("id", id)
    setRows(prev => prev.filter(r => r.id !== id))
    setDeleting(null)
  }

  async function clearAll(){
    if (!confirm(`Hapus semua ${rows.length} anomali? Tidak bisa dikembalikan.`)) return
    setDeleting("all")
    await supabase.from("order_anomalies").delete().not("id","is",null)
    setRows([])
    setDeleting(null)
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
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          {rows.length>0 && (
            <button onClick={clearAll} disabled={deleting==="all"} className="bo-btn bo-btn-ghost bo-btn-sm" style={{color:"var(--red)"}}>
              {deleting==="all"?"Menghapus...":"🗑 Hapus Semua"}
            </button>
          )}
          <button onClick={load} className="bo-btn bo-btn-ghost bo-btn-sm">↻ Refresh</button>
        </div>
      </div>
      <div className="bo-card" style={{padding:0,overflow:"hidden"}}>
        {loading?<div style={{padding:40,textAlign:"center",color:"var(--ink5)"}}>Loading...</div>:(
          <table className="bo-table">
            <thead><tr><th></th><th>Waktu</th><th>Order</th><th>Total Tersimpan</th><th>Seharusnya</th><th>Selisih</th><th></th></tr></thead>
            <tbody>
              {rows.map(r=>{
                const items = r.items_snapshot || []
                const isOpen = expanded === r.id
                return (
                <Fragment key={r.id}>
                <tr onClick={()=>setExpanded(isOpen?null:r.id)} style={{cursor:"pointer"}}>
                  <td style={{fontSize:11,color:"var(--ink5)",width:16}}>{isOpen?"▾":"▸"}</td>
                  <td style={{fontSize:11,color:"var(--ink5)",whiteSpace:"nowrap"}}>{new Date(r.created_at).toLocaleString("id-ID",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</td>
                  <td style={{fontWeight:600,fontSize:12}}>{r.order_id}</td>
                  <td style={{fontSize:12}}>{fmt(r.stored_total)}</td>
                  <td style={{fontSize:12,color:"var(--ink4)"}}>{fmt(r.expected_total)}</td>
                  <td style={{fontSize:12,fontWeight:700,color: r.diff>0 ? "var(--red)" : "var(--amber)"}}>{r.diff>0?"+":""}{fmt(r.diff)}</td>
                  <td style={{textAlign:"right"}}>
                    <button onClick={(e)=>{e.stopPropagation();deleteOne(r.id)}} disabled={deleting===r.id} title="Hapus"
                      style={{background:"none",border:"none",cursor:"pointer",color:"var(--ink5)",fontSize:14,padding:"2px 6px"}}>
                      {deleting===r.id?"...":"✕"}
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={7} style={{background:"var(--surface)",padding:"12px 16px"}}>
                      {items.length===0 ? (
                        <div style={{fontSize:12,color:"var(--ink5)"}}>Tidak ada detail item tersimpan untuk order ini.</div>
                      ) : (
                        <table className="bo-table" style={{background:"#fff"}}>
                          <thead><tr><th>Item</th><th style={{textAlign:"right"}}>Harga</th><th style={{textAlign:"right"}}>Diskon</th><th style={{textAlign:"right"}}>Qty</th><th style={{textAlign:"right"}}>Subtotal</th></tr></thead>
                          <tbody>
                            {items.map((it,i)=>{
                              const disc = it.itemDisc||0
                              const line = (it.price - disc) * (it.qty||1)
                              return (
                                <tr key={i}>
                                  <td style={{fontSize:12}}>{it.name}{it.note?<span style={{color:"var(--ink5)"}}> — {it.note}</span>:null}</td>
                                  <td style={{fontSize:12,textAlign:"right"}}>{fmt(it.price)}</td>
                                  <td style={{fontSize:12,textAlign:"right",color:disc>0?"var(--red)":"var(--ink5)"}}>{disc>0?"-"+fmt(disc):"—"}</td>
                                  <td style={{fontSize:12,textAlign:"right"}}>{it.qty}</td>
                                  <td style={{fontSize:12,textAlign:"right",fontWeight:600}}>{fmt(line)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={4} style={{textAlign:"right",fontWeight:700,fontSize:12}}>Total dari item (Seharusnya)</td>
                              <td style={{textAlign:"right",fontWeight:800,fontSize:12}}>{fmt(r.expected_total)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })}
              {rows.length===0&&<tr><td colSpan={7} style={{textAlign:"center",color:"var(--ink5)",padding:"32px 0"}}>Belum ada anomali — semua order konsisten</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
