import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function FloorPlan({ staff, onSelectTable, onTakeaway, onDelivery }) {
  const [tables, setTables]   = useState([])
  const [area, setArea]       = useState('Indoor')
  const [areas, setAreas]     = useState(['Indoor'])
  const [loading, setLoading] = useState(true)
  const [timers, setTimers]   = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: tbls } = await supabase.from('tables').select('*').order('sort')
    const today = new Date().toISOString().slice(0,10)
    const { data: openOrders } = await supabase
      .from('orders').select('id, table, created_at, customer, items')
      .eq('status', 'Open').eq('date', today)

    const occupiedMap = {}
    ;(openOrders||[]).forEach(o => {
      if (o.table) occupiedMap[o.table] = o
    })

    const merged = (tbls||[]).map(t => ({
      ...t,
      status: occupiedMap[t.name] ? 'Occupied' : t.status,
      open_bill_id: occupiedMap[t.name]?.id || null,
      open_since: occupiedMap[t.name]?.created_at || null,
      open_customer: occupiedMap[t.name]?.customer || null,
      open_items: occupiedMap[t.name]?.items?.length || 0,
    }))

    setTables(merged)
    const uniqueAreas = [...new Set(merged.map(t => t.area).filter(Boolean))]
    setAreas(uniqueAreas.length ? uniqueAreas : ['Indoor'])
    setArea(prev => uniqueAreas.includes(prev) ? prev : (uniqueAreas[0] || 'Indoor'))
    setLoading(false)
  }

  // Live timer
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const t = {}
      tables.forEach(tb => {
        if (tb.open_since) {
          const mins = Math.floor((now - new Date(tb.open_since).getTime()) / 60000)
          t[tb.id] = mins
        }
      })
      setTimers(t)
    }, 10000)
    return () => clearInterval(interval)
  }, [tables])

  const visible = tables.filter(t => t.area === area)
  const counts = {
    available: visible.filter(t => t.status === 'Available').length,
    occupied:  visible.filter(t => t.status === 'Occupied').length,
  }

  function timerLabel(mins) {
    if (mins < 60) return mins + 'm'
    return Math.floor(mins/60) + 'h ' + (mins%60) + 'm'
  }

  function timerColor(mins) {
    if (mins < 30) return '#16A34A'
    if (mins < 60) return '#F59E0B'
    return '#DC2626'
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0A1628', flexDirection:'column', gap:16 }}>
      <div style={{ fontSize:28, fontWeight:900, color:'white' }}>PawonLoka</div>
      <div style={{ color:'#94A3B8', fontSize:14 }}>Loading tables...</div>
    </div>
  )

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:900, color:'white' }}>PawonLoka</div>
            <div style={{ fontSize:11, color:'#94A3B8' }}>{staff.name} · {staff.role}</div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <div style={S.statBadge}>
              <span style={{ color:'#86EFAC' }}>{counts.available}</span>
              <span style={{ color:'#64748B', fontSize:10 }}> tersedia</span>
            </div>
            <div style={S.statBadge}>
              <span style={{ color:'#FDC07A' }}>{counts.occupied}</span>
              <span style={{ color:'#64748B', fontSize:10 }}> terisi</span>
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load} style={S.refreshBtn}>Refresh</button>
          <button onClick={onTakeaway} style={S.actionBtn}>Takeaway</button>
          <button onClick={onDelivery} style={{ ...S.actionBtn, background:'#10B981' }}>Delivery</button>
        </div>
      </div>

      {/* Area tabs */}
      {areas.length > 1 && (
        <div style={S.areaTabs}>
          {areas.map(a => (
            <button key={a} onClick={() => setArea(a)}
              style={{ ...S.areaBtn, ...(area===a ? S.areaActive : {}) }}>
              {a} ({tables.filter(t=>t.area===a).length})
            </button>
          ))}
        </div>
      )}

      {/* Table grid */}
      <div style={S.grid}>
        {visible.map(t => {
          const occupied = t.status === 'Occupied'
          const reserved = t.status === 'Reserved'
          const mins = timers[t.id]
          return (
            <button key={t.id} onClick={() => !reserved && onSelectTable(t)}
              style={{
                ...S.card,
                background: occupied ? '#FFF7ED' : reserved ? '#F8FAFC' : 'white',
                border: occupied ? '2px solid #FB923C' : reserved ? '2px solid #CBD5E1' : '2px solid #E2E8F0',
                cursor: reserved ? 'not-allowed' : 'pointer',
                opacity: reserved ? 0.6 : 1,
              }}>

              {/* Status dot */}
              <div style={{ position:'absolute', top:10, right:10, width:10, height:10, borderRadius:'50%',
                background: occupied ? '#F97316' : reserved ? '#94A3B8' : '#22C55E' }} />

              {/* Table name */}
              <div style={{ fontSize:16, fontWeight:900, color:'#0A1628', marginBottom:4 }}>{t.name}</div>

              {/* Capacity */}
              <div style={{ fontSize:11, color:'#94A3B8', marginBottom:8 }}>
                {'●'.repeat(Math.min(t.capacity, 8))} {t.capacity} seats
              </div>

              {/* Status */}
              {occupied ? (
                <div style={{ width:'100%' }}>
                  {mins !== undefined && (
                    <div style={{ fontSize:20, fontWeight:900, color:timerColor(mins), marginBottom:4 }}>
                      {timerLabel(mins)}
                    </div>
                  )}
                  {t.open_customer && (
                    <div style={{ fontSize:11, color:'#6B7A8D', marginBottom:2 }}>{t.open_customer}</div>
                  )}
                  <div style={{ fontSize:11, color:'#6B7A8D' }}>{t.open_items} item(s)</div>
                  <div style={{ marginTop:8, padding:'4px 10px', background:'#FED7AA', borderRadius:20, fontSize:11, fontWeight:700, color:'#C2410C' }}>
                    Tap to open bill
                  </div>
                </div>
              ) : reserved ? (
                <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8' }}>Reserved</div>
              ) : (
                <div style={{ padding:'6px 14px', background:'#DCFCE7', borderRadius:20, fontSize:12, fontWeight:700, color:'#16A34A' }}>
                  Available
                </div>
              )}
            </button>
          )
        })}

        {/* Takeaway quick button */}
        <button onClick={onTakeaway} style={{ ...S.card, border:'2px dashed #CBD5E1', background:'#F8FAFC', cursor:'pointer' }}>
          <div style={{ fontSize:24, marginBottom:8 }}>🛵</div>
          <div style={{ fontSize:14, fontWeight:800, color:'#0A1628' }}>Takeaway</div>
          <div style={{ fontSize:11, color:'#94A3B8', marginTop:4 }}>Walk-in order</div>
        </button>

        <button onClick={onDelivery} style={{ ...S.card, border:'2px dashed #CBD5E1', background:'#F8FAFC', cursor:'pointer' }}>
          <div style={{ fontSize:24, marginBottom:8 }}>📦</div>
          <div style={{ fontSize:14, fontWeight:800, color:'#0A1628' }}>Delivery</div>
          <div style={{ fontSize:11, color:'#94A3B8', marginTop:4 }}>Antar ke alamat</div>
        </button>
      </div>
    </div>
  )
}

const S = {
  wrap:       { display:'flex', flexDirection:'column', height:'100vh', background:'#F1F5F9' },
  header:     { background:'#0A1628', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 },
  statBadge:  { background:'rgba(255,255,255,0.08)', padding:'4px 10px', borderRadius:8, fontSize:13, fontWeight:700 },
  refreshBtn: { padding:'7px 14px', borderRadius:10, border:'1.5px solid rgba(255,255,255,0.15)', background:'transparent', color:'#94A3B8', fontSize:12, fontWeight:600, cursor:'pointer' },
  actionBtn:  { padding:'7px 16px', borderRadius:10, border:'none', background:'#3B82F6', color:'white', fontSize:12, fontWeight:700, cursor:'pointer' },
  areaTabs:   { display:'flex', gap:8, padding:'12px 20px', background:'white', borderBottom:'1px solid #E2E8F0', flexShrink:0 },
  areaBtn:    { padding:'7px 18px', borderRadius:20, border:'1.5px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, cursor:'pointer', color:'#6B7A8D' },
  areaActive: { background:'#0A1628', borderColor:'#0A1628', color:'white' },
  grid:       { flex:1, overflowY:'auto', padding:20, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:14, alignContent:'start' },
  card:       { position:'relative', background:'white', borderRadius:16, padding:16, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', minHeight:160, transition:'transform 0.1s, box-shadow 0.1s', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:'2px solid #E2E8F0' },
}
