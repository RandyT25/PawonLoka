import { fmt } from '../../shared/constants'

export default function HoldRecall({ held, onRecall, onDelete, onClose }) {
  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.hd}>
          <span style={{ fontSize:15, fontWeight:800 }}>Held Bills ({held.length})</span>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={{ padding:'12px 16px' }}>
          {held.length === 0
            ? <div style={{ textAlign:'center', padding:32, color:'#94A3B8', fontSize:14 }}>No held bills</div>
            : held.map((bill, idx) => {
              const total = bill.cart.reduce((a, i) => a + i.price * i.qty, 0)
              return (
                <div key={idx} style={S.bill}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'#0A1628' }}>
                      {bill.label || `Bill ${idx + 1}`}
                      {bill.tableNo ? ` · Table ${bill.tableNo}` : ''}
                    </div>
                    <div style={{ fontSize:12, color:'#6B7A8D', marginTop:2 }}>
                      {bill.cart.length} items · {fmt(total)}
                    </div>
                    <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>
                      {bill.cart.map(i => i.name).join(', ')}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    <button onClick={() => onRecall(idx)} style={S.recallBtn}>Recall</button>
                    <button onClick={() => onDelete(idx)} style={S.deleteBtn}>Delete</button>
                  </div>
                </div>
              )
            })
          }
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay:   { position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:1000 },
  modal:     { background:'white', borderRadius:20, width:'100%', maxWidth:440, maxHeight:'85vh', overflow:'auto', boxShadow:'0 20px 60px rgba(9,30,66,0.3)' },
  hd:        { padding:'16px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' },
  closeBtn:  { width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'none', cursor:'pointer', fontSize:14 },
  bill:      { display:'flex', alignItems:'center', gap:12, padding:'12px 14px', border:'1.5px solid #E2E8F0', borderRadius:12, marginBottom:10 },
  recallBtn: { padding:'6px 14px', borderRadius:8, border:'none', background:'#0A1628', color:'white', fontSize:12, fontWeight:700, cursor:'pointer' },
  deleteBtn: { padding:'6px 14px', borderRadius:8, border:'1.5px solid #FEE2E2', background:'#FEF2F2', color:'#EF4444', fontSize:12, fontWeight:700, cursor:'pointer' },
}
