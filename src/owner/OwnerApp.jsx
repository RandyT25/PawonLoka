import { useState, useEffect, useRef } from "react"
import { supabase } from "../lib/supabase"
import "./owner.css"
import CalendarRangePicker from "../backoffice/components/CalendarRangePicker"
import { explodeOrderPayments } from "../shared/orderPricing"

/* ─── helpers ─── */
function fmt(n)  { return "Rp " + Number(n||0).toLocaleString("id-ID") }
function fmtK(n) {
  if (n >= 1_000_000) return "Rp " + (n/1_000_000).toLocaleString("id-ID",{minimumFractionDigits:1,maximumFractionDigits:1}).replace(",0","") + " jt"
  if (n >= 1_000)     return "Rp " + (n/1_000).toFixed(0) + " rb"
  return fmt(n)
}
function fmtTime(iso) { return new Date(iso).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}) }
function today()   { return new Date().toISOString().slice(0,10) }
function yestStr() { return new Date(Date.now()-86400000).toISOString().slice(0,10) }


function fmtDuration(ms) {
  if (ms<=0) return "0m"
  const h=Math.floor(ms/3600000), m=Math.floor((ms%3600000)/60000)
  return h>0?`${h}j ${m}m`:`${m}m`
}

const PAY_COLOR = { Cash:"#10B981",QRIS:"#0EA5E9",Card:"#3B82F6",GoPay:"#06B6D4",OVO:"#8B5CF6",Other:"#94A3B8" }
const PAY_BADGE = { Cash:"ow-badge-green",QRIS:"ow-badge-blue",Card:"ow-badge-blue",GoPay:"ow-badge-blue",OVO:"ow-badge-purple",Other:"ow-badge-amber" }
const EXP_COLOR = { "Bahan Baku":"#EF4444","Operasional":"#F59E0B","Lain-lain":"#94A3B8" }
const STAFF_COLORS = ["#0EA5E9","#10B981","#8B5CF6","#F59E0B","#EF4444","#06B6D4"]

function owStatusBadge(status) {
  if (!status||status==="Paid"||status==="paid")   return { label:"Lunas",    bg:"#D1FAE5", color:"#065F46" }
  if (status==="Open"||status==="open")             return { label:"Open Bill", bg:"#FEF3C7", color:"#92400E" }
  if (status==="Voided"||status==="voided")         return { label:"Void",      bg:"#F1F5F9", color:"#64748B" }
  if (status==="Refunded"||status==="refunded")     return { label:"Refund",    bg:"#EDE9FE", color:"#5B21B6" }
  return { label: status, bg:"#F1F5F9", color:"#64748B" }
}

function OrderDetailModal({ order, onClose }) {
  if (!order) return null
  const items = order.items_snapshot||order.order_items||order.items||[]
  const parsed = typeof items==="string"?JSON.parse(items):items
  const isPaid = !order.status||order.status==="Paid"||order.status==="paid"
  const badge  = owStatusBadge(order.status)
  const timeStr = new Date(order.created_at).toLocaleString("id-ID",{weekday:"short",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:440,maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid #E2E8F0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:"#0F172A"}}>{order.code||"#"+String(order.id).slice(-6)}</div>
            <div style={{fontSize:11,color:"#64748B",marginTop:2}}>{timeStr} · {order.table_name||order.table||"Walk-in"} · {order.staff||"—"}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:10,background:badge.bg,color:badge.color}}>{badge.label}</span>
            <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#94A3B8",lineHeight:1}}>✕</button>
          </div>
        </div>
        <div style={{overflowY:"auto",padding:"14px 18px",flex:1}}>
          {(parsed||[]).map((i,idx)=>(
            <div key={idx} style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F1F5F9"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:13,color:"#0F172A"}}>{i.name}</div>
                {i.modifiers&&Object.values(i.modifiers).filter(Boolean).length>0&&<div style={{fontSize:11,color:"#94A3B8"}}>{Object.values(i.modifiers).filter(Boolean).join(", ")}</div>}
                {i.note&&<div style={{fontSize:11,color:"#94A3B8",fontStyle:"italic"}}>* {i.note}</div>}
              </div>
              <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                <div style={{fontSize:12,color:"#64748B"}}>{i.qty||1} × {fmt(i.price||0)}</div>
                {(i.itemDisc||0)>0&&<div style={{fontSize:11,color:"#10B981",fontWeight:600}}>Diskon -{fmt((i.itemDisc||0)*(i.qty||1))}</div>}
                <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>{fmt(((i.price||0)-(i.itemDisc||0))*(i.qty||1))}</div>
              </div>
            </div>
          ))}
          {(!parsed||!parsed.length)&&<div style={{textAlign:"center",color:"#94A3B8",padding:"16px 0",fontSize:13}}>No items</div>}
          <div style={{marginTop:12,paddingTop:10,borderTop:"2px solid #E2E8F0"}}>
            {order.discount>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#EF4444",marginBottom:4}}><span>{order.promo||"Diskon"}</span><span>-{fmt(order.discount)}</span></div>}
            {order.tax>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#64748B",marginBottom:4}}><span>Pajak</span><span>{fmt(order.tax)}</span></div>}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:800,color:"#0F172A"}}><span>Total</span><span>{fmt(order.total)}</span></div>
            {isPaid&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#64748B",marginTop:6}}><span>Pembayaran</span><span style={{fontWeight:700,color:"#10B981"}}>{order.pay||"—"}</span></div>}
            {order.change>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#64748B",marginTop:2}}><span>Kembalian</span><span>{fmt(order.change)}</span></div>}
          </div>
        </div>
      </div>
    </div>
  )
}
const OWNER_PIN = "1234"

/* ─── SVG Hourly Chart ─── */
function HourlyChart({ data }) {
  const [tip, setTip] = useState(null)
  if (!data.length || data.every(h => h.sales === 0)) {
    return <div className="ow-empty">Belum ada data untuk periode ini</div>
  }
  const W=560,H=130,PL=44,PR=12,PT=10,PB=26
  const cW=W-PL-PR, cH=H-PT-PB
  const maxS=Math.max(...data.map(h=>h.sales),1)
  const maxT=Math.max(...data.map(h=>h.tx),1)
  const n=data.length
  const sx=i=>PL+(i/(n-1))*cW
  const sy=v=>PT+cH-(v/maxS)*cH
  const ty=v=>PT+cH-(v/maxT)*cH

  function curve(pts) {
    if (pts.length<2) return ""
    let d=`M${pts[0][0]},${pts[0][1]}`
    for (let i=1;i<pts.length;i++) {
      const [x0,y0]=pts[i-1],[x1,y1]=pts[i],cx=(x0+x1)/2
      d+=` C${cx},${y0} ${cx},${y1} ${x1},${y1}`
    }
    return d
  }
  const sp=data.map((h,i)=>[sx(i),sy(h.sales)])
  const tp=data.map((h,i)=>[sx(i),ty(h.tx)])
  const fill=curve(sp)+` L${sp[n-1][0]},${PT+cH} L${sp[0][0]},${PT+cH} Z`
  const yTicks=[0,0.5,1].map(f=>({y:PT+cH-f*cH,lbl:fmtK(f*maxS)}))

  return (
    <div style={{position:"relative"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}} onMouseLeave={()=>setTip(null)}>
        <defs>
          <linearGradient id="owFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0EA5E9" stopOpacity=".18"/>
            <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {yTicks.map((t,i)=>(
          <g key={i}>
            <line x1={PL} x2={W-PR} y1={t.y} y2={t.y} stroke="#E2E8F0" strokeWidth="1" strokeDasharray={i?"3 3":""}/>
            <text x={PL-5} y={t.y+4} textAnchor="end" fontSize="9" fill="#94A3B8">{t.lbl}</text>
          </g>
        ))}
        {data.map((h,i)=>i%2===0&&(
          <text key={i} x={sx(i)} y={H-4} textAnchor="middle" fontSize="9" fill="#94A3B8">{h.hour.replace(":00","")}</text>
        ))}
        <path d={fill} fill="url(#owFill)"/>
        <path d={curve(sp)} fill="none" stroke="#0EA5E9" strokeWidth="2.5" strokeLinecap="round"/>
        <path d={curve(tp)} fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 3"/>
        {data.map((h,i)=>(
          <g key={i}>
            <rect x={sx(i)-cW/n/2} y={PT} width={cW/n} height={cH} fill="transparent" style={{cursor:"crosshair"}} onMouseEnter={()=>setTip({i,h})}/>
            {tip?.i===i&&<>
              <line x1={sx(i)} x2={sx(i)} y1={PT} y2={PT+cH} stroke="#E2E8F0" strokeWidth="1"/>
              <circle cx={sx(i)} cy={sy(h.sales)} r="4" fill="#0EA5E9" stroke="#fff" strokeWidth="2"/>
              <circle cx={sx(i)} cy={ty(h.tx)} r="3.5" fill="#F59E0B" stroke="#fff" strokeWidth="2"/>
            </>}
          </g>
        ))}
      </svg>
      {tip&&(
        <div style={{position:"absolute",top:4,left:12,background:"#0F172A",color:"#fff",borderRadius:10,padding:"8px 12px",fontSize:11,lineHeight:1.7,pointerEvents:"none",zIndex:10,boxShadow:"0 4px 16px rgba(15,23,42,0.3)"}}>
          <div style={{fontWeight:700,marginBottom:2}}>{tip.h.hour}</div>
          <div style={{color:"#7DD3FC"}}>{fmt(tip.h.sales)}</div>
          <div style={{color:"#FCD34D"}}>{tip.h.tx} transaksi</div>
        </div>
      )}
      <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:10}}>
        {[["#0EA5E9","Penjualan per jam"],["#F59E0B","Transaksi per jam"]].map(([c,l])=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#94A3B8"}}>
            <span style={{width:18,height:2,background:c,borderRadius:2,display:"inline-block"}}/>
            {l}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Notification Bell ─── */
function NotifBell({ notifications, setNotifications }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const unread = notifications.filter(n=>!n.read).length

  useEffect(()=>{
    function h(e){ if(ref.current&&!ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown",h)
    return ()=>document.removeEventListener("mousedown",h)
  },[])

  function markAll(){ setNotifications(p=>p.map(n=>({...n,read:true}))) }
  function markOne(id){ setNotifications(p=>p.map(n=>n.id===id?{...n,read:true}:n)) }

  return (
    <div ref={ref} style={{position:"relative"}}>
      <button className="ow-notif-btn" onClick={()=>setOpen(s=>!s)}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread>0&&<span className="ow-notif-badge">{unread>9?"9+":unread}</span>}
      </button>
      {open&&(
        <div className="ow-notif-panel">
          <div className="ow-notif-header">
            <span>Notifikasi</span>
            {unread>0&&<button className="ow-notif-clear" onClick={markAll}>Tandai semua dibaca</button>}
          </div>
          {notifications.length===0
            ? <div style={{padding:"28px 16px",textAlign:"center",color:"#94A3B8",fontSize:12}}>Tidak ada notifikasi</div>
            : notifications.map(n=>(
              <div key={n.id} className={"ow-notif-item"+(n.read?"":" unread")} onClick={()=>markOne(n.id)}>
                <div className={"ow-notif-icon "+(n.type==="order"?"ico-green":n.type==="alert"?"ico-amber":"ico-blue")}>
                  {n.type==="order"
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    : n.type==="alert"
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  }
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:n.read?400:600,color:"#1E293B",lineHeight:1.4}}>{n.text}</div>
                  <div style={{fontSize:10,color:"#94A3B8",marginTop:2}}>{fmtTime(n.time)}</div>
                </div>
                {!n.read&&<div style={{width:6,height:6,borderRadius:"50%",background:"#0EA5E9",flexShrink:0,marginTop:4}}/>}
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

/* ─── Dashboard Screen ─── */
function DateRangeBar({ range, setRange, customDate, setCustomDate, customDateTo, setCustomDateTo, loading, lastUpdated, onRefresh }) {
  const [showCal, setShowCal] = useState(false)

  const fmtD = d => new Date(d+"T12:00:00").toLocaleDateString("id-ID",{day:"numeric",month:"short"})
  const rangeLabel = range==="custom" && customDate
    ? (customDateTo && customDateTo!==customDate ? fmtD(customDate)+" → "+fmtD(customDateTo) : fmtD(customDate))
    : "Tanggal"

  return (
    <>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20,flexWrap:"wrap"}}>
      <div className="ow-range-group">
        {[["today","Hari Ini"],["week","Minggu Ini"],["month","Bulan Ini"]].map(([v,l])=>(
          <button key={v} className={"ow-range-btn"+(range===v?" active":"")} onClick={()=>setRange(v)}>{l}</button>
        ))}
        <button className={"ow-range-btn ow-range-date"+(range==="custom"?" active":"")}
          onClick={()=>setShowCal(true)} title="Pilih rentang tanggal">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{flexShrink:0}}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {rangeLabel}
        </button>
        {range==="custom" && (
          <button onClick={()=>setRange("today")}
            style={{background:"none",border:"1px solid rgba(255,255,255,0.2)",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer",color:"#94A3B8"}}>
            ✕
          </button>
        )}
      </div>
      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
        {loading ? (
          <svg className="ow-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#E2E8F0" strokeWidth="3"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#0EA5E9" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        ) : (
          <button onClick={onRefresh} title="Refresh data"
            style={{background:"none",border:"none",cursor:"pointer",color:"#94A3B8",fontSize:14,padding:"2px 4px",lineHeight:1}}>
            ↺
          </button>
        )}
        {lastUpdated && !loading && (
          <span style={{fontSize:10,color:"#94A3B8"}}>
            Update: {lastUpdated.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
          </span>
        )}
        <span style={{fontSize:11,color:"#94A3B8"}}>{new Date().toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long"})}</span>
      </div>
    </div>
    {showCal && (
      <CalendarRangePicker
        initialFrom={customDate}
        initialTo={customDateTo}
        onSave={(from, to) => { setCustomDate(from); setCustomDateTo?.(to); setRange("custom"); setShowCal(false) }}
        onClose={() => setShowCal(false)}
      />
    )}
    </>
  )
}

function ScreenDashboard({ range, setRange, customDate, setCustomDate, customDateTo, setCustomDateTo, loading, lastUpdated, onRefresh, stats, hourData, payments, topItems, topDrinkItems, slowItems, recent }) {
  const [selectedOrder, setSelectedOrder] = useState(null)
  const trend = stats.prevSales>0 ? Math.round((stats.sales-stats.prevSales)/stats.prevSales*100) : null
  const margin = stats.sales>0 ? Math.round(stats.grossProfit/stats.sales*100) : 0
  const RLABELS = {
    today:"Hari Ini", week:"Minggu Ini", month:"Bulan Ini",
    custom: customDate ? new Date(customDate+"T12:00:00").toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"}) : "Tanggal Dipilih"
  }

  return (
    <div style={{maxWidth:1100}}>
      <DateRangeBar range={range} setRange={setRange} customDate={customDate} setCustomDate={setCustomDate} customDateTo={customDateTo} setCustomDateTo={setCustomDateTo} loading={loading} lastUpdated={lastUpdated} onRefresh={onRefresh}/>

      {/* hero */}
      <div className="ow-hero" style={{marginBottom:14}}>
        <div className="ow-hero-label">Total Penjualan · {RLABELS[range]}</div>
        <div style={{fontSize:32,fontWeight:900,color:"white",letterSpacing:"-1px",marginBottom:4}}>
          {fmt(stats.sales + stats.unpaid)}
        </div>
        <div style={{fontSize:11,opacity:0.45,textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:12}}>Total Keseluruhan</div>
        <div style={{display:"flex",alignItems:"flex-start",gap:20,flexWrap:"wrap",marginBottom:6}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.6)",marginBottom:2,textTransform:"uppercase",letterSpacing:"0.5px"}}>Sudah Dibayar</div>
            <div className="ow-hero-amount" style={{marginBottom:0}}>
              {fmt(stats.sales)}
              {trend!==null&&<span className={"ow-trend "+(trend>=0?"up":"down")}>{trend>=0?"▲":"▼"} {Math.abs(trend)}%</span>}
            </div>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.6)",marginBottom:2,textTransform:"uppercase",letterSpacing:"0.5px"}}>Belum Dibayar</div>
            <div style={{fontSize:24,fontWeight:800,color:stats.unpaid>0?"#FCD34D":"rgba(255,255,255,0.35)"}}>
              {fmt(stats.unpaid)}
            </div>
          </div>
        </div>
        <div className="ow-hero-meta">
          <div className="ow-hero-meta-item">{stats.paidOrders||0} <strong>Lunas</strong></div>
          {stats.openOrders>0&&<div className="ow-hero-meta-item" style={{color:"#FCD34D"}}>{stats.openOrders} <strong>Open Bill</strong></div>}
          <div className="ow-hero-meta-item">MTD <strong>{fmtK(stats.mtd)}</strong></div>
          <div className="ow-hero-meta-item">Proyeksi Bulan Ini <strong>{fmtK(stats.projection)}</strong></div>
          <div className="ow-hero-meta-item">Avg/Transaksi <strong>{fmt(stats.avgOrder)}</strong></div>
        </div>
      </div>

      {/* stat cards */}
      <div className="ow-grid-3">
        <div className="ow-stat">
          <div className="ow-stat-accent" style={{background:"#10B981"}}/>
          <div className="ow-stat-label">Laba Kotor</div>
          <div className="ow-stat-val" style={{color:stats.grossProfit>=0?"#10B981":"#EF4444"}}>{fmt(stats.grossProfit)}</div>
          <div className="ow-stat-sub">Margin <strong style={{color:margin>=30?"#10B981":"#F59E0B"}}>{margin}%</strong>
            {margin<30&&<span style={{color:"#F59E0B",marginLeft:4}}>· di bawah target</span>}
          </div>
        </div>
        <div className="ow-stat">
          <div className="ow-stat-accent" style={{background:"#8B5CF6"}}/>
          <div className="ow-stat-label">Produk Terjual</div>
          <div className="ow-stat-val" style={{color:"#8B5CF6"}}>{stats.totalSold}</div>
          <div className="ow-stat-sub">{stats.avgItems} item per transaksi</div>
        </div>
        <div className="ow-stat">
          <div className="ow-stat-accent" style={{background:"#0EA5E9"}}/>
          <div className="ow-stat-label">Pelanggan</div>
          <div className="ow-stat-val" style={{color:"#0EA5E9"}}>{stats.customers}</div>
          <div className="ow-stat-sub">Tercatat dalam periode ini</div>
        </div>
      </div>

      {/* hourly chart */}
      <div className="ow-card" style={{marginBottom:16}}>
        <div className="ow-card-title">Performa Per Jam<span className="ow-card-title-sub">{RLABELS[range]}</span></div>
        <HourlyChart data={hourData}/>
      </div>

      {/* product intel + payments */}
      <div className="ow-grid-2">
        <div className="ow-card" style={{marginBottom:0}}>
          <div className="ow-card-title">Top 10 Menu</div>
          <div style={{marginBottom:16}}>
            <div className="ow-section-label" style={{color:"#10B981"}}>🍽 Makanan</div>
            {topItems.length===0
              ? <div className="ow-empty" style={{padding:"8px 0"}}>Belum ada data</div>
              : topItems.map((it,i)=>(
                <div key={it.name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
                  <div style={{width:20,height:20,borderRadius:"50%",flexShrink:0,fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",background:i===0?"#F59E0B":i===1?"#94A3B8":i===2?"#B45309":"#F1F5F9",color:i<3?"#fff":"#64748B"}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontSize:12,fontWeight:600,color:"#1E293B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.name}</span>
                      <span style={{fontSize:11,fontWeight:700,color:"#10B981",flexShrink:0,marginLeft:8}}>{it.qty}×</span>
                    </div>
                    <div className="ow-bar-track"><div className="ow-bar-fill" style={{width:Math.round(it.qty/it.max*100)+"%",background:"#10B981"}}/></div>
                  </div>
                </div>
              ))
            }
          </div>
          <div className="ow-divider"/>
          <div>
            <div className="ow-section-label" style={{color:"#0EA5E9"}}>☕ Minuman</div>
            {topDrinkItems.length===0
              ? <div style={{fontSize:12,color:"#94A3B8",padding:"4px 0"}}>Belum ada data minuman</div>
              : topDrinkItems.map((it,i)=>(
                <div key={it.name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
                  <div style={{width:20,height:20,borderRadius:"50%",flexShrink:0,fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",background:i===0?"#F59E0B":i===1?"#94A3B8":i===2?"#B45309":"#F1F5F9",color:i<3?"#fff":"#64748B"}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontSize:12,fontWeight:600,color:"#1E293B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.name}</span>
                      <span style={{fontSize:11,fontWeight:700,color:"#0EA5E9",flexShrink:0,marginLeft:8}}>{it.qty}×</span>
                    </div>
                    <div className="ow-bar-track"><div className="ow-bar-fill" style={{width:Math.round(it.qty/it.max*100)+"%",background:"#0EA5E9"}}/></div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        <div className="ow-card" style={{marginBottom:0}}>
          <div className="ow-card-title">Metode Pembayaran</div>
          {payments.length===0
            ? <div className="ow-empty">Belum ada data</div>
            : <>
              {payments.map(p=>(
                <div key={p.method} style={{marginBottom:13}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <span style={{width:8,height:8,borderRadius:"50%",background:PAY_COLOR[p.method]||"#94A3B8",display:"inline-block"}}/>
                      <span style={{fontSize:13,fontWeight:600,color:"#1E293B"}}>{p.method}</span>
                    </div>
                    <div>
                      <span style={{fontSize:12,fontWeight:700,color:"#1E293B"}}>{fmt(p.amount)}</span>
                      <span style={{fontSize:10,color:"#94A3B8",marginLeft:6}}>{p.pct}%</span>
                    </div>
                  </div>
                  <div className="ow-bar-track" style={{height:6}}><div className="ow-bar-fill" style={{width:p.pct+"%",background:PAY_COLOR[p.method]||"#94A3B8"}}/></div>
                </div>
              ))}
              <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
                {payments.slice(0,4).map(p=>(
                  <div key={p.method} style={{flex:1,minWidth:60,textAlign:"center",padding:"8px 6px",background:"#F8FAFC",borderRadius:10,border:"1px solid #E2E8F0"}}>
                    <div style={{fontSize:15,fontWeight:800,color:PAY_COLOR[p.method]}}>{p.pct}%</div>
                    <div style={{fontSize:9,color:"#94A3B8",marginTop:2}}>{p.method}</div>
                  </div>
                ))}
              </div>
            </>
          }
        </div>
      </div>

      {/* P&L + Cash */}
      <div className="ow-grid-2-1">
        <div className="ow-card" style={{marginBottom:0}}>
          <div className="ow-card-title">Ringkasan Laba Rugi</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:1,background:"#E2E8F0",borderRadius:12,overflow:"hidden",marginBottom:12}}>
            {[{label:"Gross Revenue",val:fmt(stats.sales),color:"#1E293B"},{label:"Est. COGS",val:fmt(stats.cogs),color:"#EF4444"},{label:"Gross Profit",val:fmt(stats.grossProfit),color:stats.grossProfit>=0?"#10B981":"#EF4444"}].map(r=>(
              <div key={r.label} style={{padding:"12px 8px",background:"#fff",textAlign:"center"}}>
                <div style={{fontSize:9,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:6}}>{r.label}</div>
                <div style={{fontSize:13,fontWeight:900,color:r.color,letterSpacing:"-0.3px",whiteSpace:"nowrap"}}>{r.val}</div>
              </div>
            ))}
          </div>
          {stats.sales>0&&(
            <div style={{padding:"10px 14px",borderRadius:10,background:margin>=30?"#D1FAE5":"#FEF3C7",fontSize:12,fontWeight:600,color:margin>=30?"#065F46":"#92400E",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>Gross margin saat ini: <strong>{margin}%</strong></span>
              <span style={{fontSize:11,fontWeight:500}}>{margin>=30?"Sehat":"Di bawah target 30%"}</span>
            </div>
          )}
        </div>

        <div className="ow-card" style={{marginBottom:0}}>
          <div className="ow-card-title">Kas & Pembayaran</div>
          {[
            {label:"Tunai",val:payments.find(p=>p.method==="Cash")?.amount||0,color:"#10B981"},
            {label:"Non-Tunai",val:payments.filter(p=>p.method!=="Cash").reduce((s,p)=>s+p.amount,0),color:"#0EA5E9"},
            {label:"Total",val:stats.sales,color:"#1E293B"},
          ].map((r,i,arr)=>(
            <div key={r.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<arr.length-1?"1px solid #F1F5F9":"none"}}>
              <span style={{fontSize:12,color:"#334155",fontWeight:500}}>{r.label}</span>
              <span style={{fontSize:13,fontWeight:800,color:r.color}}>{fmt(r.val)}</span>
            </div>
          ))}
          {stats.unpaid>0&&(
            <div style={{marginTop:12,padding:"8px 12px",background:"#FEF3C7",borderRadius:8,display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:11,color:"#92400E",fontWeight:600}}>Open Bills</span>
              <span style={{fontSize:12,fontWeight:800,color:"#92400E"}}>{fmt(stats.unpaid)}</span>
            </div>
          )}
        </div>
      </div>

      <OrderDetailModal order={selectedOrder} onClose={()=>setSelectedOrder(null)}/>
      {/* recent orders */}
      <div className="ow-card">
        <div className="ow-card-title">
          Semua Transaksi
          <span className="ow-card-title-sub">{stats.paidOrders||0} lunas · {stats.openOrders||0} open bill · tap untuk detail</span>
        </div>
        <div className="ow-table-wrap">
          <table className="ow-table">
            <thead><tr><th>Order</th><th>Status</th><th>Meja</th><th>Kasir</th><th>Pembayaran</th><th style={{textAlign:"right"}}>Total</th><th style={{textAlign:"right"}}>Waktu</th></tr></thead>
            <tbody>
              {recent.length===0
                ? <tr><td colSpan={7} className="ow-empty">Belum ada transaksi</td></tr>
                : recent.map(o=>{
                  const isPaid=!o.status||o.status==="Paid"||o.status==="paid"
                  const badge=owStatusBadge(o.status)
                  return (
                    <tr key={o.id} onClick={()=>setSelectedOrder(o)} style={{cursor:"pointer"}}>
                      <td style={{fontWeight:700,color:"#0EA5E9"}}>{o.code||"#"+String(o.id).slice(-6)}</td>
                      <td><span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:10,background:badge.bg,color:badge.color}}>{badge.label}</span></td>
                      <td>{o.table_name||o.table||"Walk-in"}</td>
                      <td style={{color:"#64748B",fontSize:12}}>{o.staff||"—"}</td>
                      <td><span className={"ow-badge "+(isPaid?(PAY_BADGE[o.pay]||"ow-badge-amber"):"ow-badge-gray")}>{isPaid?(o.pay||"—"):"—"}</span></td>
                      <td style={{textAlign:"right",fontWeight:700,color:badge.color}}>{fmt(o.total)}</td>
                      <td style={{textAlign:"right",color:"#94A3B8",fontSize:12}}>{fmtTime(o.created_at)}</td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ─── Karyawan Screen ─── */
function ScreenStaff({ staffData, stats, staffList, todayAtt, range, setRange, customDate, setCustomDate, customDateTo, setCustomDateTo }) {
  const now = Date.now()
  const salesMax = Math.max(...staffData.map(s=>s.sales), 1)

  /* build attendance map by staff name */
  const attMap = {}
  todayAtt.forEach(a => { attMap[a.staff_name] = a })

  /* build sales map by staff name */
  const salesMap = {}
  staffData.forEach(s => { salesMap[s.name] = s })

  /* derive per-staff status */
  const allStaff = staffList.map((s,i) => {
    const att = attMap[s.name]
    const sale = salesMap[s.name] || {sales:0,orders:0,avg:0,pct:0}
    let status="absent", label="Belum Masuk", sColor="#94A3B8", sBg="#F1F5F9", dur=null, warn=false

    if (att?.clock_in) {
      const msIn = now - new Date(att.clock_in)
      if (att.clock_out) {
        status="done"; label="Selesai"; sColor="#0369A1"; sBg="#E0F2FE"
        dur=fmtDuration(new Date(att.clock_out)-new Date(att.clock_in))
      } else if (msIn>9*3600000) {
        status="forgot"; label="Lupa Clock Out?"; sColor="#B45309"; sBg="#FEF3C7"; warn=true
        dur=fmtDuration(msIn)
      } else {
        status="on"; label="Sedang Bekerja"; sColor="#065F46"; sBg="#D1FAE5"
        dur=fmtDuration(msIn)
      }
    }
    return {...s,att,sale,status,label,sColor,sBg,dur,warn,color:s.color||STAFF_COLORS[i%6]}
  })

  /* sort: on > forgot > absent > done */
  const ORDER = {on:0,forgot:1,absent:2,done:3}
  allStaff.sort((a,b)=>(ORDER[a.status]??4)-(ORDER[b.status]??4))

  const onShift  = allStaff.filter(s=>s.status==="on")
  const forgot   = allStaff.filter(s=>s.status==="forgot")
  const absent   = allStaff.filter(s=>s.status==="absent")
  const done     = allStaff.filter(s=>s.status==="done")

  return (
    <div style={{maxWidth:960}}>

      {/* ── Shift status card ── */}
      <div className="ow-card" style={{marginBottom:16}}>
        <div className="ow-card-title">
          Status Shift Hari Ini
          <span className="ow-card-title-sub">
            {onShift.length} aktif · {forgot.length} lupa clock out · {absent.length} belum masuk · {done.length} selesai
          </span>
        </div>

        {staffList.length===0 ? (
          <div className="ow-empty">
            Tidak ada data staf. Tambah karyawan di Backoffice → Employees.
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:10}}>
            {allStaff.map(s=>(
              <div key={s.name} style={{
                padding:"14px",borderRadius:14,
                border:"1.5px solid",
                borderColor:s.status==="on"?"#6EE7B7":s.status==="forgot"?"#FCD34D":s.status==="done"?"#BAE6FD":"#E2E8F0",
                background:s.status==="on"?"#F0FDF4":s.status==="forgot"?"#FFFBEB":s.status==="done"?"#F0F9FF":"#F8FAFC",
                position:"relative",
              }}>
                {/* warn icon */}
                {s.warn&&(
                  <div style={{position:"absolute",top:10,right:10}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" strokeWidth="0">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13" stroke="#fff" strokeWidth="2"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="#fff" strokeWidth="2"/>
                    </svg>
                  </div>
                )}

                {/* avatar + name */}
                <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:10}}>
                  <div style={{width:36,height:36,borderRadius:10,background:s.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:800,flexShrink:0}}>
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#1E293B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                    <div style={{fontSize:10,color:"#94A3B8"}}>{s.role||"—"}</div>
                  </div>
                </div>

                {/* status badge + duration */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
                  <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:20,background:s.sBg,color:s.sColor}}>{s.label}</span>
                  {s.dur&&<span style={{fontSize:10,color:"#64748B",flexShrink:0,marginLeft:4}}>{s.dur}</span>}
                </div>

                {/* clock in/out times */}
                {s.att?.clock_in&&(
                  <div style={{fontSize:10,color:"#94A3B8",marginBottom:7}}>
                    <span>Masuk: <strong style={{color:"#334155"}}>{fmtTime(s.att.clock_in)}</strong></span>
                    {s.att.clock_out&&<span style={{marginLeft:8}}>Keluar: <strong style={{color:"#334155"}}>{fmtTime(s.att.clock_out)}</strong></span>}
                  </div>
                )}

                {/* mini sales snippet */}
                {s.sale.orders>0?(
                  <div style={{paddingTop:8,borderTop:"1px solid rgba(0,0,0,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:10,color:"#94A3B8"}}>{s.sale.orders} transaksi</span>
                    <span style={{fontSize:11,fontWeight:800,color:"#0EA5E9"}}>{fmtK(s.sale.sales)}</span>
                  </div>
                ):(
                  <div style={{fontSize:10,color:"#CBD5E1",paddingTop:8,borderTop:"1px solid rgba(0,0,0,0.06)"}}>Belum ada penjualan</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* forgot clock-out alert */}
        {forgot.length>0&&(
          <div style={{marginTop:12,padding:"10px 14px",background:"#FEF3C7",borderRadius:10,border:"1px solid #FCD34D",display:"flex",gap:9,alignItems:"flex-start"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#F59E0B" strokeWidth="0" style={{flexShrink:0,marginTop:1}}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13" stroke="#fff" strokeWidth="2"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="#fff" strokeWidth="2"/>
            </svg>
            <span style={{fontSize:12,fontWeight:600,color:"#92400E"}}>
              <strong>{forgot.map(s=>s.name).join(", ")}</strong> sudah lebih dari 9 jam bekerja tanpa clock out. Ingatkan untuk check-out.
            </span>
          </div>
        )}
      </div>

      {/* ── KPI row ── */}
      <div className="ow-grid-3">
        <div className="ow-stat">
          <div className="ow-stat-accent" style={{background:"#10B981"}}/>
          <div className="ow-stat-label">Sedang Bekerja</div>
          <div className="ow-stat-val" style={{color:"#10B981"}}>{onShift.length+forgot.length}</div>
          <div className="ow-stat-sub">dari {staffList.length} staf terdaftar</div>
        </div>
        <div className="ow-stat">
          <div className="ow-stat-accent" style={{background:"#0EA5E9"}}/>
          <div className="ow-stat-label">Rata-rata Per Staf</div>
          <div className="ow-stat-val" style={{color:"#0EA5E9",fontSize:18}}>{staffData.length?fmtK(Math.round(stats.sales/staffData.length)):"—"}</div>
          <div className="ow-stat-sub">penjualan periode ini</div>
        </div>
        <div className="ow-stat">
          <div className="ow-stat-accent" style={{background:"#F59E0B"}}/>
          <div className="ow-stat-label">Top Performer</div>
          <div className="ow-stat-val" style={{color:"#F59E0B",fontSize:16,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{staffData[0]?.name||"—"}</div>
          <div className="ow-stat-sub">{staffData[0]?fmtK(staffData[0].sales):""}</div>
        </div>
      </div>

      {/* ── Sales performance ── */}
      <div className="ow-card">
        <div className="ow-card-title">
          Performa Penjualan per Karyawan
          <span className="ow-card-title-sub">auto-update dari POS</span>
        </div>
        <DateRangeBar range={range} setRange={setRange} customDate={customDate} setCustomDate={setCustomDate} customDateTo={customDateTo} setCustomDateTo={setCustomDateTo} loading={false}/>

        {staffData.length===0 ? (
          <div className="ow-empty">Belum ada data penjualan pada periode ini.</div>
        ) : <>
          {/* bar chart */}
          <div style={{marginBottom:20}}>
            {staffData.map((s,i)=>(
              <div key={s.name} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <div style={{width:34,height:34,borderRadius:10,flexShrink:0,background:STAFF_COLORS[i%6],display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:13,fontWeight:800}}>
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,gap:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0}}>
                      <span style={{fontSize:13,fontWeight:700,color:"#1E293B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</span>
                      {i===0&&<span className="ow-badge ow-badge-amber">Top</span>}
                    </div>
                    <span style={{fontSize:13,fontWeight:800,color:"#1E293B",flexShrink:0}}>{fmt(s.sales)}</span>
                  </div>
                  <div className="ow-bar-track" style={{height:8}}>
                    <div className="ow-bar-fill" style={{width:Math.round(s.sales/salesMax*100)+"%",background:STAFF_COLORS[i%6]}}/>
                  </div>
                  <div style={{display:"flex",gap:16,marginTop:4}}>
                    <span style={{fontSize:10,color:"#94A3B8"}}>{s.orders} transaksi</span>
                    <span style={{fontSize:10,color:"#94A3B8"}}>avg {fmt(s.avg)}</span>
                    <span style={{fontSize:10,color:"#94A3B8"}}>{s.pct}% share</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* table */}
          <div className="ow-table-wrap">
            <table className="ow-table">
              <thead>
                <tr><th>Karyawan</th><th style={{textAlign:"right"}}>Transaksi</th><th style={{textAlign:"right"}}>Penjualan</th><th style={{textAlign:"right"}}>Avg/Transaksi</th><th style={{textAlign:"right"}}>% Total</th></tr>
              </thead>
              <tbody>
                {staffData.map((s,i)=>(
                  <tr key={s.name}>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:26,height:26,borderRadius:8,background:STAFF_COLORS[i%6],color:"#fff",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s.name.charAt(0).toUpperCase()}</div>
                        <span style={{fontWeight:600}}>{s.name}</span>
                        {i===0&&<span className="ow-badge ow-badge-amber">Top</span>}
                      </div>
                    </td>
                    <td style={{textAlign:"right",fontWeight:600}}>{s.orders}</td>
                    <td style={{textAlign:"right",fontWeight:700,color:"#0EA5E9"}}>{fmt(s.sales)}</td>
                    <td style={{textAlign:"right",color:"#64748B"}}>{fmt(s.avg)}</td>
                    <td style={{textAlign:"right"}}>
                      <span className={"ow-badge "+(s.pct>=35?"ow-badge-green":s.pct>=20?"ow-badge-blue":"ow-badge-amber")}>{s.pct}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}
      </div>
    </div>
  )
}

/* ─── Arus Kas Screen ─── */
function ScreenCashFlow({ cashData }) {
  const net = cashData.income - cashData.expenses
  return (
    <div style={{maxWidth:900}}>
      <div className="ow-grid-3">
        <div className="ow-stat">
          <div className="ow-stat-accent" style={{background:"#10B981"}}/>
          <div className="ow-stat-label">Total Pemasukan</div>
          <div className="ow-stat-val" style={{color:"#10B981",fontSize:20}}>{fmtK(cashData.income)}</div>
          <div className="ow-stat-sub">{cashData.incomeCount} transaksi</div>
        </div>
        <div className="ow-stat">
          <div className="ow-stat-accent" style={{background:"#EF4444"}}/>
          <div className="ow-stat-label">Total Pengeluaran</div>
          <div className="ow-stat-val" style={{color:"#EF4444",fontSize:20}}>{fmtK(cashData.expenses)}</div>
          <div className="ow-stat-sub">{cashData.expenseItems.length} pos pengeluaran</div>
        </div>
        <div className="ow-stat">
          <div className="ow-stat-accent" style={{background:net>=0?"#0EA5E9":"#F59E0B"}}/>
          <div className="ow-stat-label">Saldo Bersih</div>
          <div className="ow-stat-val" style={{color:net>=0?"#0EA5E9":"#F59E0B",fontSize:20}}>{fmtK(net)}</div>
          <div className="ow-stat-sub" style={{color:net>=0?"#10B981":"#F59E0B"}}>{net>=0?"Surplus":"Defisit"}</div>
        </div>
      </div>

      <div className="ow-grid-2">
        {/* income by method */}
        <div className="ow-card" style={{marginBottom:0}}>
          <div className="ow-card-title" style={{color:"#10B981"}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            Pemasukan per Metode
          </div>
          {cashData.byMethod.length===0
            ? <div className="ow-empty">Belum ada data</div>
            : cashData.byMethod.map(p=>(
              <div key={p.method} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:PAY_COLOR[p.method]||"#94A3B8",display:"inline-block"}}/>
                    <span style={{fontSize:12,fontWeight:600,color:"#334155"}}>{p.method}</span>
                  </div>
                  <div>
                    <span style={{fontSize:12,fontWeight:700,color:"#1E293B"}}>{fmt(p.amount)}</span>
                    <span style={{fontSize:10,color:"#94A3B8",marginLeft:6}}>{p.pct}%</span>
                  </div>
                </div>
                <div className="ow-bar-track" style={{height:5}}><div className="ow-bar-fill" style={{width:p.pct+"%",background:PAY_COLOR[p.method]||"#94A3B8"}}/></div>
              </div>
            ))
          }
        </div>

        {/* expense breakdown */}
        <div className="ow-card" style={{marginBottom:0}}>
          <div className="ow-card-title" style={{color:"#EF4444"}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
            Pengeluaran
          </div>
          {cashData.expenseItems.length===0
            ? <div style={{fontSize:12,color:"#94A3B8",padding:"8px 0"}}>Tidak ada pengeluaran tercatat. Tambah tabel cash_flows di Supabase.</div>
            : <>
              {Object.entries(
                cashData.expenseItems.reduce((acc,e)=>{ acc[e.category]=(acc[e.category]||0)+e.amount; return acc },{})
              ).map(([cat,amt])=>(
                <div key={cat} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #F1F5F9"}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:EXP_COLOR[cat]||"#94A3B8",display:"inline-block",flexShrink:0}}/>
                    <span style={{fontSize:12,fontWeight:600,color:"#334155"}}>{cat}</span>
                  </div>
                  <span style={{fontSize:12,fontWeight:700,color:"#EF4444"}}>{fmt(amt)}</span>
                </div>
              ))}
              <div className="ow-divider"/>
              {cashData.expenseItems.map(e=>(
                <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",borderRadius:8,background:"#FFF7F7",border:"1px solid #FEE2E2",marginBottom:5}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:"#1E293B"}}>{e.note}</div>
                    <div style={{fontSize:10,color:"#94A3B8"}}>{e.category} · {fmtTime(e.created_at)}</div>
                  </div>
                  <span style={{fontSize:12,fontWeight:700,color:"#EF4444",flexShrink:0,marginLeft:8}}>{fmt(e.amount)}</span>
                </div>
              ))}
            </>
          }
        </div>
      </div>

      {/* full log */}
      <div className="ow-card">
        <div className="ow-card-title">Riwayat Kas Lengkap</div>
        <div className="ow-table-wrap">
          <table className="ow-table">
            <thead><tr><th>Waktu</th><th>Keterangan</th><th>Kategori</th><th style={{textAlign:"right"}}>Masuk</th><th style={{textAlign:"right"}}>Keluar</th></tr></thead>
            <tbody>
              {cashData.log.length===0
                ? <tr><td colSpan={5} className="ow-empty">Belum ada data kas</td></tr>
                : cashData.log.map(e=>(
                  <tr key={e.id}>
                    <td style={{color:"#94A3B8",fontSize:11,whiteSpace:"nowrap"}}>{fmtTime(e.created_at)}</td>
                    <td style={{fontWeight:500}}>{e.note||"—"}</td>
                    <td><span className={"ow-badge "+(e.type==="income"?"ow-badge-green":"ow-badge-red")}>{e.type==="income"?e.pay:e.category}</span></td>
                    <td style={{textAlign:"right",fontWeight:700,color:"#10B981"}}>{e.type==="income"?fmt(e.amount):"—"}</td>
                    <td style={{textAlign:"right",fontWeight:700,color:"#EF4444"}}>{e.type==="expense"?fmt(e.amount):"—"}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ─── Products Screen ─── */
function ScreenProducts({ topItems, topDrinkItems }) {
  function ItemList({ items, color }) {
    if (!items.length) return <div className="ow-empty">Belum ada data</div>
    return items.map((it,i)=>(
      <div key={it.name} style={{display:"flex",alignItems:"center",gap:10,marginBottom:11}}>
        <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,background:i===0?"#F59E0B":i===1?"#94A3B8":i===2?"#B45309":"#F1F5F9",color:i<3?"#fff":"#64748B",fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{i+1}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:13,fontWeight:600,color:"#1E293B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.name}</span>
            <span style={{fontSize:12,fontWeight:700,color,flexShrink:0,marginLeft:8}}>{it.qty}×</span>
          </div>
          <div className="ow-bar-track"><div className="ow-bar-fill" style={{width:Math.round(it.qty/it.max*100)+"%",background:color}}/></div>
          <div style={{fontSize:10,color:"#94A3B8",marginTop:3}}>{fmt(it.revenue)}</div>
        </div>
      </div>
    ))
  }
  return (
    <div style={{maxWidth:800}}>
      <div className="ow-grid-2" style={{marginBottom:0}}>
        <div className="ow-card">
          <div className="ow-card-title" style={{color:"#10B981"}}>🍽 Top Makanan</div>
          <ItemList items={topItems} color="#10B981" />
        </div>
        <div className="ow-card">
          <div className="ow-card-title" style={{color:"#0EA5E9"}}>☕ Top Minuman</div>
          <ItemList items={topDrinkItems} color="#0EA5E9" />
        </div>
      </div>
    </div>
  )
}

/* ─── PIN Screen ─── */
function PinScreen({ onAuth }) {
  const [pin, setPin] = useState("")
  const [err, setErr] = useState("")
  const push = d => {
    if (pin.length>=4) return
    const next = pin+d
    setPin(next)
    if (next.length===4) {
      if (next===OWNER_PIN) { setTimeout(()=>onAuth(),150) }
      else { setTimeout(()=>{ setPin(""); setErr("PIN salah, coba lagi") },400) }
    } else { setErr("") }
  }
  const del = () => { setPin(p=>p.slice(0,-1)); setErr("") }

  return (
    <div className="owner-pin">
      <div className="owner-pin-card">
        <div className="owner-pin-logo">
          <img src="/logo-owner.png" alt="PawonLoka" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:12}}/>
        </div>
        <div className="owner-pin-title">Owner Dashboard</div>
        <div className="owner-pin-sub">PawonLoka · Masuk dengan PIN</div>
        <div className="owner-pin-dots">
          {[0,1,2,3].map(i=>(
            <div key={i} className={"owner-pin-dot"+(i<pin.length?" filled":"")}/>
          ))}
        </div>
        <div className="owner-pin-err">{err}</div>
        <div className="owner-pin-pad">
          {[1,2,3,4,5,6,7,8,9].map(n=>(
            <button key={n} className="owner-pin-key" onClick={()=>push(String(n))}>{n}</button>
          ))}
          <div/>
          <button className="owner-pin-key" onClick={()=>push("0")}>0</button>
          <button className="owner-pin-key" onClick={del} style={{fontSize:16}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{margin:"0 auto",display:"block"}}>
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── NAV items ─── */
const NAV = [
  {id:"dashboard",label:"Dashboard",icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>},
  {id:"products", label:"Produk",    icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>},
  {id:"staff",    label:"Karyawan",  icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>},
  {id:"cashflow", label:"Arus Kas",  icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>},
]

/* ─── Data hook ─── */
function useOwnerData(range, customDate, customDateTo) {
  const [loading,        setLoading]        = useState(true)
  const [lastUpdated,    setLastUpdated]    = useState(null)
  const [stats,          setStats]          = useState({sales:0,orders:0,customers:0,avgOrder:0,grossProfit:0,prevSales:0,unpaid:0,totalSold:0,avgItems:0,mtd:0,projection:0,cogs:0})
  const [payments,       setPayments]       = useState([])
  const [topItems,       setTopItems]       = useState([])
  const [topDrinkItems,  setTopDrinkItems]  = useState([])
  const [slowItems,      setSlowItems]      = useState([])
  const [hourData,       setHourData]       = useState([])
  const [recent,         setRecent]         = useState([])
  const [staffData,      setStaffData]      = useState([])
  const [cashData,       setCashData]       = useState({income:0,expenses:0,incomeCount:0,byMethod:[],expenseItems:[],log:[]})
  const [staffList,      setStaffList]      = useState([])
  const [todayAtt,       setTodayAtt]       = useState([])

  useEffect(()=>{ load() },[range,customDate,customDateTo])

  // loadRef always points to the latest load — avoids stale closure in intervals/channels
  const loadRef = useRef(load)
  useEffect(()=>{ loadRef.current = load })

  useEffect(()=>{
    const ch=supabase.channel("owner_rt")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"orders"},()=>loadRef.current())
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"orders"},()=>loadRef.current())
      .subscribe()
    return ()=>supabase.removeChannel(ch)
  },[range,customDate,customDateTo])

  // 10-second polling + immediate reload when tab becomes visible
  useEffect(()=>{
    const poll = setInterval(()=>{ if(!document.hidden) loadRef.current() }, 10000)
    const onVisible = ()=>{ if(!document.hidden) loadRef.current() }
    document.addEventListener("visibilitychange", onVisible)
    return ()=>{ clearInterval(poll); document.removeEventListener("visibilitychange", onVisible) }
  },[])

  /* attendance realtime — only refresh when viewing today */
  useEffect(()=>{
    if (range==="custom"&&customDate!==today()) return
    const loadAtt=async()=>{
      try {
        const {data}=await supabase.from("attendance").select("*").eq("date",today())
        setTodayAtt(data||[])
      } catch(e){}
    }
    const ch=supabase.channel("owner_att_rt")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"attendance"},loadAtt)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"attendance"},loadAtt)
      .subscribe()
    return ()=>supabase.removeChannel(ch)
  },[range,customDate])

  async function load() {
    setLoading(true)
    let orders=[], expenses=[]

    /* fetch staff list + attendance for the selected date */
    const attDate = range==="custom" ? customDate : today()
    try {
      const [{data:sl},{data:al}]=await Promise.all([
        supabase.from("staff").select("id,name,role,color,active").eq("active",true).order("name"),
        supabase.from("attendance").select("*").eq("date",attDate),
      ])
      setStaffList(sl||[])
      setTodayAtt(al||[])
    } catch(e){}

    let fromStr="", toStr=""
    if (range==="custom") {
      fromStr=customDate+"T00:00:00+08:00"
      toStr=(customDateTo||customDate)+"T23:59:59+08:00"
    } else {
      const now=new Date(), from=new Date()
      if (range==="today") { from.setHours(0,0,0,0) }
      if (range==="week")  { from.setDate(now.getDate()-now.getDay()); from.setHours(0,0,0,0) }
      if (range==="month") { from.setDate(1); from.setHours(0,0,0,0) }
      fromStr=from.getFullYear()+"-"+String(from.getMonth()+1).padStart(2,"0")+"-"+String(from.getDate()).padStart(2,"0")+"T00:00:00+08:00"
    }
    let q=supabase.from("orders").select("*").gte("created_at",fromStr)
    if (toStr) q=q.lte("created_at",toStr)
    const {data,error}=await q.order("created_at",{ascending:false})
    if (error) { console.error(error); setLoading(false); return }
    orders=data||[]
    try {
      let eq=supabase.from("cash_flows").select("*").eq("type","expense").gte("created_at",fromStr)
      if (toStr) eq=eq.lte("created_at",toStr)
      const {data:expData,error:expErr}=await eq
      if (!expErr) expenses=expData||[]
    } catch(e) {}

    /* real MTD — always current month regardless of selected range */
    let mtd=0
    try {
      const now2=new Date()
      const mStart=`${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,"0")}-01`
      const todayS=now2.toISOString().slice(0,10)
      const {data:mtdR}=await supabase.from("orders").select("total").eq("status","Paid").gte("date",mStart).lte("date",todayS)
      mtd=(mtdR||[]).reduce((s,o)=>s+(o.total||0),0)
    } catch(e){}

    const period=orders
    const expPeriod=expenses

    const paid=period.filter(o=>!o.status||o.status==="Paid"||o.status==="paid")
    const open=period.filter(o=>o.status==="Open"||o.status==="open")

    const sales=paid.reduce((s,o)=>s+(o.total||0),0)
    const unpaid=open.reduce((s,o)=>s+(o.total||0),0)
    const cogs=paid.reduce((s,o)=>s+(o.cogs||0),0)
    const avgOrder=paid.length?Math.round(sales/paid.length):0
    const customers=new Set(paid.filter(o=>o.customer_id).map(o=>o.customer_id)).size
    const totalSold=paid.reduce((s,o)=>{ const it=o.items_snapshot||o.order_items||o.items||[]; const p=typeof it==="string"?JSON.parse(it):it; return s+(p||[]).reduce((ss,i)=>ss+(i.qty||1),0) },0)
    const avgItems=paid.length?Math.round(totalSold/paid.length*10)/10:0
    const dom=new Date().getDate(), dim=new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate()
    const proyeksiBulanIni=dom>0?Math.round(mtd/dom*dim):0

    const pm={}
    paid.forEach(o=>{ explodeOrderPayments(o).forEach(({method,amount})=>{ pm[method]=(pm[method]||0)+amount }) })
    const payArr=Object.entries(pm).map(([method,amount])=>({method,amount,pct:sales?Math.round(amount/sales*100):0})).sort((a,b)=>b.amount-a.amount)

    const im={}
    paid.forEach(o=>{
      const it=o.items_snapshot||o.order_items||o.items||[]
      const p=typeof it==="string"?JSON.parse(it):it
      ;(p||[]).forEach(i=>{ if(!im[i.name])im[i.name]={name:i.name,qty:0,revenue:0,cat:i.cat||""}; im[i.name].qty+=(i.qty||1); im[i.name].revenue+=(i.price||0)*(i.qty||1) })
    })
    const allItems=Object.values(im).sort((a,b)=>b.qty-a.qty)
    const foodArr=allItems.filter(it=>it.cat!=="Drinks").slice(0,10)
    const drinkArr=allItems.filter(it=>it.cat==="Drinks").slice(0,10)
    const maxFoodQty=foodArr[0]?.qty||1
    const maxDrinkQty=drinkArr[0]?.qty||1
    foodArr.forEach(it=>it.max=maxFoodQty)
    drinkArr.forEach(it=>it.max=maxDrinkQty)
    const slowArr=allItems.filter(i=>i.qty<=2).sort((a,b)=>a.qty-b.qty).slice(0,10)

    const hs={},ht={}
    for(let h=7;h<=21;h++){hs[h]=0;ht[h]=0}
    paid.forEach(o=>{ const h=new Date(o.created_at).getHours(); if(h>=7&&h<=21){hs[h]=(hs[h]||0)+(o.total||0);ht[h]=(ht[h]||0)+1} })
    const hourArr=Object.entries(hs).map(([h,v])=>({hour:h+":00",sales:v,tx:ht[h]||0}))

    const sm={}
    paid.forEach(o=>{
      const s=o.staff||"Lainnya"
      if(!sm[s])sm[s]={name:s,orders:0,sales:0,items:0}
      sm[s].orders++; sm[s].sales+=(o.total||0)
      const it=o.items_snapshot||o.order_items||o.items||[]
      const p=typeof it==="string"?JSON.parse(it):it
      sm[s].items+=(p||[]).reduce((ss,i)=>ss+(i.qty||1),0)
    })
    const staffArr=Object.values(sm).map(s=>({...s,avg:s.orders?Math.round(s.sales/s.orders):0,pct:sales?Math.round(s.sales/sales*100):0})).sort((a,b)=>b.sales-a.sales)

    const totalExp=expPeriod.reduce((s,e)=>s+(e.amount||0),0)
    const cashLog=[
      ...paid.map(o=>({id:"i"+o.id,created_at:o.created_at,type:"income",note:o.code||"Penjualan",pay:o.pay,amount:o.total||0})),
      ...expPeriod.map(e=>({id:"e"+e.id,created_at:e.created_at,type:"expense",note:e.note||"Pengeluaran",category:e.category||"Lain-lain",amount:e.amount||0}))
    ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,30)

    setStats({sales,unpaid,cogs,orders:period.length,paidOrders:paid.length,openOrders:open.length,customers,avgOrder,grossProfit:sales-cogs,prevSales:0,totalSold,avgItems,mtd,projection:proyeksiBulanIni})
    setPayments(payArr)
    setTopItems(foodArr)
    setTopDrinkItems(drinkArr)
    setSlowItems(slowArr)
    setHourData(hourArr)
    setRecent(period.slice(0,30))
    setStaffData(staffArr)
    setCashData({income:sales,expenses:totalExp,incomeCount:paid.length,byMethod:payArr,expenseItems:expPeriod.map(e=>({...e,note:e.note||"Pengeluaran",category:e.category||"Lain-lain"})),log:cashLog})
    setLastUpdated(new Date())
    setLoading(false)
  }

  return {loading,lastUpdated,refresh:()=>loadRef.current(),stats,payments,topItems,topDrinkItems,slowItems,hourData,recent,staffData,cashData,staffList,todayAtt}
}

/* ─── Root ─── */
const INACTIVITY_MS = 30 * 60 * 1000

export default function OwnerApp() {
  const [authed,      setAuthed]      = useState(()=>!!sessionStorage.getItem('owner-authed'))
  const [screen,      setScreen]      = useState("dashboard")
  const [range,       setRange]       = useState("today")
  const [customDate,  setCustomDate]  = useState(today())
  const [customDateTo,setCustomDateTo]= useState(today())
  const [notifications, setNotifications] = useState([])
  const [mobileMenu,  setMobileMenu]  = useState(false)
  const contentRef = useRef(null)
  const inactivityRef = useRef(null)

  const logout = () => { sessionStorage.removeItem('owner-authed'); setAuthed(false) }

  useEffect(()=>{
    if (!authed) return
    const reset = () => {
      clearTimeout(inactivityRef.current)
      inactivityRef.current = setTimeout(logout, INACTIVITY_MS)
    }
    const events = ['mousedown','mousemove','keydown','touchstart','click','scroll']
    events.forEach(e => window.addEventListener(e, reset, {passive:true}))
    reset()
    return ()=>{
      events.forEach(e => window.removeEventListener(e, reset))
      clearTimeout(inactivityRef.current)
    }
  },[authed])

  useEffect(()=>{ contentRef.current?.scrollTo(0,0) },[screen])

  const {loading,lastUpdated,refresh,stats,payments,topItems,topDrinkItems,slowItems,hourData,recent,staffData,cashData,staffList,todayAtt} = useOwnerData(range,customDate,customDateTo)

  /* realtime notifications — orders + attendance */
  useEffect(()=>{
    const ch=supabase.channel("owner_notif")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"orders"},payload=>{
        const o=payload.new
        setNotifications(p=>[{id:Date.now(),text:`Pesanan baru: ${o.code||"#"+String(o.id).slice(-4)} · ${fmt(o.total||0)}`,type:"order",time:new Date().toISOString(),read:false},...p].slice(0,20))
      })
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"attendance"},payload=>{
        const a=payload.new
        setNotifications(p=>[{id:Date.now(),text:`${a.staff_name} clock in pukul ${fmtTime(a.clock_in)}`,type:"info",time:new Date().toISOString(),read:false},...p].slice(0,20))
      })
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"attendance"},payload=>{
        const a=payload.new
        if(a.clock_out) setNotifications(p=>[{id:Date.now(),text:`${a.staff_name} selesai shift pukul ${fmtTime(a.clock_out)}`,type:"info",time:new Date().toISOString(),read:false},...p].slice(0,20))
      })
      .subscribe()
    return ()=>supabase.removeChannel(ch)
  },[])

  const SCREEN_TITLE = {dashboard:"Dashboard",products:"Produk",staff:"Karyawan",cashflow:"Arus Kas"}

  if (!authed) return <PinScreen onAuth={()=>{ sessionStorage.setItem('owner-authed','1'); setAuthed(true) }}/>

  return (
    <div className="owner-app">
      {/* mobile topnav */}
      <div className="owner-topnav">
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <img src="/logo-owner.png" alt="PawonLoka" style={{width:28,height:28,objectFit:"cover",borderRadius:7,flexShrink:0}}/>
          <div>
            <div className="owner-topnav-logo">PawonLoka Owner</div>
            <div className="owner-topnav-screen">{SCREEN_TITLE[screen]}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <NotifBell notifications={notifications} setNotifications={setNotifications}/>
        </div>
      </div>

      <div className="owner-shell">
        {/* sidebar */}
        <aside className="owner-sidebar">
          <div className="owner-sidebar-header">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <div className="owner-sidebar-icon">
                <img src="/logo-owner.png" alt="PawonLoka" style={{width:28,height:28,objectFit:"cover",borderRadius:6}}/>
              </div>
              <div>
                <div className="owner-sidebar-name">PawonLoka</div>
                <div className="owner-sidebar-role">Owner View</div>
              </div>
            </div>
          </div>

          <nav className="owner-nav">
            <div className="owner-nav-section">Menu</div>
            {NAV.map(n=>(
              <button key={n.id} className={"owner-nav-item"+(screen===n.id?" active":"")} onClick={()=>{ setScreen(n.id); setMobileMenu(false) }}>
                {n.icon}{n.label}
              </button>
            ))}
          </nav>

          <div className="owner-sidebar-footer">
            <button className="owner-logout-btn" onClick={logout}>Keluar</button>
          </div>
        </aside>

        {/* main */}
        <main className="owner-main">
          <div className="owner-topbar">
            <div className="owner-topbar-left">
              <div className="owner-live-dot"/>
              <div className="owner-topbar-title">{SCREEN_TITLE[screen]}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span className="owner-topbar-date">{new Date().toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</span>
              <NotifBell notifications={notifications} setNotifications={setNotifications}/>
            </div>
          </div>

          <div className="owner-content" ref={contentRef}>
            {screen==="dashboard"&&<ScreenDashboard range={range} setRange={setRange} customDate={customDate} setCustomDate={setCustomDate} customDateTo={customDateTo} setCustomDateTo={setCustomDateTo} loading={loading} lastUpdated={lastUpdated} onRefresh={refresh} stats={stats} hourData={hourData} payments={payments} topItems={topItems} topDrinkItems={topDrinkItems} slowItems={slowItems} recent={recent}/>}
            {screen==="products" &&<ScreenProducts topItems={topItems} topDrinkItems={topDrinkItems}/>}
            {screen==="staff"    &&<ScreenStaff staffData={staffData} stats={stats} staffList={staffList} todayAtt={todayAtt} range={range} setRange={setRange} customDate={customDate} setCustomDate={setCustomDate} customDateTo={customDateTo} setCustomDateTo={setCustomDateTo}/>}
            {screen==="cashflow" &&<ScreenCashFlow cashData={cashData}/>}
          </div>
        </main>
      </div>

      {/* bottom tab bar — mobile only */}
      <nav className="ow-bottom-nav">
        {NAV.map(n=>(
          <button key={n.id} className={"ow-bottom-nav-item"+(screen===n.id?" active":"")} onClick={()=>setScreen(n.id)}>
            {n.icon}
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
