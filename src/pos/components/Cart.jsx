import { useState } from 'react'
import { fmt, TAX_RATE } from '../../shared/constants'

export default function Cart({
  cart, onUpdateQty, onClear, onSendOrder, onCharge, onNewOrder,
  tableNo, onTableNoChange, customer, onShowCustomer, onRemoveCustomer,
  discount, onDiscountChange, orderType, onOrderTypeChange,
  openBillId, onManagerRemoveItem, onSplit, deliveryFee, onDeliveryFeeChange,
  deliveryAddr, onDeliveryAddrChange
}) {
  const [itemDisc, setItemDisc]   = useState(null) // {key, type, value}
  const [itemNote, setItemNote]   = useState(null) // key
  const [noteText, setNoteText]   = useState('')
  const [showDisc, setShowDisc]   = useState(false)
  const [orderNote, setOrderNote] = useState('')
  const [showNote, setShowNote]   = useState(false)

  const subtotal  = cart.reduce((a, i) => a + (i.price - (i.itemDisc||0)) * i.qty, 0)
  const fee       = (orderType==='Takeaway'||orderType==='Delivery') ? (parseFloat(deliveryFee)||0) : 0
  const discAmt   = discount ? Math.round(subtotal * discount / 100) : 0
  const discSub   = subtotal - discAmt
  const tax       = Math.round(discSub * TAX_RATE)
  const total     = discSub + tax + fee
  const newItems  = cart.filter(i => !i._sent)

  function applyItemDisc() {
    if (!itemDisc) return
    const { key, type, raw } = itemDisc
    const item = cart.find(i => i._key === key)
    if (!item) return
    const disc = type === 'pct' ? Math.round(item.price * raw / 100) : parseInt(raw) || 0
    onUpdateQty(key, 0, { itemDisc: disc, itemDiscLabel: type==='pct' ? raw+'%' : 'Rp '+fmt(disc) })
    setItemDisc(null)
  }

  function applyNote(key) {
    onUpdateQty(key, 0, { note: noteText })
    setItemNote(null)
    setNoteText('')
  }

  return (
    <div style={S.cart}>
      {/* Order Type */}
      <div style={S.typeRow}>
        {['Dine-in','Takeaway','Delivery'].map(t => (
          <button key={t} onClick={() => onOrderTypeChange(t)}
            style={{ ...S.typeBtn, ...(orderType===t ? S.typeActive : {}) }}>
            {t}
          </button>
        ))}
      </div>

      {/* Customer row */}
      <div style={{ display:'flex', gap:6, padding:'8px 12px', borderBottom:'1px solid #E2E8F0', alignItems:'center' }}>
        {tableNo && (
          <div style={{ fontSize:12, fontWeight:700, color:'#0A1628', background:'#F1F5F9', padding:'5px 10px', borderRadius:8, whiteSpace:'nowrap' }}>
            {tableNo}
          </div>
        )}
        <button onClick={onShowCustomer} style={{ ...S.custBtn, flex:1 }}>
          {customer ? customer.name : '+ Customer'}
          {customer && <span onClick={e=>{e.stopPropagation();onRemoveCustomer()}} style={{ marginLeft:4, color:'#EF4444' }}>x</span>}
        </button>
      </div>

      {/* Delivery fee bar */}
      {(orderType==='Takeaway'||orderType==='Delivery') && (
        <div style={{ display:'flex', gap:6, padding:'6px 12px', background:'#FFFBEB', borderBottom:'1px solid #FDE68A', alignItems:'center' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#B45309', whiteSpace:'nowrap' }}>
            {orderType==='Delivery' ? 'Delivery Fee:' : 'Takeaway Fee:'}
          </span>
          <input type="number" value={deliveryFee} onChange={e => onDeliveryFeeChange(e.target.value)}
            placeholder="0" style={{ ...S.tableInput, width:90 }} />
          <input value={deliveryAddr} onChange={e => onDeliveryAddrChange(e.target.value)}
            placeholder="Address / notes..." style={{ ...S.tableInput, flex:1 }} />
        </div>
      )}

      {/* Open Bill badge */}
      {openBillId && (
        <div style={{ padding:'4px 12px', background:'#FFFBEB', borderBottom:'1px solid #FDE68A', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#B45309' }}>OPEN BILL · {openBillId}</span>
          <button onClick={onNewOrder} style={{ fontSize:11, color:'#2563EB', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>+ New Order</button>
        </div>
      )}

      {/* Items */}
      <div style={S.items}>
        {cart.length === 0
          ? <div style={S.empty}>Tap items to add</div>
          : cart.map(item => (
            <div key={item._key} style={{ ...S.item, opacity: item._sent ? 0.85 : 1 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <span style={{ fontWeight:700, fontSize:13, color:'#0A1628' }}>{item.name}</span>
                  <span style={{ fontWeight:700, fontSize:13, flexShrink:0, marginLeft:8 }}>
                    {fmt((item.price-(item.itemDisc||0)) * item.qty)}
                  </span>
                </div>
                {item.modifiers && Object.keys(item.modifiers).length > 0 && (
                  <div style={{ fontSize:11, color:'#6B7A8D' }}>{Object.values(item.modifiers).join(', ')}</div>
                )}
                {item.note && <div style={{ fontSize:11, color:'#F59E0B' }}>Note: {item.note}</div>}
                {item.itemDisc > 0 && <div style={{ fontSize:11, color:'#10B981' }}>Disc: -{fmt(item.itemDisc)} per item</div>}
                {item._sent && <div style={{ fontSize:10, color:'#10B981', fontWeight:600 }}>Sent · {item._station||''}</div>}

                {/* Action buttons + qty on same row */}
                <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:6, flexWrap:'wrap' }}>
                  <button onClick={() => { setItemNote(item._key); setNoteText(item.note||'') }}
                    style={S.miniBtn}>Note</button>
                  <button onClick={() => setItemDisc({ key:item._key, type:'pct', raw:'' })}
                    style={S.miniBtn}>Disc</button>
                  {item._sent && openBillId
                    ? <button onClick={() => onManagerRemoveItem && onManagerRemoveItem(item)}
                        style={{ ...S.miniBtn, color:'#DC2626', borderColor:'#DC2626' }}>Remove</button>
                    : <button onClick={() => onUpdateQty(item._key, -item.qty)}
                        style={{ ...S.miniBtn, color:'#DC2626', borderColor:'#DC2626' }}>Remove</button>
                  }
                  <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:4 }}>
                    <button onClick={() => openBillId && item._sent
                      ? onManagerRemoveItem && onManagerRemoveItem(item)
                      : onUpdateQty(item._key, -1)}
                      style={{ ...S.qtyBtn, width:28, height:28 }}>-</button>
                    <span style={{ ...S.qtyNum, minWidth:22, textAlign:'center', fontWeight:800 }}>{item.qty}</span>
                    <button onClick={() => onUpdateQty(item._key, +1)}
                      style={{ ...S.qtyBtn, width:28, height:28 }}>+</button>
                  </div>
                </div>

                {/* Note input inline */}
                {itemNote === item._key && (
                  <div style={{ display:'flex', gap:4, marginTop:4 }}>
                    <input autoFocus value={noteText} onChange={e=>setNoteText(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&applyNote(item._key)}
                      placeholder="Add note..." style={{ ...S.tableInput, flex:1, fontSize:12, padding:'4px 8px' }} />
                    <button onClick={()=>applyNote(item._key)} style={S.miniBtn}>OK</button>
                    <button onClick={()=>setItemNote(null)} style={S.miniBtn}>x</button>
                  </div>
                )}

                {/* Item discount input inline */}
                {itemDisc?.key === item._key && (
                  <div style={{ marginTop:4 }}>
                    <div style={{ display:'flex', gap:4, marginBottom:4 }}>
                      <button onClick={()=>setItemDisc({...itemDisc,type:'pct'})}
                        style={{ ...S.miniBtn, ...(itemDisc.type==='pct'?{background:'#0A1628',color:'white'}:{}) }}>%</button>
                      <button onClick={()=>setItemDisc({...itemDisc,type:'amt'})}
                        style={{ ...S.miniBtn, ...(itemDisc.type==='amt'?{background:'#0A1628',color:'white'}:{}) }}>Rp</button>
                    </div>
                    <div style={{ display:'flex', gap:4 }}>
                      <input autoFocus type="number" value={itemDisc.raw}
                        onChange={e=>setItemDisc({...itemDisc,raw:e.target.value})}
                        onKeyDown={e=>e.key==='Enter'&&applyItemDisc()}
                        placeholder={itemDisc.type==='pct'?'e.g. 10':'e.g. 5000'}
                        style={{ ...S.tableInput, flex:1, fontSize:12, padding:'4px 8px' }} />
                      <button onClick={applyItemDisc} style={S.miniBtn}>OK</button>
                      <button onClick={()=>setItemDisc(null)} style={S.miniBtn}>x</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Qty controls */}
            </div>
          ))
        }
      </div>

      {/* Footer */}
      {cart.length > 0 && (
        <div style={S.ft}>
          <div style={S.row}><span style={S.lbl}>Subtotal</span><span>{fmt(subtotal)}</span></div>
          {discAmt > 0 && <div style={S.row}><span style={{ ...S.lbl, color:'#10B981' }}>Diskon ({discount}%)</span><span style={{ color:'#10B981' }}>-{fmt(discAmt)}</span></div>}
          <div style={S.row}><span style={S.lbl}>Tax (10%)</span><span>{fmt(tax)}</span></div>
          {fee > 0 && <div style={S.row}><span style={S.lbl}>{orderType} Fee</span><span>{fmt(fee)}</span></div>}
          <div style={{ ...S.row, fontWeight:900, fontSize:16, marginTop:6, paddingTop:6, borderTop:'2px solid #E2E8F0' }}>
            <span>Total</span><span>{fmt(total)}</span>
          </div>

          {/* Order-level discount */}
          <div style={{ marginTop:8 }}>
            <button onClick={() => setShowDisc(!showDisc)}
              style={{ ...S.miniBtn, marginBottom: showDisc?6:0, background: discount>0?'#ECFDF5':'white', color: discount>0?'#059669':'#6B7A8D' }}>
              Order Discount {discount > 0 ? discount+'%' : ''}
            </button>
            {showDisc && (
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {[0,5,10,15,20,25,30].map(d => (
                  <button key={d} onClick={() => { onDiscountChange(d); setShowDisc(false) }}
                    style={{ ...S.miniBtn, ...(discount===d?{background:'#0A1628',color:'white',borderColor:'#0A1628'}:{}) }}>
                    {d===0?'None':d+'%'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Send Order */}
          {newItems.length > 0 && (
            <button onClick={() => onSendOrder({ subtotal, tax, discAmt, total, fee, orderNote })} style={S.sendBtn}>
              Send Order {newItems.length > 0 ? '('+newItems.length+' new)' : ''}
            </button>
          )}

          {/* Charge button */}
          {openBillId && (
            <button onClick={() => onCharge({ subtotal, tax, discAmt, total, fee, orderNote })} style={S.chargeBtn}>
              Charge & Pay — {fmt(total)}
            </button>
          )}

          {/* New order shortcut when open bill exists */}
          {!openBillId && newItems.length === 0 && (
            <button onClick={onNewOrder} style={{ ...S.sendBtn, background:'#6366F1' }}>
              + New Order
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const S = {
  cart:       { width:340, background:'white', borderLeft:'1px solid #E2E8F0', display:'flex', flexDirection:'column', flexShrink:0, height:'100%' },
  typeRow:    { display:'flex', borderBottom:'1px solid #E2E8F0', flexShrink:0 },
  typeBtn:    { flex:1, padding:'9px 0', border:'none', background:'none', fontSize:12, fontWeight:600, cursor:'pointer', color:'#6B7A8D', borderBottom:'2px solid transparent' },
  typeActive: { color:'#0A1628', borderBottom:'2px solid #0A1628', fontWeight:800 },
  tableInput: { flex:1, padding:'6px 10px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:12, outline:'none' },
  custBtn:    { padding:'6px 10px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', background:'white', whiteSpace:'nowrap' },
  items:      { flex:1, overflowY:'auto' },
  empty:      { padding:40, textAlign:'center', color:'#94A3B8', fontSize:13 },
  item:       { padding:'10px 12px', borderBottom:'1px solid #F1F5F9', display:'flex', gap:8, alignItems:'flex-start' },
  qtyRow:     { display:'flex', flexDirection:'column', alignItems:'center', gap:3, flexShrink:0 },
  qtyBtn:     { width:26, height:26, borderRadius:6, border:'1.5px solid #E2E8F0', background:'white', fontSize:14, cursor:'pointer', fontWeight:700 },
  qtyNum:     { fontSize:13, fontWeight:700, minWidth:18, textAlign:'center' },
  miniBtn:    { padding:'3px 8px', border:'1.5px solid #E2E8F0', borderRadius:6, background:'white', fontSize:11, fontWeight:600, cursor:'pointer', color:'#6B7A8D' },
  ft:         { padding:12, borderTop:'2px solid #E2E8F0', flexShrink:0 },
  row:        { display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 },
  lbl:        { color:'#6B7A8D' },
  sendBtn:    { width:'100%', padding:12, background:'#0A1628', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:800, cursor:'pointer', marginTop:8 },
  chargeBtn:  { width:'100%', padding:12, background:'#10B981', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:800, cursor:'pointer', marginTop:6 },
}
