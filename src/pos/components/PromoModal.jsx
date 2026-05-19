import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../shared/constants'

export default function PromoModal({ subtotal, customer, onApply, onClose }) {
  const [promos, setPromos]       = useState([])
  const [voucherCode, setVoucherCode] = useState('')
  const [applied, setApplied]     = useState(null)
  const [error, setError]         = useState('')
  const [autoPromos, setAutoPromos] = useState([])

  useEffect(() => {
    loadPromos()
  }, [])

  async function loadPromos() {
    const { data } = await supabase.from('promotions').select('*').eq('active', true)
    const all = data || []
    
    const now = new Date()
    const h = now.getHours(), m = now.getMinutes()
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const today = days[now.getDay()]
    const curMin = h * 60 + m

    const active = all.filter(p => {
      if (p.min_spend > subtotal) return false
      if (p.code) return false // voucher codes shown separately
      if (p.schedule_type === 'always') return true
      if (!p.days?.includes(today)) return false
      const [sh, sm] = (p.start_time||'00:00').split(':').map(Number)
      const [eh, em] = (p.end_time||'23:59').split(':').map(Number)
      const startMin = sh*60+sm, endMin = eh*60+em
      return curMin >= startMin && curMin <= endMin
    })

    // Gold Member auto-apply if customer is Gold/Silver
    const filtered = active.filter(p => {
      if (p.name === 'Gold Member') return customer?.tier === 'Gold' || customer?.tier === 'Silver'
      return true
    })

    setAutoPromos(filtered)
    setPromos(all)
  }

  function calcDisc(p) {
    if (p.type === 'Percentage') return Math.round(subtotal * p.value / 100)
    return Math.min(subtotal, p.value)
  }

  function applyPromo(p) {
    const disc = calcDisc(p)
    setApplied({ ...p, disc })
    setError('')
  }

  async function applyVoucher() {
    if (!voucherCode.trim()) return
    const { data } = await supabase.from('promotions')
      .select('*').eq('code', voucherCode.trim().toUpperCase()).eq('active', true).single()
    if (!data) { setError('Kode voucher tidak valid'); return }
    if (data.min_spend > subtotal) { setError('Minimum belanja ' + fmt(data.min_spend)); return }
    const disc = calcDisc(data)
    setApplied({ ...data, disc })
    setError('')
  }

  function confirm() {
    if (applied) onApply(applied)
    else onClose()
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.hd}>
          <span style={{ fontWeight:800, fontSize:15 }}>Promo & Voucher</span>
          <button onClick={onClose} style={S.close}>x</button>
        </div>
        <div style={{ padding:16, overflowY:'auto' }}>

          {/* Applied promo */}
          {applied && (
            <div style={{ background:'#F0FDF4', border:'1.5px solid #86EFAC', borderRadius:12, padding:14, marginBottom:14, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:800, color:'#16A34A', fontSize:14 }}>{applied.name}</div>
                <div style={{ fontSize:12, color:'#16A34A' }}>Diskon: {fmt(applied.disc)}</div>
              </div>
              <button onClick={() => setApplied(null)} style={{ fontSize:12, color:'#DC2626', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>Hapus</button>
            </div>
          )}

          {/* Auto promos */}
          {autoPromos.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={S.label}>Promo Aktif Sekarang</div>
              {autoPromos.map(p => (
                <button key={p.id} onClick={() => applyPromo(p)}
                  style={{ ...S.promoCard, borderColor: applied?.id===p.id ? '#16A34A' : '#E2E8F0', background: applied?.id===p.id ? '#F0FDF4' : 'white' }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13 }}>{p.name}</div>
                    <div style={{ fontSize:11, color:'#6B7A8D' }}>
                      {p.type === 'Percentage' ? p.value + '% off' : 'Rp ' + fmt(p.value) + ' off'}
                      {p.min_spend > 0 ? ' · Min. ' + fmt(p.min_spend) : ''}
                    </div>
                    <div style={{ fontSize:11, color:'#10B981', fontWeight:600 }}>Hemat {fmt(calcDisc(p))}</div>
                  </div>
                  <div style={{ fontWeight:900, fontSize:16, color:'#16A34A' }}>
                    {applied?.id === p.id ? '✓' : 'Pakai'}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Voucher code input */}
          <div style={{ marginBottom:14 }}>
            <div style={S.label}>Kode Voucher</div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={voucherCode} onChange={e => setVoucherCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key==='Enter' && applyVoucher()}
                placeholder="Masukkan kode voucher"
                style={{ ...S.input, flex:1, marginBottom:0 }} />
              <button onClick={applyVoucher} style={S.applyBtn}>Pakai</button>
            </div>
            {error && <div style={{ color:'#DC2626', fontSize:12, marginTop:6 }}>{error}</div>}
          </div>

          {/* No active promos */}
          {autoPromos.length === 0 && !applied && (
            <div style={{ textAlign:'center', color:'#94A3B8', fontSize:13, padding:'10px 0 16px' }}>
              Tidak ada promo aktif saat ini
            </div>
          )}

          <button onClick={confirm} style={S.confirmBtn}>
            {applied ? 'Terapkan Diskon ' + fmt(applied.disc) : 'Tutup'}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay:    { position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:1100 },
  modal:      { background:'white', borderRadius:20, width:'100%', maxWidth:400, maxHeight:'85vh', overflow:'hidden', boxShadow:'0 20px 60px rgba(9,30,66,0.3)', display:'flex', flexDirection:'column' },
  hd:         { padding:'14px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 },
  close:      { width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'none', cursor:'pointer' },
  label:      { fontSize:11, fontWeight:800, color:'#6B7A8D', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 },
  promoCard:  { width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', borderRadius:12, border:'1.5px solid #E2E8F0', background:'white', cursor:'pointer', marginBottom:8 },
  input:      { padding:'10px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:14, outline:'none', boxSizing:'border-box' },
  applyBtn:   { padding:'10px 16px', borderRadius:10, background:'#0A1628', color:'white', border:'none', fontWeight:700, cursor:'pointer', fontSize:13 },
  confirmBtn: { width:'100%', padding:13, background:'#16A34A', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:800, cursor:'pointer' },
}
