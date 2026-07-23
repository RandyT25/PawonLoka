import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { offlineStore } from '../../lib/offlineStore'
import { qr } from '../../lib/quickRead'
import { computeOrderTotals, impliedDiscountPct } from '../../shared/orderPricing'

export default function FloorPlan({ staff, onSelectTable, onTakeaway, onDelivery, onBack, appSettings }) {
  const [tables,    setTables]    = useState([])
  const [area,      setArea]      = useState('Indoor')
  const [areas,     setAreas]     = useState(['Indoor'])
  const [loading,   setLoading]   = useState(true)
  const [timers,    setTimers]    = useState({})
  const [actionMenu,setActionMenu]= useState(null) // { table }
  const [mergeMode, setMergeMode] = useState(null) // source table
  const [moveMode,  setMoveMode]  = useState(null) // source table
  const [qrTable,   setQrTable]   = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0,10)

    // Tables — instant from cache, refresh in background
    const tbls = (await qr(supabase.from('tables').select('*').order('sort'), { cache:'tables', ms:5000 })) || []

    // Open orders — 3s timeout, empty fallback is fine
    const openOrders = (await qr(
      supabase.from('orders').select('id, table, table_area, created_at, customer, items').eq('status','Open').eq('date',today),
      { cache:'orders_modal_open', ms:3000 }
    )) || []

    const occupiedMap = {}
    ;(openOrders||[]).forEach(o => {
      if (!o.table) return
      if (o.table_area) occupiedMap[`${o.table_area}::${o.table}`] = o
      else occupiedMap[o.table] = o
    })
    const merged = (tbls||[]).map(t => {
      const hit = occupiedMap[`${t.area}::${t.name}`] || occupiedMap[t.name]
      return {
        ...t,
        status: hit ? 'Occupied' : t.status,
        open_bill_id:   hit?.id || null,
        open_since:     hit?.created_at || null,
        open_customer:  hit?.customer || null,
        open_items:     hit?.items?.length || 0,
      }
    })
    // Already ordered by `sort` from the query; natural-by-name is only a tiebreaker
    merged.sort((a, b) => {
      if ((a.sort||0) !== (b.sort||0)) return (a.sort||0) - (b.sort||0)
      const na = a.name.replace(/(\d+)/g, n => n.padStart(10, '0'))
      const nb = b.name.replace(/(\d+)/g, n => n.padStart(10, '0'))
      return na.localeCompare(nb)
    })
    setTables(merged)
    const uniqueAreas = [...new Set(merged.map(t => t.area).filter(Boolean))]
    const areaOrder = appSettings?.floor_plan?.area_order || []
    const known   = areaOrder.filter(a => uniqueAreas.includes(a))
    const unknown = uniqueAreas.filter(a => !areaOrder.includes(a))
    const orderedAreas = [...known, ...unknown]
    setAreas(orderedAreas.length ? orderedAreas : ['Indoor'])
    setArea(prev => orderedAreas.includes(prev) ? prev : (orderedAreas[0] || 'Indoor'))
    setLoading(false)
  }

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

  async function handleMerge(targetTable) {
    const src = mergeMode
    if (!src || !targetTable || src.id === targetTable.id) { setMergeMode(null); return }
    if (!confirm("Merge " + src.name + " into " + targetTable.name + "? All items from " + src.name + " will move to " + targetTable.name + ".")) { setMergeMode(null); return }
    // Fetch orders by ID — never by name, to avoid matching wrong tables
    const srcOrder = src.open_bill_id
      ? (await supabase.from('orders').select('*').eq('id', src.open_bill_id).maybeSingle()).data
      : null
    const tgtOrder = targetTable.open_bill_id
      ? (await supabase.from('orders').select('*').eq('id', targetTable.open_bill_id).maybeSingle()).data
      : null
    if (srcOrder) {
      if (tgtOrder) {
        const allItems = [...(tgtOrder.items||[]), ...(srcOrder.items||[])]
        // Merged bill keeps the target table's own discount rate, reapplied to the combined subtotal
        const taxRate = appSettings?.payments?.tax?.enabled ? (appSettings.payments.tax.rate||0)/100 : 0
        const totals = computeOrderTotals({ items: allItems, discountPct: impliedDiscountPct(tgtOrder), taxRate })
        await supabase.from('orders').update(totals).eq('id',tgtOrder.id)
        await supabase.from('orders').update({ status:'Voided', table: targetTable.name, table_area: targetTable.area||null }).eq('id',srcOrder.id)
      } else {
        await supabase.from('orders').update({ table: targetTable.name, table_area: targetTable.area||null }).eq('id',srcOrder.id)
      }
    }
    await supabase.from('tables').update({ status:'Available', merged_with:null }).eq('id',src.id)
    await supabase.from('tables').update({ merged_with: src.name }).eq('id',targetTable.id)
    setMergeMode(null); await load()
    const droppedDiscountWarning = srcOrder?.discount > 0 && tgtOrder
      ? '\n\nCatatan: diskon pada ' + src.name + ' tidak ikut dipindahkan — hanya diskon ' + targetTable.name + ' yang dipakai.'
      : ''
    alert(src.name + " merged into " + targetTable.name + droppedDiscountWarning)
  }

  async function handleMove(targetTable) {
    const src = moveMode
    if (!src || !targetTable || src.id === targetTable.id) { setMoveMode(null); return }
    if (targetTable.status === 'Occupied') { alert("Target table is occupied"); return }
    if (!confirm("Move " + src.name + " to " + targetTable.name + "?")) { setMoveMode(null); return }
    if (src.open_bill_id) {
      await supabase.from('orders').update({ table: targetTable.name, table_area: targetTable.area||null }).eq('id', src.open_bill_id)
    }
    await supabase.from('tables').update({ status:'Available' }).eq('id',src.id)
    setMoveMode(null); await load()
    alert("Moved to " + targetTable.name)
  }

  async function handleSplit(table) {
    // Split = mark merged table as separate again
    if (!confirm("Split " + table.name + " back to separate tables?")) return
    await supabase.from('tables').update({ merged_with:null }).eq('id',table.id)
    await load()
  }

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

  const isMergeMode = !!mergeMode
  const isMoveMode  = !!moveMode

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0A1628', flexDirection:'column', gap:16 }}>
      <div style={{ fontSize:28, fontWeight:900, color:'white' }}>PawonLoka</div>
      <div style={{ color:'#94A3B8', fontSize:14 }}>Loading tables...</div>
    </div>
  )

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:900, color:'white' }}>PawonLoka</div>
            <div style={{ fontSize:11, color:'#94A3B8' }}>{staff.name} · {staff.role}</div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <div style={S.statBadge}><span style={{ color:'#86EFAC' }}>{counts.available}</span><span style={{ color:'#64748B', fontSize:10 }}> tersedia</span></div>
            <div style={S.statBadge}><span style={{ color:'#FDC07A' }}>{counts.occupied}</span><span style={{ color:'#64748B', fontSize:10 }}> terisi</span></div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {onBack && <button onClick={onBack} style={{ ...S.refreshBtn, paddingLeft:10 }}>← Kembali</button>}
          <button onClick={load} style={S.refreshBtn}>Refresh</button>
          <button onClick={onTakeaway} style={S.actionBtn}>Takeaway</button>
          <button onClick={onDelivery} style={{ ...S.actionBtn, background:'#10B981' }}>Delivery</button>
        </div>
      </div>

      {/* Mode banner */}
      {(isMergeMode || isMoveMode) && (
        <div style={{ background: isMergeMode ? '#F59E0B' : '#3B82F6', padding:'10px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ color:'#fff', fontWeight:700, fontSize:13 }}>
            {isMergeMode ? "Select table to merge " + mergeMode.name + " into" : "Select destination for " + moveMode.name}
          </div>
          <button onClick={()=>{ setMergeMode(null); setMoveMode(null) }}
            style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:8, padding:'5px 12px', cursor:'pointer', fontWeight:700 }}>Cancel</button>
        </div>
      )}

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

      <div style={S.grid}>
        {visible.map(t => {
          const occupied = t.status === 'Occupied'
          const reserved = t.status === 'Reserved'
          const mins = timers[t.id]
          const isMergeTarget = isMergeMode && t.id !== mergeMode?.id
          const isMoveTarget  = isMoveMode  && t.id !== moveMode?.id && !occupied

          function handleTableClick() {
            if (isMergeMode) { handleMerge(t); return }
            if (isMoveMode)  { handleMove(t);  return }
            if (reserved) return
            setActionMenu(t)
          }

          return (
            <button key={t.id} onClick={handleTableClick}
              style={{
                ...S.card,
                background: isMergeTarget ? '#FEF9C3' : isMoveTarget ? '#DBEAFE' : occupied ? '#FFF7ED' : reserved ? '#F8FAFC' : 'white',
                border: isMergeTarget ? '2px solid #F59E0B' : isMoveTarget ? '2px solid #3B82F6' : occupied ? '2px solid #FB923C' : reserved ? '2px solid #CBD5E1' : '2px solid #E2E8F0',
                cursor: reserved && !isMergeMode && !isMoveMode ? 'not-allowed' : 'pointer',
                opacity: reserved && !isMergeMode && !isMoveMode ? 0.6 : 1,
                transform: (isMergeTarget || isMoveTarget) ? 'scale(1.02)' : 'scale(1)',
              }}>
              <div style={{ position:'absolute', top:10, right:10, width:10, height:10, borderRadius:'50%',
                background: occupied ? '#F97316' : reserved ? '#94A3B8' : '#22C55E' }} />
              {t.merged_with && <div style={{ position:'absolute', top:8, left:8, fontSize:9, fontWeight:700, color:'#6366F1', background:'#EEF2FF', borderRadius:4, padding:'1px 5px' }}>MERGED</div>}
              <div style={{ fontSize:16, fontWeight:900, color:'#0A1628', marginBottom:4 }}>{t.name}</div>
              {t.merged_with && <div style={{ fontSize:10, color:'#6366F1', marginBottom:4 }}>+ {t.merged_with}</div>}
              <div style={{ fontSize:11, color:'#94A3B8', marginBottom:8 }}>{"●".repeat(Math.min(t.capacity,8))} {t.capacity} seats</div>
              {occupied ? (
                <div style={{ width:'100%' }}>
                  {mins !== undefined && <div style={{ fontSize:20, fontWeight:900, color:timerColor(mins), marginBottom:4 }}>{timerLabel(mins)}</div>}
                  {t.open_customer && <div style={{ fontSize:11, color:'#6B7A8D', marginBottom:2 }}>{t.open_customer}</div>}
                  <div style={{ fontSize:11, color:'#6B7A8D' }}>{t.open_items} item(s)</div>
                  <div style={{ marginTop:8, padding:'4px 10px', background:'#FED7AA', borderRadius:20, fontSize:11, fontWeight:700, color:'#C2410C' }}>Tap to open bill</div>
                </div>
              ) : reserved ? (
                <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8' }}>Reserved</div>
              ) : (
                <div style={{ padding:'6px 14px', background:'#DCFCE7', borderRadius:20, fontSize:12, fontWeight:700, color:'#16A34A' }}>Available</div>
              )}
            </button>
          )
        })}

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

      {/* Action Menu Modal */}
      {actionMenu && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={()=>setActionMenu(null)}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:'white', borderRadius:'20px 20px 0 0', padding:'20px 20px 36px', width:'100%', maxWidth:480 }}>
            <div style={{ width:40, height:4, borderRadius:2, background:'#E2E8F0', margin:'0 auto 16px' }} />
            <div style={{ fontSize:16, fontWeight:900, color:'#0A1628', marginBottom:4, textAlign:'center' }}>{actionMenu.name}</div>
            <div style={{ fontSize:12, color:'#94A3B8', marginBottom:20, textAlign:'center' }}>
              {actionMenu.status === 'Occupied' ? 'Open bill · ' + actionMenu.open_items + ' items' : 'Available · ' + actionMenu.capacity + ' seats'}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {actionMenu.status === 'Occupied' && (
                <button onClick={()=>{ setActionMenu(null); onSelectTable(actionMenu) }}
                  style={S.menuBtn('#3B82F6')}>Open Bill</button>
              )}
              {actionMenu.status !== 'Occupied' && (
                <button onClick={()=>{ setActionMenu(null); onSelectTable(actionMenu) }}
                  style={S.menuBtn('#16A34A')}>New Order</button>
              )}
              {actionMenu.status === 'Occupied' && (
                <button onClick={()=>{ setMoveMode(actionMenu); setActionMenu(null) }}
                  style={S.menuBtn('#6366F1')}>Move Table</button>
              )}
              {actionMenu.status === 'Occupied' && (
                <button onClick={()=>{ setMergeMode(actionMenu); setActionMenu(null) }}
                  style={S.menuBtn('#F59E0B')}>Merge Table</button>
              )}
              {actionMenu.merged_with && (
                <button onClick={()=>{ handleSplit(actionMenu); setActionMenu(null) }}
                  style={S.menuBtn('#8B5CF6')}>Split Table</button>
              )}
              <button onClick={()=>{ setQrTable(actionMenu); setActionMenu(null) }}
                style={S.menuBtn('#10B981')}>📱 QR Customer</button>
              <button onClick={()=>setActionMenu(null)}
                style={{ ...S.menuBtn('#F1F5F9'), color:'#6B7A8D' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrTable && (() => {
        const url   = `https://pawonloka.pages.dev/q/${encodeURIComponent(qrTable.name)}`
        const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=14&data=${encodeURIComponent(url)}`
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(9,22,48,0.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
            onClick={() => setQrTable(null)}>
            <div style={{ background:'white', borderRadius:20, width:'100%', maxWidth:340, padding:24, textAlign:'center' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize:16, fontWeight:900, color:'#0A1628', marginBottom:4 }}>📱 QR — {qrTable.name}</div>
              <div style={{ fontSize:12, color:'#94A3B8', marginBottom:16 }}>Tempel di meja agar pelanggan bisa scan & pesan</div>
              <img src={qrImg} alt="QR" style={{ width:220, height:220, borderRadius:12, border:'1px solid #E2E8F0' }} />
              <div style={{ fontSize:10, color:'#94A3B8', wordBreak:'break-all', background:'#F8FAFC', borderRadius:8, padding:'8px 10px', margin:'14px 0', lineHeight:1.5 }}>{url}</div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => { const a=document.createElement('a'); a.href=qrImg.replace('260x260','600x600'); a.download=`QR-${qrTable.name}.png`; a.target='_blank'; a.click() }}
                  style={{ flex:1, padding:'12px 0', background:'#0A1628', color:'white', border:'none', borderRadius:12, fontWeight:800, fontSize:13, cursor:'pointer' }}>⬇ Download</button>
                <button onClick={() => setQrTable(null)}
                  style={{ flex:1, padding:'12px 0', background:'#F1F5F9', color:'#6B7A8D', border:'none', borderRadius:12, fontWeight:700, fontSize:13, cursor:'pointer' }}>Tutup</button>
              </div>
            </div>
          </div>
        )
      })()}
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
  card:       { position:'relative', background:'white', borderRadius:16, padding:16, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', minHeight:160, transition:'transform 0.15s, box-shadow 0.15s', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:'2px solid #E2E8F0' },
  menuBtn:    (bg) => ({ width:'100%', padding:'14px', borderRadius:12, border:'none', background:bg, color:'white', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }),
}
