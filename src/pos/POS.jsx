import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const fmt = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID')
const STAFF = [
  { id:1, name:'Claudy', role:'Owner',      pin:'7777', color:'#6366F1' },
  { id:2, name:'Nita',   role:'Head Kasir', pin:'4444', color:'#F59E0B' },
  { id:3, name:'Aisyah', role:'Bar',        pin:'1111', color:'#10B981' },
  { id:4, name:'Mahes',  role:'Cook',       pin:'2222', color:'#3B82F6' },
  { id:5, name:'Meldy',  role:'Head Cook',  pin:'3333', color:'#8B5CF6' },
  { id:6, name:'Oji',    role:'Cook',       pin:'5555', color:'#EF4444' },
  { id:7, name:'Yudi',   role:'Cook',       pin:'6666', color:'#06B6D4' },
]
const PAY_METHODS = ['Cash', 'QRIS', 'Transfer', 'Debit', 'GoFood', 'GrabFood', 'ShopeeFood']

export default function POS() {
  const [staff, setStaff]           = useState(null)
  const [products, setProducts]     = useState([])
  const [categories, setCategories] = useState([])
  const [cart, setCart]             = useState([])
  const [activeTab, setActiveTab]   = useState('All')
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [showCharge, setShowCharge] = useState(false)
  const [payMethod, setPayMethod]   = useState('Cash')
  const [cashGiven, setCashGiven]   = useState('')
  const [orderDone, setOrderDone]   = useState(null)
  const [tableNo, setTableNo]       = useState('')

  useEffect(() => { if (staff) loadData() }, [staff])

  async function loadData() {
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase.from('products').select('*').eq('active', true),
      supabase.from('categories').select('*').order('sort')
    ])
    setProducts(prods || [])
    setCategories(cats || [])
    setLoading(false)
  }

  if (!staff) return <PinLogin onLogin={setStaff} />

  const filtered = products.filter(p => {
    const matchTab = activeTab === 'All' || p.cat === activeTab
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    return matchTab && matchSearch
  })

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(i => i.sku === product.sku)
      if (existing) return prev.map(i => i.sku === product.sku ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { ...product, qty: 1 }]
    })
  }

  function updateQty(sku, delta) {
    setCart(prev => {
      const item = prev.find(i => i.sku === sku)
      if (!item) return prev
      if (item.qty + delta <= 0) return prev.filter(i => i.sku !== sku)
      return prev.map(i => i.sku === sku ? { ...i, qty: i.qty + delta } : i)
    })
  }

  const subtotal = cart.reduce((a, i) => a + i.price * i.qty, 0)
  const tax      = Math.round(subtotal * 0.1)
  const total    = subtotal + tax
  const change   = payMethod === 'Cash' ? (parseInt(cashGiven) || 0) - total : 0

  async function handleCharge() {
    const order = {
      id:       'ORD-' + Date.now(),
      items:    cart.map(i => ({ sku: i.sku, name: i.name, qty: i.qty, price: i.price })),
      subtotal, tax, total,
      pay:      payMethod,
      staff:    staff.name,
      table:    tableNo || null,
      status:   'Paid',
      date:     new Date().toISOString().slice(0, 10),
      time:     new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      cogs:     0,
    }
    await supabase.from('orders').insert(order)
    setOrderDone(order)
    setCart([])
    setShowCharge(false)
    setCashGiven('')
    setTableNo('')
  }

  if (loading) return (
    <div style={S.center}>
      <div style={{ fontSize: 40 }}>🏠</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#0A1628', marginTop: 8 }}>Loading menu...</div>
    </div>
  )

  return (
    <div style={S.app}>
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: 'white' }}>🏠 PawonLoka</span>
          <span style={S.badge}>{staff.name} · {staff.role}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={tableNo} onChange={e => setTableNo(e.target.value)} placeholder="Table #" style={S.tableInput} />
          <button onClick={() => setStaff(null)} style={S.logoutBtn}>Logout</button>
        </div>
      </div>

      <div style={S.body}>
        <div style={S.menu}>
          <input style={S.search} placeholder="🔍 Search menu..." value={search} onChange={e => setSearch(e.target.value)} />
          <div style={S.tabs}>
            {['All', ...categories.map(c => c.name)].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{ ...S.tab, ...(activeTab === tab ? S.tabActive : {}) }}>{tab}</button>
            ))}
          </div>
          <div style={S.grid}>
            {filtered.map(p => (
              <button key={p.sku} onClick={() => addToCart(p)} style={S.card}>
                <div style={{ fontSize: 28 }}>{p.icon || '🍽️'}</div>
                <div style={S.cardName}>{p.name}</div>
                <div style={S.cardPrice}>{fmt(p.price)}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={S.cart}>
          <div style={S.cartHd}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>Order {tableNo ? `· Table ${tableNo}` : ''}</span>
            {cart.length > 0 && <button onClick={() => setCart([])} style={S.clearBtn}>Clear</button>}
          </div>
          <div style={S.cartItems}>
            {cart.length === 0
              ? <div style={S.empty}>Tap items to add</div>
              : cart.map(item => (
                <div key={item.sku} style={S.cartItem}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: '#3B82F6', fontWeight: 700, marginTop: 2 }}>
                      {fmt(item.price)} × {item.qty} = {fmt(item.price * item.qty)}
                    </div>
                  </div>
                  <div style={S.qtyRow}>
                    <button onClick={() => updateQty(item.sku, -1)} style={S.qtyBtn}>−</button>
                    <span style={S.qtyNum}>{item.qty}</span>
                    <button onClick={() => updateQty(item.sku, +1)} style={S.qtyBtn}>+</button>
                  </div>
                </div>
              ))
            }
          </div>
          {cart.length > 0 && (
            <div style={S.cartFt}>
              <div style={S.totRow}><span style={{ color: '#6B7A8D', fontSize: 13 }}>Subtotal</span><span style={{ fontWeight: 600 }}>{fmt(subtotal)}</span></div>
              <div style={S.totRow}><span style={{ color: '#6B7A8D', fontSize: 13 }}>Tax (10%)</span><span style={{ fontWeight: 600 }}>{fmt(tax)}</span></div>
              <div style={{ ...S.totRow, marginTop: 8, paddingTop: 8, borderTop: '2px solid #E2E8F0' }}>
                <span style={{ fontSize: 16, fontWeight: 800 }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 900 }}>{fmt(total)}</span>
              </div>
              <button onClick={() => setShowCharge(true)} style={S.chargeBtn}>Charge {fmt(total)}</button>
            </div>
          )}
        </div>
      </div>

      {showCharge && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={S.modalHd}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>Charge Payment</span>
              <button onClick={() => setShowCharge(false)} style={S.closeBtn}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={S.summary}>
                {cart.map(i => (
                  <div key={i.sku} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span>{i.name} × {i.qty}</span><span style={{ fontWeight: 600 }}>{fmt(i.price * i.qty)}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid #E2E8F0', marginTop: 8, paddingTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7A8D', marginBottom: 4 }}>
                    <span>Tax (10%)</span><span>{fmt(tax)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 18 }}>
                    <span>Total</span><span>{fmt(total)}</span>
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={S.label}>Payment Method</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PAY_METHODS.map(m => (
                    <button key={m} onClick={() => setPayMethod(m)} style={{ ...S.payBtn, ...(payMethod === m ? S.payBtnActive : {}) }}>{m}</button>
                  ))}
                </div>
              </div>
              {payMethod === 'Cash' && (
                <div style={{ marginBottom: 16 }}>
                  <div style={S.label}>Cash Given</div>
                  <input type="number" value={cashGiven} onChange={e => setCashGiven(e.target.value)} placeholder="Enter amount" style={S.input} autoFocus />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {[total, Math.ceil(total/10000)*10000, Math.ceil(total/50000)*50000, 100000].filter((v,i,a)=>a.indexOf(v)===i).map(amt => (
                      <button key={amt} onClick={() => setCashGiven(String(amt))} style={S.quickBtn}>{fmt(amt)}</button>
                    ))}
                  </div>
                  {cashGiven && (
                    <div style={{ marginTop: 12, padding: 12, background: change >= 0 ? '#F0FDF4' : '#FFF1F2', borderRadius: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, color: change >= 0 ? '#16A34A' : '#DC2626' }}>
                        <span>Change</span><span>{fmt(Math.abs(change))}{change < 0 ? ' (short)' : ''}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <button onClick={handleCharge} disabled={payMethod === 'Cash' && (!cashGiven || change < 0)}
                style={{ ...S.chargeBtn, opacity: payMethod === 'Cash' && (!cashGiven || change < 0) ? 0.4 : 1 }}>
                ✓ Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {orderDone && (
        <div style={S.overlay}>
          <div style={{ ...S.modal, maxWidth: 380 }}>
            <div style={{ textAlign: 'center', padding: '24px 20px 0' }}>
              <div style={{ fontSize: 48 }}>✅</div>
              <div style={{ fontSize: 20, fontWeight: 900, marginTop: 8 }}>Payment Received!</div>
              <div style={{ fontSize: 13, color: '#6B7A8D', marginTop: 4 }}>Order {orderDone.id}</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={S.summary}>
                {orderDone.items.map(i => (
                  <div key={i.sku} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>{i.name} × {i.qty}</span><span>{fmt(i.price * i.qty)}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid #E2E8F0', marginTop: 8, paddingTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7A8D', marginBottom: 4 }}>
                    <span>Tax</span><span>{fmt(orderDone.tax)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 16 }}>
                    <span>Total</span><span>{fmt(orderDone.total)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6B7A8D', marginTop: 4 }}>
                    <span>Payment</span><span style={{ fontWeight: 600 }}>{orderDone.pay}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setOrderDone(null)} style={S.chargeBtn}>New Order</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PinLogin({ onLogin }) {
  const [pin, setPin]     = useState('')
  const [error, setError] = useState('')

  function handlePin(digit) {
    if (pin.length >= 4) return
    const newPin = pin + digit
    setPin(newPin)
    if (newPin.length === 4) {
      const found = STAFF.find(s => s.pin === newPin)
      if (found) { onLogin(found); setPin('') }
      else { setError('Wrong PIN'); setTimeout(() => { setPin(''); setError('') }, 1000) }
    }
  }

  return (
    <div style={S.loginWrap}>
      <div style={S.loginCard}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>🏠</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#0A1628', marginBottom: 4 }}>PawonLoka</div>
        <div style={{ fontSize: 14, color: '#6B7A8D', marginBottom: 24 }}>Enter your PIN</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width:14, height:14, borderRadius:'50%', background: pin.length > i ? '#0A1628' : 'white', border: '2px solid ' + (pin.length > i ? '#0A1628' : '#CBD5E1'), transition:'all 0.1s' }} />
          ))}
        </div>
        {error && <div style={{ color:'#EF4444', fontSize:13, fontWeight:600, marginBottom:8 }}>{error}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d,i) => (
            <button key={i} style={{ ...S.numKey, visibility: d==='' ? 'hidden' : 'visible' }}
              onClick={() => d==='⌫' ? setPin(p => p.slice(0,-1)) : handlePin(d)}>{d}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

const S = {
  app:         { display:'flex', flexDirection:'column', height:'100vh', background:'#F4F7FA', fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif' },
  center:      { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F4F7FA' },
  header:      { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', background:'#0A1628', flexShrink:0 },
  badge:       { fontSize:12, background:'rgba(255,255,255,0.15)', color:'white', padding:'4px 10px', borderRadius:20 },
  tableInput:  { padding:'7px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.1)', color:'white', fontSize:13, width:80, outline:'none' },
  logoutBtn:   { fontSize:12, background:'rgba(255,255,255,0.1)', color:'white', border:'1px solid rgba(255,255,255,0.2)', padding:'7px 14px', borderRadius:8, cursor:'pointer' },
  body:        { display:'flex', flex:1, overflow:'hidden' },
  menu:        { flex:1, display:'flex', flexDirection:'column', overflow:'hidden', padding:16, gap:10 },
  search:      { padding:'10px 14px', borderRadius:12, border:'1.5px solid #E2E8F0', fontSize:14, outline:'none', background:'white', flexShrink:0 },
  tabs:        { display:'flex', gap:6, overflowX:'auto', flexShrink:0, paddingBottom:2 },
  tab:         { padding:'7px 16px', borderRadius:20, border:'1.5px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', color:'#6B7A8D', flexShrink:0 },
  tabActive:   { background:'#0A1628', borderColor:'#0A1628', color:'white' },
  grid:        { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10, overflowY:'auto', flex:1 },
  card:        { background:'white', border:'1.5px solid #E2E8F0', borderRadius:14, padding:14, cursor:'pointer', textAlign:'center', display:'flex', flexDirection:'column', gap:6, outline:'none' },
  cardName:    { fontSize:13, fontWeight:700, color:'#0A1628', lineHeight:1.3 },
  cardPrice:   { fontSize:12, fontWeight:700, color:'#3B82F6' },
  cart:        { width:320, background:'white', borderLeft:'1px solid #E2E8F0', display:'flex', flexDirection:'column', flexShrink:0 },
  cartHd:      { padding:'16px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 },
  clearBtn:    { fontSize:12, color:'#EF4444', background:'#FEF2F2', border:'none', padding:'4px 10px', borderRadius:8, cursor:'pointer', fontWeight:600 },
  cartItems:   { flex:1, overflowY:'auto' },
  empty:       { padding:40, textAlign:'center', color:'#94A3B8', fontSize:14 },
  cartItem:    { padding:'10px 20px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', gap:12 },
  qtyRow:      { display:'flex', alignItems:'center', gap:8, flexShrink:0 },
  qtyBtn:      { width:28, height:28, borderRadius:8, border:'1.5px solid #E2E8F0', background:'white', fontSize:16, cursor:'pointer', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' },
  qtyNum:      { fontSize:14, fontWeight:700, minWidth:20, textAlign:'center' },
  cartFt:      { padding:20, borderTop:'2px solid #E2E8F0', flexShrink:0 },
  totRow:      { display:'flex', justifyContent:'space-between', marginBottom:6 },
  chargeBtn:   { width:'100%', padding:16, background:'#0A1628', color:'white', border:'none', borderRadius:14, fontSize:15, fontWeight:800, cursor:'pointer', marginTop:12 },
  overlay:     { position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:1000 },
  modal:       { background:'white', borderRadius:20, width:'100%', maxWidth:480, maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 60px rgba(9,30,66,0.3)' },
  modalHd:     { padding:'16px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' },
  closeBtn:    { width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'none', cursor:'pointer', fontSize:14 },
  summary:     { background:'#F8FAFC', borderRadius:12, padding:14, marginBottom:16 },
  label:       { fontSize:12, fontWeight:700, color:'#6B7A8D', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 },
  payBtn:      { padding:'8px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, cursor:'pointer', color:'#6B7A8D' },
  payBtnActive:{ background:'#0A1628', borderColor:'#0A1628', color:'white' },
  input:       { width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:15, outline:'none', boxSizing:'border-box' },
  quickBtn:    { padding:'6px 12px', borderRadius:8, border:'1.5px solid #E2E8F0', background:'white', fontSize:12, cursor:'pointer', fontWeight:600 },
  loginWrap:   { display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'linear-gradient(135deg,#0A1628 0%,#1E3A5F 100%)' },
  loginCard:   { background:'white', borderRadius:24, padding:'32px 28px', width:300, textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,0.4)' },
  numKey:      { padding:16, borderRadius:14, border:'1.5px solid #E2E8F0', background:'white', fontSize:20, fontWeight:700, cursor:'pointer', color:'#0A1628', outline:'none' },
}
