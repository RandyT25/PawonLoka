import { useState } from 'react'
import { fmt } from '../../shared/constants'

export default function CustomItemModal({ onAdd, onClose }) {
  const [name, setName]   = useState('')
  const [price, setPrice] = useState('')
  const [qty, setQty]     = useState(1)

  function handleAdd() {
    if (!name.trim() || !price) return
    onAdd({
      sku:  'CUSTOM-' + Date.now(),
      name: name.trim(),
      price: parseInt(price),
      qty,
      cat: 'Custom',
      modifiers: {},
      note: '',
      itemDisc: 0,
    })
    onClose()
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.hd}>
          <span style={{ fontWeight:800, fontSize:15 }}>+ Custom Item</span>
          <button onClick={onClose} style={S.close}>x</button>
        </div>
        <div style={{ padding:20 }}>
          <div style={S.label}>Item Name *</div>
          <input autoFocus value={name} onChange={e=>setName(e.target.value)}
            placeholder="e.g. Nasi Tambah"
            style={S.input} />

          <div style={S.label}>Price (Rp) *</div>
          <input type="number" value={price} onChange={e=>setPrice(e.target.value)}
            placeholder="e.g. 5000"
            style={S.input} />

          <div style={S.label}>Quantity</div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
            <button onClick={()=>setQty(q=>Math.max(1,q-1))} style={S.qBtn}>-</button>
            <span style={{ fontWeight:800, fontSize:18, minWidth:30, textAlign:'center' }}>{qty}</span>
            <button onClick={()=>setQty(q=>q+1)} style={S.qBtn}>+</button>
            {price && <span style={{ color:'#6B7A8D', fontSize:13 }}>= {fmt(parseInt(price||0)*qty)}</span>}
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={S.cancelBtn}>Cancel</button>
            <button onClick={handleAdd} disabled={!name.trim()||!price}
              style={{ ...S.addBtn, opacity:!name.trim()||!price?0.4:1 }}>
              Add to Order
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay:   { position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:1000 },
  modal:     { background:'white', borderRadius:20, width:'100%', maxWidth:380, boxShadow:'0 20px 60px rgba(9,30,66,0.3)' },
  hd:        { padding:'16px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' },
  close:     { width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'none', cursor:'pointer' },
  label:     { fontSize:11, fontWeight:800, color:'#6B7A8D', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6, marginTop:14 },
  input:     { width:'100%', padding:'11px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:14, outline:'none', boxSizing:'border-box' },
  qBtn:      { width:36, height:36, borderRadius:10, border:'1.5px solid #E2E8F0', background:'white', fontSize:18, fontWeight:700, cursor:'pointer' },
  cancelBtn: { flex:1, padding:12, background:'#F1F5F9', border:'none', borderRadius:10, fontWeight:700, cursor:'pointer' },
  addBtn:    { flex:2, padding:12, background:'#0A1628', color:'white', border:'none', borderRadius:10, fontWeight:700, cursor:'pointer' },
}
