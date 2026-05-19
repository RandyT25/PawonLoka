import { useState } from 'react'
import { fmt } from '../../shared/constants'

export default function SplitModal({ cart, totals, onChargeSplit, onClose }) {
  const [mode, setMode]     = useState('equal')
  const [parts, setParts]   = useState(2)
  const [amount, setAmount] = useState('')
  const [checked, setChecked] = useState({})

  const { total } = totals
  const perPart = Math.ceil(total / parts)

  function toggleItem(key) {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function handleCharge() {
    if (mode === 'equal') {
      onChargeSplit(perPart, `Split Bill (${parts} orang)`)
    } else if (mode === 'by-amount') {
      const amt = parseFloat(amount) || 0
      if (amt <= 0) return
      onChargeSplit(amt, 'Partial Payment')
    } else {
      const selectedItems = cart.filter(i => checked[i._key])
      if (selectedItems.length === 0) return
      const amt = selectedItems.reduce((a, i) => a + (i.price - (i.itemDisc||0)) * i.qty, 0)
      onChargeSplit(Math.round(amt), 'Item Split')
    }
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.hd}>
          <span style={{ fontWeight:800, fontSize:15 }}>Split Bill</span>
          <button onClick={onClose} style={S.close}>x</button>
        </div>
        <div style={{ padding:20 }}>

          {/* Mode tabs */}
          <div style={{ display:'flex', gap:8, marginBottom:20 }}>
            {[['equal','Equal'],['by-item','By Item'],['by-amount','By Amount']].map(([m,l]) => (
              <button key={m} onClick={() => setMode(m)}
                style={{ ...S.modeBtn, ...(mode===m ? S.modeActive : {}) }}>
                {l}
              </button>
            ))}
          </div>

          {/* Equal split */}
          {mode === 'equal' && (
            <div>
              <div style={{ textAlign:'center', marginBottom:16 }}>
                <div style={{ fontSize:13, color:'#6B7A8D', marginBottom:10 }}>Bagi berapa orang?</div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:20 }}>
                  <button onClick={() => setParts(p => Math.max(2,p-1))} style={S.qBtn}>-</button>
                  <span style={{ fontSize:28, fontWeight:900 }}>{parts}</span>
                  <button onClick={() => setParts(p => p+1)} style={S.qBtn}>+</button>
                </div>
              </div>
              <div style={S.resultCard}>
                <div style={{ fontSize:12, color:'#6B7A8D', marginBottom:4 }}>Setiap orang bayar</div>
                <div style={{ fontSize:32, fontWeight:900, color:'#0A1628' }}>{fmt(perPart)}</div>
                <div style={{ fontSize:12, color:'#6B7A8D', marginTop:4 }}>{fmt(total)} ÷ {parts}</div>
              </div>
            </div>
          )}

          {/* By item */}
          {mode === 'by-item' && (
            <div>
              <div style={{ fontSize:12, color:'#6B7A8D', marginBottom:10 }}>Pilih item untuk split ini:</div>
              {cart.map(i => (
                <div key={i._key} onClick={() => toggleItem(i._key)}
                  style={{ ...S.itemRow, background: checked[i._key] ? '#EFF6FF' : 'white', borderColor: checked[i._key] ? '#3B82F6' : '#E2E8F0' }}>
                  <div style={{ width:18, height:18, borderRadius:4, border:'2px solid', borderColor: checked[i._key]?'#3B82F6':'#CBD5E1', background: checked[i._key]?'#3B82F6':'white', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {checked[i._key] && <span style={{ color:'white', fontSize:12, fontWeight:900 }}>✓</span>}
                  </div>
                  <div style={{ flex:1, fontSize:13, fontWeight:600 }}>{i.name} {i.qty > 1 ? '×'+i.qty : ''}</div>
                  <div style={{ fontWeight:700, fontSize:13 }}>{fmt((i.price-(i.itemDisc||0))*i.qty)}</div>
                </div>
              ))}
              {Object.values(checked).some(Boolean) && (
                <div style={S.resultCard}>
                  <div style={{ fontSize:12, color:'#6B7A8D', marginBottom:4 }}>Total item terpilih</div>
                  <div style={{ fontSize:24, fontWeight:900, color:'#0A1628' }}>
                    {fmt(cart.filter(i=>checked[i._key]).reduce((a,i)=>a+(i.price-(i.itemDisc||0))*i.qty,0))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* By amount */}
          {mode === 'by-amount' && (
            <div>
              <div style={{ fontSize:12, color:'#6B7A8D', marginBottom:8 }}>Total bill: <b>{fmt(total)}</b></div>
              <input type="number" value={amount} onChange={e=>setAmount(e.target.value)}
                placeholder="Jumlah yang dibayar (Rp)"
                style={S.input} autoFocus />
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                {[Math.ceil(total/2), Math.ceil(total/3), Math.ceil(total/4)].map((a,i) => (
                  <button key={i} onClick={() => setAmount(String(a))} style={S.quickBtn}>
                    1/{i+2} = {fmt(a)}
                  </button>
                ))}
              </div>
              {amount > 0 && (
                <div style={S.resultCard}>
                  <div style={{ fontSize:12, color:'#6B7A8D', marginBottom:4 }}>Sisa setelah ini</div>
                  <div style={{ fontSize:24, fontWeight:900, color:'#DC2626' }}>{fmt(Math.max(0, total - parseFloat(amount)))}</div>
                </div>
              )}
            </div>
          )}

          <div style={{ display:'flex', gap:8, marginTop:20 }}>
            <button onClick={onClose} style={S.cancelBtn}>Batal</button>
            <button onClick={handleCharge} style={S.chargeBtn}>Charge Split</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay:    { position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:1000 },
  modal:      { background:'white', borderRadius:20, width:'100%', maxWidth:420, maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 60px rgba(9,30,66,0.3)' },
  hd:         { padding:'16px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' },
  close:      { width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'none', cursor:'pointer' },
  modeBtn:    { flex:1, padding:'8px 0', borderRadius:10, border:'1.5px solid #E2E8F0', background:'white', fontSize:12, fontWeight:600, cursor:'pointer', color:'#6B7A8D' },
  modeActive: { background:'#0A1628', borderColor:'#0A1628', color:'white' },
  qBtn:       { width:40, height:40, borderRadius:12, border:'1.5px solid #E2E8F0', background:'white', fontSize:20, fontWeight:700, cursor:'pointer' },
  resultCard: { background:'#F8FAFC', borderRadius:12, padding:16, textAlign:'center', marginTop:16 },
  itemRow:    { display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, border:'1.5px solid', marginBottom:8, cursor:'pointer' },
  input:      { width:'100%', padding:'11px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:10 },
  quickBtn:   { padding:'5px 10px', borderRadius:8, border:'1.5px solid #E2E8F0', background:'white', fontSize:11, cursor:'pointer', fontWeight:600 },
  cancelBtn:  { flex:1, padding:12, background:'#F1F5F9', border:'none', borderRadius:10, fontWeight:700, cursor:'pointer' },
  chargeBtn:  { flex:2, padding:12, background:'#0A1628', color:'white', border:'none', borderRadius:10, fontWeight:700, cursor:'pointer' },
}
