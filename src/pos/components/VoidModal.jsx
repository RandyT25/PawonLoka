import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../shared/constants'

const MANAGER_PIN = '9999'

export default function VoidModal({ onClose }) {
  const [step, setStep] = useState('search')
  const [query, setQuery] = useState('')
  const [orders, setOrders] = useState([])
  const [allOrders, setAllOrders] = useState([])
  const [selected, setSelected] = useState(null)
  const [pin, setPin] = useState('')
  const [reason, setReason] = useState('')
  const [refundType, setRefundType] = useState('full')
  const [refundAmount, setRefundAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadOrders() }, [])

  async function loadOrders() {
    setLoading(true)
    const today = new Date().toISOString().slice(0,10)
    const { data } = await supabase
      .from('orders').select('*')
      .eq('date', today)
      .in('status', ['Paid', 'Open'])
      .order('created_at', { ascending: false })
      .limit(50)
    setAllOrders(data || [])
    setOrders(data || [])
    setLoading(false)
  }

  async function searchOrders() {
    if (!query.trim()) { setOrders(allOrders); return }
    setOrders(allOrders.filter(o =>
      o.id.toLowerCase().includes(query.toLowerCase()) ||
      (o.customer||'').toLowerCase().includes(query.toLowerCase())
    ))
  }

  function selectOrder(order) {
    setSelected(order)
    setRefundAmount(String(order.total))
    setStep('pin')
    setError('')
  }

  function checkPin() {
    if (pin === MANAGER_PIN) { setStep('confirm'); setError('') }
    else { setError('PIN salah'); setPin('') }
  }

  async function doVoid() {
    if (!reason.trim()) { setError('Masukkan alasan'); return }
    const amount = refundType === 'full' ? selected.total : parseFloat(refundAmount) || 0
    if (refundType === 'partial' && amount <= 0) { setError('Masukkan jumlah refund'); return }
    if (refundType === 'partial' && amount > selected.total) { setError('Melebihi total order'); return }

    setLoading(true)
    const newStatus = refundType === 'full' ? 'Voided' : 'Refunded'
    const { error: err } = await supabase.from('orders').update({
      status: newStatus,
      notes: (selected.notes || '') + ' | ' + newStatus.toUpperCase() + ': Rp' + amount + ' - ' + reason
    }).eq('id', selected.id)

    if (err) { setError('Gagal'); setLoading(false); return }

    // Log refund as cash out if cash payment
    if (selected.pay === 'Cash' || refundType === 'partial') {
      await supabase.from('cash_logs').insert({
        type: 'expense',
        amount,
        reason: newStatus + ': ' + selected.id + ' - ' + reason,
        staff: 'Manager',
        date: new Date().toISOString().slice(0,10),
        time: new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}),
      })
    }

    setStep('done')
    setLoading(false)
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.hd}>
          <span style={{ fontSize:16, fontWeight:800, color:'#DC2626' }}>Void / Refund</span>
          <button onClick={onClose} style={S.closeBtn}>x</button>
        </div>
        <div style={{ padding:20 }}>

          {step === 'search' && <>
            <div style={{ fontSize:12, color:'#6B7A8D', marginBottom:12 }}>Cari No. Order atau nama pelanggan</div>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <input value={query} onChange={e=>setQuery(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&searchOrders()}
                placeholder="ORD-xxx atau nama" style={S.input} autoFocus />
              <button onClick={searchOrders} style={S.searchBtn}>Cari</button>
            </div>
            {loading && <div style={{ textAlign:'center', color:'#6B7A8D' }}>Memuat...</div>}
            {orders.map(o => (
              <div key={o.id} onClick={() => selectOrder(o)} style={S.orderRow}>
                <div>
                  <div style={{ fontWeight:700, fontSize:13 }}>{o.id}</div>
                  <div style={{ fontSize:12, color:'#6B7A8D' }}>{o.date} {o.time} · {o.customer||'Walk-in'} · {o.pay}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontWeight:800 }}>{fmt(o.total)}</div>
                  <div style={{ fontSize:11, color: o.status==='Paid'?'#16A34A':'#F59E0B' }}>{o.status}</div>
                </div>
              </div>
            ))}
            {orders.length===0 && query && !loading && (
              <div style={{ textAlign:'center', color:'#6B7A8D', fontSize:13 }}>Tidak ditemukan</div>
            )}
          </>}

          {step === 'pin' && <>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontWeight:800 }}>{selected.id}</div>
              <div style={{ fontSize:13, color:'#6B7A8D' }}>{fmt(selected.total)} · {selected.customer||'Walk-in'}</div>
            </div>
            <div style={{ fontSize:12, fontWeight:700, color:'#6B7A8D', marginBottom:8 }}>PIN Manager</div>
            <input type="password" value={pin} onChange={e=>setPin(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&checkPin()}
              placeholder="PIN" style={{ ...S.input, textAlign:'center', letterSpacing:8, fontSize:20 }} autoFocus />
            {error && <div style={{ color:'#DC2626', fontSize:12, marginTop:8 }}>{error}</div>}
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button onClick={() => setStep('search')} style={S.cancelBtn}>Kembali</button>
              <button onClick={checkPin} style={S.actionBtn}>Konfirmasi</button>
            </div>
          </>}

          {step === 'confirm' && <>
            <div style={{ background:'#FFF1F2', border:'1px solid #FECDD3', borderRadius:12, padding:14, marginBottom:16 }}>
              <div style={{ fontWeight:800, color:'#DC2626', marginBottom:6 }}>Order: {selected.id}</div>
              <div style={{ fontSize:13 }}>{selected.customer||'Walk-in'} · {fmt(selected.total)} · {selected.pay}</div>
              <div style={{ marginTop:8 }}>
                {selected.items?.map((i,idx) => (
                  <div key={idx} style={{ fontSize:12, color:'#6B7A8D' }}>{i.qty}x {i.name}</div>
                ))}
              </div>
            </div>

            {/* Refund type */}
            <div style={{ marginBottom:14 }}>
              <div style={S.label}>Jenis</div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setRefundType('full')}
                  style={{ ...S.typeBtn, ...(refundType==='full'?{background:'#DC2626',color:'white',borderColor:'#DC2626'}:{}) }}>
                  Void Penuh
                </button>
                <button onClick={() => setRefundType('partial')}
                  style={{ ...S.typeBtn, ...(refundType==='partial'?{background:'#F59E0B',color:'white',borderColor:'#F59E0B'}:{}) }}>
                  Refund Sebagian
                </button>
              </div>
            </div>

            {refundType === 'partial' && (
              <div style={{ marginBottom:14 }}>
                <div style={S.label}>Jumlah Refund</div>
                <input type="number" value={refundAmount} onChange={e=>setRefundAmount(e.target.value)}
                  placeholder="Jumlah yang direfund" style={S.input} />
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {[25,50,75,100].map(pct => (
                    <button key={pct} onClick={() => setRefundAmount(String(Math.round(selected.total*pct/100)))}
                      style={S.quickBtn}>{pct}% = {fmt(Math.round(selected.total*pct/100))}</button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom:14 }}>
              <div style={S.label}>Alasan *</div>
              <input value={reason} onChange={e=>setReason(e.target.value)}
                placeholder="Contoh: Salah order, komplain pelanggan..." style={S.input} />
            </div>

            {refundType === 'full' && (
              <div style={{ background:'#FFF1F2', borderRadius:10, padding:10, marginBottom:14, fontSize:12, color:'#DC2626', fontWeight:600 }}>
                Void penuh: {fmt(selected.total)} akan dicatat sebagai pengeluaran kas
              </div>
            )}
            {refundType === 'partial' && refundAmount > 0 && (
              <div style={{ background:'#FFFBEB', borderRadius:10, padding:10, marginBottom:14, fontSize:12, color:'#B45309', fontWeight:600 }}>
                Refund sebagian: {fmt(parseFloat(refundAmount))} akan dicatat sebagai pengeluaran kas
              </div>
            )}

            {error && <div style={{ color:'#DC2626', fontSize:12, marginBottom:8 }}>{error}</div>}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setStep('pin')} style={S.cancelBtn}>Kembali</button>
              <button onClick={doVoid} disabled={loading}
                style={{ ...S.actionBtn, background: refundType==='full'?'#DC2626':'#F59E0B', opacity:loading?0.5:1 }}>
                {loading ? 'Memproses...' : refundType==='full' ? 'VOID ORDER' : 'REFUND ' + fmt(parseFloat(refundAmount)||0)}
              </button>
            </div>
          </>}

          {step === 'done' && (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>OK</div>
              <div style={{ fontWeight:800, fontSize:16, color:'#16A34A', marginBottom:8 }}>
                {refundType==='full' ? 'Order di-Void' : 'Refund Berhasil'}
              </div>
              <div style={{ fontSize:13, color:'#6B7A8D', marginBottom:4 }}>{selected.id}</div>
              <div style={{ fontSize:13, color:'#6B7A8D', marginBottom:20 }}>
                {refundType==='partial' ? 'Refund: ' + fmt(parseFloat(refundAmount)) + ' | ' : ''}
                Alasan: {reason}
              </div>
              <button onClick={onClose} style={S.actionBtn}>Selesai</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay:   { position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:1000 },
  modal:     { background:'white', borderRadius:20, width:'100%', maxWidth:480, maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 60px rgba(9,30,66,0.3)' },
  hd:        { padding:'16px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' },
  closeBtn:  { width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'none', cursor:'pointer', fontSize:14 },
  input:     { width:'100%', padding:'11px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:10 },
  orderRow:  { display:'flex', justifyContent:'space-between', alignItems:'center', padding:12, border:'1px solid #E2E8F0', borderRadius:10, marginBottom:8, cursor:'pointer' },
  searchBtn: { padding:'11px 20px', background:'#0A1628', color:'white', border:'none', borderRadius:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' },
  cancelBtn: { flex:1, padding:12, background:'#F1F5F9', border:'none', borderRadius:10, fontWeight:700, cursor:'pointer' },
  actionBtn: { flex:1, padding:12, background:'#DC2626', color:'white', border:'none', borderRadius:10, fontWeight:700, cursor:'pointer' },
  label:     { fontSize:11, fontWeight:800, color:'#6B7A8D', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 },
  typeBtn:   { flex:1, padding:'10px 0', borderRadius:10, border:'1.5px solid #E2E8F0', background:'white', fontWeight:700, cursor:'pointer', fontSize:13 },
  quickBtn:  { padding:'5px 10px', borderRadius:8, border:'1.5px solid #E2E8F0', background:'white', fontSize:11, cursor:'pointer', fontWeight:600 },
}
