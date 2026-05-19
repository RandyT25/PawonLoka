import { useState } from 'react'
import { MODIFIERS, fmt } from '../../shared/constants'

export default function ModifierModal({ product, onConfirm, onCancel }) {
  const [selected, setSelected] = useState({})
  const [note, setNote]         = useState('')

  function toggle(modId, option) {
    setSelected(prev => ({ ...prev, [modId]: option }))
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.hd}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#0A1628' }}>{product.name}</div>
            <div style={{ fontSize:13, color:'#3B82F6', fontWeight:700, marginTop:2 }}>{fmt(product.price)}</div>
          </div>
          <button onClick={onCancel} style={S.closeBtn}>✕</button>
        </div>

        <div style={{ padding:'16px 20px', overflowY:'auto', flex:1 }}>
          {MODIFIERS.map(mod => (
            <div key={mod.id} style={{ marginBottom:16 }}>
              <div style={S.modLabel}>{mod.name}</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {mod.options.map(opt => (
                  <button
                    key={opt}
                    onClick={() => toggle(mod.id, opt)}
                    style={{ ...S.optBtn, ...(selected[mod.id]===opt ? S.optActive : {}) }}
                  >{opt}</button>
                ))}
              </div>
            </div>
          ))}

          <div>
            <div style={S.modLabel}>Note / Special Request</div>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. no onion, extra spicy..."
              style={S.noteInput}
            />
          </div>
        </div>

        <div style={S.ft}>
          <button onClick={onCancel} style={S.cancelBtn}>Cancel</button>
          <button onClick={() => onConfirm(product, selected, note)} style={S.confirmBtn}>
            Add to Order
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay:    { position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 },
  modal:      { background:'white', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 -10px 40px rgba(9,30,66,0.2)' },
  hd:         { padding:'16px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'flex-start' },
  closeBtn:   { width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'none', cursor:'pointer', fontSize:14, flexShrink:0 },
  modLabel:   { fontSize:11, fontWeight:800, color:'#6B7A8D', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 },
  optBtn:     { padding:'7px 14px', borderRadius:20, border:'1.5px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, cursor:'pointer', color:'#6B7A8D' },
  optActive:  { background:'#0A1628', borderColor:'#0A1628', color:'white' },
  noteInput:  { width:'100%', padding:'10px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:13, outline:'none', boxSizing:'border-box' },
  ft:         { padding:'12px 20px', borderTop:'1px solid #E2E8F0', display:'flex', gap:10 },
  cancelBtn:  { flex:1, padding:14, borderRadius:12, border:'1.5px solid #E2E8F0', background:'white', fontSize:14, fontWeight:700, cursor:'pointer', color:'#6B7A8D' },
  confirmBtn: { flex:2, padding:14, borderRadius:12, border:'none', background:'#0A1628', color:'white', fontSize:14, fontWeight:800, cursor:'pointer' },
}
