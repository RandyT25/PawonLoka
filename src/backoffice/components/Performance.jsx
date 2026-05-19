import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }

export default function Performance() {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(true)
  const [range,   setRange]   = useState("month")

  useEffect(() => { load() }, [range])

  async function load() {
    setLoading(true)
    const now=new Date(), from=new Date()
    if (range==="today") { from.setHours(0,0,0,0) }
    if (range==="week")  { from.setDate(now.getDate()-7) }
    if (range==="month") { from.setDate(1); from.setHours(0,0,0,0) }
    const {data:orders} = await supabase.from("orders").select("*").eq("status","Paid").gte("created_at",from.toISOString())
    const map={}
    ;(orders||[]).forEach(o=>{
      const k=o.staff||"Unknown"
      if (!map[k]) map[k]={name:k,orders:0,sales:0}
      map[k].orders++; map[k].sales+=o.total||0
    })
    const arr=Object.values(map).map(s=>({...s,avg:s.orders?Math.round(s.sales/s.orders):0})).sort((a,b)=>b.sales-a.sales)
    setData(arr); setLoading(false)
  }

  const maxSales=data[0]?.sales||1

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[["today","Today"],["week","This Week"],["month","This Month"]].map(([v,l])=>(
          <button key={v} onClick={()=>setRange(v)} className={"bo-btn bo-btn-sm "+(range===v?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
        ))}
      </div>
      {loading?<div style={{textAlign:"center",padding:40,color:"var(--ink5)"}}>Loading...</div>:(
        <div className="bo-card">
          <div className="bo-card-title">Staff Sales Performance</div>
          {data.length===0&&<div style={{textAlign:"center",color:"var(--ink5)",padding:24}}>No data for this period</div>}
          {data.map((s,i)=>(
            <div key={s.name} style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"var(--surface2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,color:i<3?"#fff":"var(--ink4)",flexShrink:0}}>{i+1}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:13,fontWeight:700}}>{s.name}</span>
                  <span style={{fontSize:13,fontWeight:700,color:"var(--brand)"}}>{fmt(s.sales)}</span>
                </div>
                <div style={{height:6,background:"var(--surface2)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:Math.round(s.sales/maxSales*100)+"%",background:"var(--brand)",borderRadius:3}}/>
                </div>
                <div style={{fontSize:11,color:"var(--ink5)",marginTop:3}}>{s.orders} orders · avg {fmt(s.avg)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
