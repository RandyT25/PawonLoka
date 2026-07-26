import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { qr } from '../../lib/quickRead'
import { fmt, KITCHEN_STATIONS } from '../../shared/constants'
import { useWhatsApp } from '../hooks/useWhatsApp'
import { dbWrite } from '../../shared/dbWrite'

export default function OrdersModal({ onClose, onRecall, onPrintKitchen }) {
  const [orders, setOrders]               = useState([])
  const [loading, setLoading]             = useState(true)
  const [tab, setTab]                     = useState('open')
  const [reprintOrder, setReprintOrder]   = useState(null)
  const [reprintSelected, setReprintSelected] = useState({})

  const channelRef = useRef(null)
  const { resendReceipt } = useWhatsApp()
  const [waSending, setWaSending] = useState(null)

  useEffect(() => {
    load()
    // Realtime subscription — auto-refresh on any of today's order changes
    const today = new Date().toISOString().slice(0, 10)
    const channel = supabase
      .channel('orders_modal_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `date=eq.${today}` }, () => {
        load()
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [tab])

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    let q = supabase.from('orders').select('*').eq('date', today).order('created_at', { ascending: false })
    if (tab === 'open') q = q.eq('status', 'Open')
    else if (tab === 'paid') q = q.eq('status', 'Paid')
    else q = q.in('status', ['Voided', 'Refunded'])
    q = q.limit(50)
    const result = (await qr(q, { cache:'orders_modal_'+tab, ms:5000 })) || []
    setOrders(result)
    setLoading(false)
  }

  async function handleResendWA(order) {
    if (!order.customer_id) { alert('No customer linked to this order'); return }
    setWaSending(order.id)
    try {
      const { data: cust } = await supabase.from('customers').select('*').eq('id', order.customer_id).maybeSingle()
      if (!cust?.phone) { alert('Customer has no phone number saved'); return }
      resendReceipt(order, cust)
    } catch(e) { alert('Failed: ' + e.message) }
    finally { setWaSending(null) }
  }
  function statusColor(s) {
    if (s === 'Paid') return '#16A34A'
    if (s === 'Voided' || s === 'Refunded') return '#DC2626'
    return '#F59E0B'
  }

  function statusBg(s) {
    if (s === 'Paid') return '#F0FDF4'
    if (s === 'Voided' || s === 'Refunded') return '#FFF1F2'
    return '#FFFBEB'
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.hd}>
          <span style={{ fontSize:16, fontWeight:800 }}>Orders Hari Ini</span>
          <button onClick={onClose} style={S.closeBtn}>x</button>
        </div>

        <div style={{ display:'flex', gap:8, padding:'12px 16px', borderBottom:'1px solid #E2E8F0', flexShrink:0 }}>
          {['open','paid','voided'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ ...S.tabBtn, ...(tab===t ? S.tabActive : {}) }}>
              {t === 'open' ? 'Open Bills' : t === 'paid' ? 'Lunas' : 'Voided'}
            </button>
          ))}
        </div>

        <div style={{ overflowY:'auto', flex:1, padding:16 }}>
          {loading && <div style={{ textAlign:'center', color:'#6B7A8D', padding:40 }}>Memuat...</div>}
          {!loading && orders.length === 0 && (
            <div style={{ textAlign:'center', color:'#6B7A8D', padding:40 }}>Tidak ada order</div>
          )}
          {orders.map(o => (
            <div key={o.id} style={S.orderCard}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:13 }}>{o.id}</div>
                  <div style={{ fontSize:12, color:'#6B7A8D' }}>
                    {o.time} · {o.table ? 'Table ' + o.table : 'Takeaway'} · {o.customer || 'Walk-in'}
                  </div>
                  <div style={{ fontSize:12, color:'#6B7A8D' }}>{o.staff} · {o.payments?.length > 1 ? o.payments.map(p=>p.method+' '+fmt(p.amount)).join(' + ') : o.pay}</div>
                  {o.notes && <div style={{ fontSize:11, color:'#DC2626', marginTop:2 }}>{o.notes}</div>}
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontWeight:900, fontSize:15 }}>{fmt(o.total)}</div>
                  <span style={{ fontSize:11, fontWeight:700, color:statusColor(o.status),
                    background:statusBg(o.status), padding:'2px 8px', borderRadius:20, display:'inline-block', marginTop:4 }}>
                    {o.status}
                  </span>
                </div>
              </div>
              <div style={{ fontSize:12, color:'#6B7A8D', marginBottom:8 }}>
                {(o.items||[]).map((i,idx) => (
                  <span key={idx}>{i.qty}x {i.name}{idx < o.items.length-1 ? ', ' : ''}</span>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {o.status === 'Open' && <>
                  <button onClick={() => { onRecall(o); onClose() }} style={S.recallBtn}>Buka ke Kasir</button>
                </>}
                {o.status === 'Paid' && o.customer_id && (
                  <button onClick={() => handleResendWA(o)} disabled={waSending===o.id}
                    style={{ ...S.recallBtn, background:'#25D366', color:'#fff', border:'none' }}>
                    {waSending===o.id ? '...' : 'WA'}
                  </button>
                )}
                <button onClick={() => { setReprintOrder(o); setReprintSelected({}) }}
                  style={{ flex:1, padding:'8px 12px', background:'#FFFBEB', color:'#B45309', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', minWidth:80 }}>
                  Reprint
                </button>
              </div>
            </div>
          ))}
        </div>

        {reprintOrder && (
          <div style={{ position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:1100 }}>
            <div style={{ background:'white', borderRadius:20, width:'100%', maxWidth:400, maxHeight:'80vh', overflow:'auto', boxShadow:'0 20px 60px rgba(9,30,66,0.3)' }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:800, fontSize:15 }}>Pilih Item Reprint</span>
                <button onClick={() => setReprintOrder(null)} style={{ width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'none', cursor:'pointer' }}>x</button>
              </div>
              <div style={{ padding:16 }}>
                <div style={{ fontSize:12, color:'#6B7A8D', marginBottom:6 }}>{reprintOrder.id} · {reprintOrder.table||'Takeaway'}</div>
                <button onClick={() => {
                  const all = {}
                  reprintOrder.items.forEach((_,idx) => { all[idx] = true })
                  setReprintSelected(all)
                }} style={{ fontSize:12, color:'#3B82F6', background:'none', border:'none', cursor:'pointer', fontWeight:700, marginBottom:10 }}>
                  Pilih Semua
                </button>
                {(reprintOrder.items||[]).map((item, idx) => (
                  <div key={idx} onClick={() => setReprintSelected(p => ({...p, [idx]: !p[idx]}))}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, border:'1.5px solid', marginBottom:6, cursor:'pointer',
                      borderColor: reprintSelected[idx] ? '#3B82F6' : '#E2E8F0',
                      background: reprintSelected[idx] ? '#EFF6FF' : 'white' }}>
                    <div style={{ width:18, height:18, borderRadius:4, border:'2px solid', flexShrink:0,
                      borderColor: reprintSelected[idx]?'#3B82F6':'#CBD5E1',
                      background: reprintSelected[idx]?'#3B82F6':'white',
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {reprintSelected[idx] && <span style={{ color:'white', fontSize:11, fontWeight:900 }}>v</span>}
                    </div>
                    <span style={{ flex:1, fontSize:13, fontWeight:600 }}>{item.qty}x {item.name}</span>
                    <span style={{ fontSize:11, color:'#94A3B8' }}>{item.cat||'Kitchen'}</span>
                  </div>
                ))}
                <button onClick={async () => {
                  const items = (reprintOrder.items||[]).filter((_,idx) => reprintSelected[idx])
                  if (!items.length) { alert('Pilih item dulu'); return }
                  const catRouting = (() => { try { return JSON.parse(localStorage.getItem('pl_cat_routing')||'{}') } catch { return {} } })()
                  const getStation = cat => catRouting[cat] || KITCHEN_STATIONS[cat] || 'Kitchen'
                  const ROLE_MAP = { Kitchen:'kitchen', kitchen:'kitchen', Snack:'snack', snack:'snack', Bar:'bar', bar:'bar', Kasir:'receipt', kasir:'receipt' }
                  const stations = {}
                  items.forEach(i => {
                    const st = getStation(i.cat)
                    if (!stations[st]) stations[st] = []
                    stations[st].push(i)
                  })
                  const now = new Date()
                  for (const [station, sitems] of Object.entries(stations)) {
                    await dbWrite('kitchen_tickets', 'insert', {
                      id: 'KT-RPT-' + crypto.randomUUID(),
                      table: reprintOrder.table || 'Takeaway',
                      items: sitems.map(i => ({ name:i.name, qty:i.qty, note:i.note, modifiers:i.modifiers })),
                      time: now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}),
                      status: 'New', station,
                    })
                    if (onPrintKitchen) {
                      try {
                        await onPrintKitchen({
                          stationRole: ROLE_MAP[station] || 'kitchen',
                          stationName: station,
                          table: reprintOrder.table || '-',
                          orderType: reprintOrder.table ? 'Dine-in' : 'Takeaway',
                          items: sitems.map(i => {
                            const parts = [i.qty + 'x ' + i.name]
                            if (i.modifiers && Object.values(i.modifiers).length)
                              parts.push('  [' + Object.values(i.modifiers).join(', ') + ']')
                            if (i.note) parts.push('  * ' + i.note)
                            return parts.join('\n')
                          }),
                          time: now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}),
                          orderId: reprintOrder.id,
                          type: 'reprint',
                          cancelItems: [],
                          settings: {},
                        })
                      } catch(e) { console.warn('Reprint print failed:', e.message) }
                    }
                  }
                  setReprintOrder(null)
                }} style={{ width:'100%', padding:13, background:'#0A1628', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:800, cursor:'pointer', marginTop:8 }}>
                  Reprint {Object.values(reprintSelected).filter(Boolean).length} Item
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  overlay:   { position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:1000 },
  modal:     { background:'white', borderRadius:20, width:'100%', maxWidth:560, maxHeight:'90vh', overflow:'hidden', boxShadow:'0 20px 60px rgba(9,30,66,0.3)', display:'flex', flexDirection:'column' },
  hd:        { padding:'16px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 },
  closeBtn:  { width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'none', cursor:'pointer', fontSize:14 },
  tabBtn:    { padding:'7px 16px', borderRadius:20, border:'1.5px solid #E2E8F0', background:'white', fontSize:12, fontWeight:600, cursor:'pointer', color:'#6B7A8D' },
  tabActive: { background:'#0A1628', borderColor:'#0A1628', color:'white' },
  orderCard: { border:'1px solid #E2E8F0', borderRadius:12, padding:14, marginBottom:10 },
  recallBtn: { flex:1, padding:'8px 12px', background:'#EFF6FF', color:'#2563EB', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer' },
}
