export default function MobileMenuSlider({ show, onClose, staff, onClockIn, onCashLog, onReprint, onPrintCheck, onSettings, onLogout, onRefresh }) {
  if (!show) return null

  const items = [
    ['🕐 Clock In/Out', onClockIn],
    ['💵 Cash In/Out', onCashLog],
    ['🖨 Cetak Ulang Struk', onReprint],
    onPrintCheck && ['🖨 Cetak Checker', onPrintCheck],
    onRefresh && ['🔄 Refresh Menu', onRefresh],
    ['⚙️ Settings', onSettings],
  ].filter(Boolean)

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000, display:'flex' }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ width:260, height:'100%', background:'#0A1628', display:'flex', flexDirection:'column', overflowY:'auto', paddingTop:'env(safe-area-inset-top)' }}>
        <div style={{ padding:'20px 16px 16px', borderBottom:'1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', gap:10 }}>
          <img src="/logo-pos.png" onError={e=>e.target.style.display="none"} style={{ width:36, height:36, borderRadius:8, objectFit:'contain' }} />
          <div>
            <div style={{ fontSize:15, fontWeight:900, color:'#fff' }}>PawonLoka</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{staff.name} · {staff.role}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft:'auto', background:'none', border:'none', color:'rgba(255,255,255,0.5)', fontSize:22, cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ flex:1, padding:'8px 0' }}>
          {items.map(([label, action]) => (
            <button key={label} onClick={()=>{ action(); onClose() }}
              style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'13px 20px', background:'none', border:'none', color:'rgba(255,255,255,0.8)', textAlign:'left', fontSize:14, fontWeight:500, cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ padding:'12px 8px', borderTop:'1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={onLogout}
            style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'12px 20px', background:'none', border:'none', color:'#FCA5A5', fontSize:14, fontWeight:600, cursor:'pointer' }}>
            🚪 Logout
          </button>
          {/* Which build is actually running on this device — the packaged Android app
              only picks up fixes when manually reinstalled, so this is the only way to
              tell from the device itself whether it's up to date. */}
          <div style={{ textAlign:'center', fontSize:10, color:'rgba(255,255,255,0.25)', padding:'8px 0 4px' }}>
            Build: {typeof __BUILD_TIME__!=='undefined' ? new Date(__BUILD_TIME__).toLocaleString('id-ID') : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}
