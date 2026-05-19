import { useState } from 'react'
import { PAY_METHODS, fmt, TAX_RATE } from '../../shared/constants'

import { useWhatsApp } from '../hooks/useWhatsApp'

const formatReceipt = (order, customer) => {
  const items = order.items.map(i =>
    i.qty + 'x ' + i.name + ' - Rp ' + (i.price * i.qty).toLocaleString('id-ID')
  ).join('\n')
  const receiptUrl = 'https://pawonloka.pages.dev/receipt/' + order.id
  const lines = [
    '*STRUK PAWONLOKA*',
    'No. Order: ' + order.id,
    'Tanggal: ' + order.date + ' ' + order.time,
    'Kasir: ' + order.staff,
    customer?.name ? 'Pelanggan: ' + customer.name : null,
    '',
    '*Detail Pesanan:*',
    items,
    '',
    order.discount > 0 ? 'Diskon: -Rp ' + order.discount.toLocaleString('id-ID') : null,
    order.tax > 0 ? 'Pajak: Rp ' + order.tax.toLocaleString('id-ID') : null,
    '*Total: Rp ' + order.total.toLocaleString('id-ID') + '*',
    'Pembayaran: ' + order.pay,
    order.pay === 'Cash' && order.change > 0 ? 'Kembali: Rp ' + order.change.toLocaleString('id-ID') : null,
    customer?.points !== undefined ? 'Poin kamu: ' + customer.points + ' pts' : null,
    '', '', receiptUrl, '',
    'Terima kasih telah makan di PawonLoka!',
    'Hubungi kami: wa.me/6282299238866',
  ]
  return lines.filter(l => l !== null).join('\n')
}

export default function ChargeModal({ cart, totals, onConfirm, onClose, onSuccess, customer, appliedPromo, onOpenPromo }) {
  const { sendReceipt } = useWhatsApp()
  const [tab, setTab]           = useState('pay') // pay | split
  const [orderNote, setOrderNote] = useState('')
  const [multiPay, setMultiPay]   = useState([]) // [{method, amount}]
  const [showMulti, setShowMulti] = useState(false)
  const [activeSplit, setActiveSplit] = useState(null)
  const [payMethod, setPayMethod] = useState('Cash')
  const [cashGiven, setCashGiven] = useState('')
  const [saving, setSaving]     = useState(false)
  const [paidOrder, setPaidOrder] = useState(null)
  const [usePoints, setUsePoints] = useState(0)
  // Split state
  const [splitMode, setSplitMode] = useState('equal')
  const [splitParts, setSplitParts] = useState(2)
  const [splitAmount, setSplitAmount] = useState('')
  const [splitChecked, setSplitChecked] = useState({})

  const { subtotal, tax, total, fee } = totals
  const promoDisc = appliedPromo ? appliedPromo.disc : 0
  const grossTotal = (total || (subtotal + tax + (fee||0))) - promoDisc
  const alreadyPaid = totals.splitPaid || 0
  const actualTotal = grossTotal - alreadyPaid
  const maxPoints = customer ? Math.min(customer.points || 0, Math.floor(actualTotal / 100)) : 0
  const finalTotal = actualTotal - (usePoints * 100)
  const isSplitAmount = activeSplit != null
  const splitFinal = activeSplit ? activeSplit.amount : finalTotal
  const multiTotal     = multiPay.reduce((s,p) => s+p.amount, 0)
  const multiRemaining = finalTotal - multiTotal
  const change = payMethod === 'Cash' ? (parseInt(cashGiven) || 0) - (multiPay.length>0 ? multiRemaining : finalTotal) : 0
  const splitChange = payMethod === 'Cash' ? (parseInt(cashGiven)||0) - splitFinal : 0
  const effectiveChange = isSplitAmount ? splitChange : change
  const canCharge = (multiPay.length > 0 && multiRemaining <= 0) || payMethod !== 'Cash' || isSplitAmount || (cashGiven && splitChange >= 0)

  async function handleConfirm() {
    setSaving(true)
    const effectiveFinal = isSplitAmount ? splitFinal : finalTotal
    const effectiveCash = isSplitAmount ? String(splitFinal) : cashGiven
    const order = await onConfirm({ payMethod, cashGiven: effectiveCash, discount: 0, usePoints, finalTotal: effectiveFinal, splitLabel: activeSplit?.label, orderNote, promoDisc: appliedPromo?.disc || 0, promoName: appliedPromo?.name, multiPay: multiPay.length > 0 ? multiPay : null })
    setSaving(false)
    if (order) setPaidOrder(order)
  }

  function handleWhatsApp() {
    if (!paidOrder) return
    let phone = ''
    const rawPhone = customer?.phone
    if (rawPhone && rawPhone !== '000' && rawPhone.replace(/\D/g,'').length >= 8) {
      phone = rawPhone.replace(/^0/, '62').replace(/\D/g, '')
    } else {
      const input = prompt('Nomor WhatsApp pelanggan (misal: 08123456789):')
      if (!input) return
      phone = input.replace(/^0/, '62').replace(/\D/g, '')
    }
    const msg = encodeURIComponent(formatReceipt(paidOrder, customer))
    window.open('https://wa.me/' + phone + '?text=' + msg, '_blank')
  }

  // Split helpers
  const remaining = actualTotal
  const perPart = Math.ceil(remaining / splitParts)
  const splitItemsTotal = cart.filter(i => splitChecked[i._key])
    .reduce((a,i) => a + (i.price-(i.itemDisc||0))*i.qty, 0)

  function chargeSplit() {
    let amt = 0, label = ''
    if (splitMode === 'equal') { amt = perPart; label = 'Split '+splitParts+' orang' }
    else if (splitMode === 'by-amount') { amt = parseFloat(splitAmount)||0; label = 'Partial Payment' }
    else { amt = splitItemsTotal; label = 'Item Split' }
    if (amt <= 0) return
    setActiveSplit({ amount: amt, label })
    setTab('pay')
  }

  // SUCCESS SCREEN
  if (paidOrder) return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={{ padding:28, textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:8 }}>OK</div>
          <div style={{ fontSize:18, fontWeight:900, color:'#0A1628', marginBottom:4 }}>Pembayaran Berhasil!</div>
          <div style={{ fontSize:12, color:'#6B7A8D', marginBottom:4 }}>{paidOrder.id}</div>
          {paidOrder.pay === 'Cash' && paidOrder.change > 0 && (
            <div style={{ fontSize:28, fontWeight:900, color:'#16A34A', margin:'12px 0' }}>
              Kembalian: {fmt(paidOrder.change)}
            </div>
          )}
          <div style={{ fontSize:20, fontWeight:900, color:'#0A1628', margin:'8px 0 20px' }}>
            Total: {fmt(paidOrder.total)}
          </div>
          <button onClick={handleWhatsApp} style={S.waBtn}>Kirim Struk WhatsApp</button>
          {paidOrder._isSplit && !paidOrder._fullyPaid
            ? <button onClick={() => { setPaidOrder(null); setTab('pay') }}
                style={{ ...S.doneBtn, background:'#6366F1', color:'white' }}>
                Lanjut Split — Sisa {fmt(grossTotal - (paidOrder.splitPaid||0))}
              </button>
            : <button onClick={onSuccess || onClose} style={S.doneBtn}>Selesai</button>
          }
        </div>
      </div>
    </div>
  )

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.hd}>
          <span style={{ fontSize:15, fontWeight:800 }}>Pembayaran</span>
          <button onClick={onClose} style={S.closeBtn}>x</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid #E2E8F0' }}>
          {[['pay','Bayar'],['split','Split Bill']].map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex:1, padding:'10px 0', border:'none', background:'none', fontSize:13, fontWeight:700,
                cursor:'pointer', color: tab===t ? '#0A1628' : '#6B7A8D',
                borderBottom: tab===t ? '2px solid #0A1628' : '2px solid transparent' }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ padding:16, overflowY:'auto', flex:1 }}>

          {/* Order summary */}
          <div style={S.summary}>
            {cart.map(i => (
              <div key={i._key} style={S.summaryRow}>
                <span style={{ fontSize:12 }}>{i.qty}x {i.name}{Object.keys(i.modifiers||{}).length>0?' ('+Object.values(i.modifiers).join(', ')+')':''}</span>
                <span style={{ fontWeight:600, fontSize:12 }}>{fmt((i.price-(i.itemDisc||0)) * i.qty)}</span>
              </div>
            ))}
            <div style={S.divider}/>
            <div style={S.summaryRow}><span style={S.dimTxt}>Subtotal</span><span>{fmt(subtotal)}</span></div>
            {fee > 0 && <div style={S.summaryRow}><span style={S.dimTxt}>Fee</span><span>{fmt(fee)}</span></div>}
            <div style={S.summaryRow}><span style={S.dimTxt}>Tax (10%)</span><span>{fmt(tax)}</span></div>
            {usePoints > 0 && <div style={S.summaryRow}><span style={{ color:'#10B981', fontSize:12 }}>Points ({usePoints}pts)</span><span style={{ color:'#10B981' }}>-{fmt(usePoints*100)}</span></div>}
            {activeSplit && (
              <div style={{ ...S.summaryRow, color:'#6366F1', fontWeight:700, fontSize:12 }}>
                <span>{activeSplit.label}</span>
                <span>dari {fmt(actualTotal)}</span>
              </div>
            )}
            <div style={{ ...S.summaryRow, fontWeight:900, fontSize:16, marginTop:6 }}>
              <span>Total {activeSplit ? '(Split)' : ''}</span>
              <span style={{ color:'#0A1628' }}>{fmt(activeSplit ? splitFinal : finalTotal)}</span>
            </div>
          </div>

          {/* PAY TAB */}
          {tab === 'pay' && <>
            {/* Promo button */}
            <div style={{ marginBottom:14, display:'flex', gap:8 }}>
              <button onClick={onOpenPromo}
                style={{ flex:1, padding:'9px 12px', borderRadius:10, border:'1.5px solid', fontSize:12, fontWeight:700, cursor:'pointer',
                  borderColor: appliedPromo ? '#16A34A' : '#E2E8F0',
                  background: appliedPromo ? '#F0FDF4' : 'white',
                  color: appliedPromo ? '#16A34A' : '#6B7A8D' }}>
                {appliedPromo ? 'Promo: ' + appliedPromo.name + ' -' + fmt(appliedPromo.disc) : '+ Promo / Voucher'}
              </button>
            </div>

            {/* Points */}
            {customer && maxPoints > 0 && (
              <div style={{ marginBottom:14, padding:12, background:'#FFFBEB', borderRadius:10, border:'1px solid #FDE68A' }}>
                <div style={S.label}>Poin ({customer.name}: {customer.points} pts)</div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input type="number" value={usePoints}
                    onChange={e => setUsePoints(Math.min(parseInt(e.target.value)||0, maxPoints))}
                    min={0} max={maxPoints}
                    style={{ ...S.input, width:90, textAlign:'center', marginBottom:0 }} />
                  <span style={{ fontSize:12, color:'#6B7A8D' }}>= {fmt(usePoints*100)} off</span>
                  <button onClick={() => setUsePoints(maxPoints)} style={{ fontSize:12, color:'#F59E0B', fontWeight:700, background:'none', border:'none', cursor:'pointer' }}>Max</button>
                </div>
              </div>
            )}

            {/* Payment method */}
            <div style={{ marginBottom:14 }}>
              <div style={S.label}>Metode Pembayaran</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {PAY_METHODS.map(m => (
                  <button key={m.id} onClick={() => setPayMethod(m.id)}
                    style={{ ...S.optBtn, ...(payMethod===m.id ? S.optActive : {}) }}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash input */}
            {payMethod === 'Cash' && (
              <div style={{ marginBottom:14 }}>
                <div style={S.label}>Uang Diterima</div>
                <input type="number" value={cashGiven} onChange={e => setCashGiven(e.target.value)}
                  placeholder="Masukkan jumlah" style={S.input} autoFocus />
                <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
                  {[finalTotal, Math.ceil(finalTotal/10000)*10000, Math.ceil(finalTotal/50000)*50000, 100000, 200000]
                    .filter((v,i,a) => a.indexOf(v)===i).map(amt => (
                      <button key={amt} onClick={() => setCashGiven(String(amt))} style={S.quickBtn}>{fmt(amt)}</button>
                    ))}
                </div>
                {cashGiven && (
                  <div style={{ marginTop:8, padding:12, background: change>=0?'#F0FDF4':'#FFF1F2', borderRadius:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontWeight:800, fontSize:16, color: effectiveChange>=0?'#16A34A':'#DC2626' }}>
                      <span>Kembalian</span>
                      <span>{fmt(Math.abs(effectiveChange))}{effectiveChange<0?' SHORT':''}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button onClick={handleConfirm} disabled={!canCharge||saving}
              style={{ ...S.chargeBtn, opacity:!canCharge||saving?0.4:1 }}>
              {saving ? 'Memproses...' : 'Konfirmasi Pembayaran - ' + fmt(isSplitAmount ? splitFinal : finalTotal)}
            </button>
          </>}

          {/* SPLIT TAB */}
          {tab === 'split' && <>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              {[['equal','Equal'],['by-item','By Item'],['by-amount','By Amount']].map(([m,l]) => (
                <button key={m} onClick={() => setSplitMode(m)}
                  style={{ ...S.optBtn, flex:1, ...(splitMode===m?S.optActive:{}) }}>{l}</button>
              ))}
            </div>

            {splitMode === 'equal' && (
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:13, color:'#6B7A8D', marginBottom:10 }}>Bagi berapa orang?</div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:20, marginBottom:16 }}>
                  <button onClick={() => setSplitParts(p=>Math.max(2,p-1))} style={S.qBtn}>-</button>
                  <span style={{ fontSize:32, fontWeight:900 }}>{splitParts}</span>
                  <button onClick={() => setSplitParts(p=>p+1)} style={S.qBtn}>+</button>
                </div>
                <div style={{ background:'#F8FAFC', borderRadius:12, padding:16, marginBottom:16 }}>
                  <div style={{ fontSize:12, color:'#6B7A8D', marginBottom:4 }}>Setiap orang bayar</div>
                  <div style={{ fontSize:32, fontWeight:900, color:'#0A1628' }}>{fmt(perPart)}</div>
                  <div style={{ fontSize:12, color:'#6B7A8D', marginTop:4 }}>{fmt(remaining)} / {splitParts}{alreadyPaid>0?' (sisa)':''}</div>
                </div>
              </div>
            )}

            {splitMode === 'by-item' && (
              <div>
                <div style={{ fontSize:12, color:'#6B7A8D', marginBottom:10 }}>Pilih item untuk split ini:</div>
                {cart.map(i => (
                  <div key={i._key} onClick={() => setSplitChecked(p=>({...p,[i._key]:!p[i._key]}))}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10,
                      border:'1.5px solid', borderColor:splitChecked[i._key]?'#3B82F6':'#E2E8F0',
                      background:splitChecked[i._key]?'#EFF6FF':'white', marginBottom:6, cursor:'pointer' }}>
                    <div style={{ width:18, height:18, borderRadius:4, border:'2px solid', flexShrink:0,
                      borderColor:splitChecked[i._key]?'#3B82F6':'#CBD5E1', background:splitChecked[i._key]?'#3B82F6':'white',
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {splitChecked[i._key] && <span style={{ color:'white', fontSize:11, fontWeight:900 }}>✓</span>}
                    </div>
                    <span style={{ flex:1, fontSize:13, fontWeight:600 }}>{i.qty}x {i.name}</span>
                    <span style={{ fontWeight:700, fontSize:13 }}>{fmt((i.price-(i.itemDisc||0))*i.qty)}</span>
                  </div>
                ))}
                {splitItemsTotal > 0 && (
                  <div style={{ background:'#F8FAFC', borderRadius:10, padding:12, textAlign:'center', marginTop:8 }}>
                    <div style={{ fontSize:12, color:'#6B7A8D' }}>Total item terpilih</div>
                    <div style={{ fontSize:24, fontWeight:900 }}>{fmt(splitItemsTotal)}</div>
                  </div>
                )}
              </div>
            )}

            {splitMode === 'by-amount' && (
              <div>
                <div style={{ fontSize:12, color:'#6B7A8D', marginBottom:8 }}>Total: <b>{fmt(finalTotal)}</b></div>
                <input type="number" value={splitAmount} onChange={e=>setSplitAmount(e.target.value)}
                  placeholder="Jumlah yang dibayar" style={S.input} autoFocus />
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                  {[2,3,4].map(n => (
                    <button key={n} onClick={()=>setSplitAmount(String(Math.ceil(finalTotal/n)))} style={S.quickBtn}>
                      1/{n} = {fmt(Math.ceil(finalTotal/n))}
                    </button>
                  ))}
                </div>
                {splitAmount > 0 && (
                  <div style={{ background:'#FFF1F2', borderRadius:10, padding:12, textAlign:'center' }}>
                    <div style={{ fontSize:12, color:'#6B7A8D' }}>Sisa setelah ini</div>
                    <div style={{ fontSize:22, fontWeight:900, color:'#DC2626' }}>{fmt(Math.max(0,finalTotal-parseFloat(splitAmount)))}</div>
                  </div>
                )}
              </div>
            )}

            <button onClick={chargeSplit} style={{ ...S.chargeBtn, marginTop:16 }}>
              Lanjut Bayar Split
            </button>
          </>}
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay:    { position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:1000 },
  modal:      { background:'white', borderRadius:20, width:'100%', maxWidth:500, maxHeight:'94vh', overflow:'hidden', boxShadow:'0 20px 60px rgba(9,30,66,0.3)', display:'flex', flexDirection:'column' },
  hd:         { padding:'14px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 },
  closeBtn:   { width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'none', cursor:'pointer', fontSize:14 },
  summary:    { background:'#F8FAFC', borderRadius:12, padding:12, marginBottom:14 },
  summaryRow: { display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 },
  divider:    { borderTop:'1px solid #E2E8F0', margin:'6px 0' },
  dimTxt:     { color:'#6B7A8D', fontSize:12 },
  label:      { fontSize:11, fontWeight:800, color:'#6B7A8D', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 },
  optBtn:     { padding:'8px 12px', borderRadius:10, border:'1.5px solid #E2E8F0', background:'white', fontSize:12, fontWeight:600, cursor:'pointer', color:'#6B7A8D' },
  optActive:  { background:'#0A1628', borderColor:'#0A1628', color:'white' },
  input:      { width:'100%', padding:'11px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:8 },
  quickBtn:   { padding:'5px 10px', borderRadius:8, border:'1.5px solid #E2E8F0', background:'white', fontSize:12, cursor:'pointer', fontWeight:600 },
  chargeBtn:  { width:'100%', padding:14, background:'#0A1628', color:'white', border:'none', borderRadius:12, fontSize:14, fontWeight:800, cursor:'pointer' },
  waBtn:      { width:'100%', padding:13, background:'#25D366', color:'white', border:'none', borderRadius:12, fontSize:14, fontWeight:700, cursor:'pointer', marginBottom:8 },
  doneBtn:    { width:'100%', padding:13, background:'#F1F5F9', color:'#0A1628', border:'none', borderRadius:12, fontSize:14, fontWeight:700, cursor:'pointer' },
  qBtn:       { width:40, height:40, borderRadius:10, border:'1.5px solid #E2E8F0', background:'white', fontSize:20, fontWeight:700, cursor:'pointer' },
}
