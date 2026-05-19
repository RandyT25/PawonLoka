import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, TAX_RATE } from '../shared/constants'
import useCart from './hooks/useCart'
import useOrders from './hooks/useOrders'
import PinLogin from './components/PinLogin'
import MenuGrid from './components/MenuGrid'
import Cart from './components/Cart'
import ChargeModal from './components/ChargeModal'
import ModifierModal from './components/ModifierModal'
import CustomerSearch from './components/CustomerSearch'
import ShiftModal from './components/ShiftModal'
import VoidModal from './components/VoidModal'
import CustomItemModal from './components/CustomItemModal'
import PromoModal from './components/PromoModal'
import CashInOutModal from './components/CashInOutModal'
import SplitModal from './components/SplitModal'
import FloorPlan from './components/FloorPlan'
import TablePicker from './components/TablePicker'
import OrdersModal from './components/OrdersModal'
import PrinterSettings from './components/PrinterSettings'
import { usePrinter } from './hooks/usePrinter'
import { useWhatsApp } from './hooks/useWhatsApp'
import './pos.mobile.css'

export default function POS() {
  const [staff, setStaff]           = useState(null)
  const [shift, setShift]           = useState(null)
  const [products, setProducts]     = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading]       = useState(true)
  const [tableNo, setTableNo]       = useState('')
  const [customer, setCustomer]     = useState(null)
  const [discount, setDiscount]     = useState(0)
  const [orderType, setOrderType]     = useState('Dine-in')
  const [openBillId, setOpenBillId]   = useState(null)
  const [deliveryFee, setDeliveryFee]   = useState(0)
  const [deliveryAddr, setDeliveryAddr] = useState('')

  // Modals
  const [showShift, setShowShift]         = useState(false)
  const [showSettings, setShowSettings]   = useState(false)
  const [cartOpen, setCartOpen]           = useState(false)
  const printer    = usePrinter()
  const { sendReceipt, resendReceipt } = useWhatsApp()
  const [showCharge, setShowCharge]       = useState(false)
  const [showCustomer, setShowCustomer]   = useState(false)
  const [modifierItem, setModifierItem]   = useState(null)
  const [showReceipt, setShowReceipt]     = useState(false)
  const [showVoid, setShowVoid]           = useState(false)
  const [showOrders, setShowOrders]       = useState(false)
  const [showCustomItem, setShowCustomItem] = useState(false)
  const [showCashLog, setShowCashLog]       = useState(false)
  const [showPromo, setShowPromo]           = useState(false)
  const [appliedPromo, setAppliedPromo]     = useState(null)
  const [splitPaid, setSplitPaid]           = useState(0)
  const [showSplit, setShowSplit]           = useState(false)
  const [showFloorPlan, setShowFloorPlan]   = useState(false)
  const [showTablePicker, setShowTablePicker] = useState(false)
  const [splitTotals, setSplitTotals]       = useState(null)


  const { cart, setCart, addItem, updateQty, clearCart, subtotal } = useCart()
  const { saveOrder, lastOrder, setLastOrder, saving } = useOrders()

  useEffect(() => {
    if (staff) {
      loadData()
      restoreShift()
    }
  }, [staff])

  async function restoreShift() {
    const today = new Date().toISOString().slice(0, 10)
    // Close any stale open shifts from previous days
    await supabase.from('shifts')
      .update({ clock_out: 'auto-closed' })
      .eq('staff', staff.name)
      .is('clock_out', null)
      .is('clockOut', null)
      .is('clockOut', null)
      .neq('date', today)
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('staff', staff.name)
      .eq('date', today)
      .is('clock_out', null)
      .is('clockOut', null)
      .is('clockOut', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (data) {
      setShift(data)
      setShowShift(false)
    } else {
      setShowShift(true)
    }
  }

  async function loadData() {
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase.from('products').select('*').eq('active', true),
      supabase.from('categories').select('*').order('sort')
    ])
    setProducts(prods || [])
    setCategories(cats || [])
    setLoading(false)
  }

  // PIN Login
  if (!staff) return (
    <PinLogin onLogin={s => { setStaff(s) }} />
  )

  // Shift modal
  if (showShift) return (
    <ShiftModal
      staff={staff}
      shift={shift}
      onOpen={s => { setShift(s); setShowShift(false) }}
      onClose={() => { setShift(null); setShowShift(false) }}
      onLogout={() => { setStaff(null); setShift(null); setShowShift(false); clearCart(); setCustomer(null); setTableNo(''); setOpenBillId(null) }}
    />
  )

  const tax   = Math.round(subtotal * TAX_RATE)
  const total = subtotal + tax

  function handleProductSelect(product) {
    setModifierItem(product)
  }

  function handleModifierConfirm(product, modifiers, note) {
    addItem({ ...product, note }, modifiers)
    setModifierItem(null)
  }


  async function recallFromOrder(order) {
    setCart(order.items.map((i, idx) => ({ ...i, _key: i.sku + '-' + idx, modifiers: i.modifiers || {}, _sent: i._sent || true, _station: i._station || '' })))
    setTableNo(order.table || '')
    setOpenBillId(order.id)
    if (order.customer_id) {
      const { data: cust } = await supabase.from('customers').select('*').eq('id', order.customer_id).single()
      setCustomer(cust || (order.customer ? { name: order.customer, id: order.customer_id } : null))
    } else if (order.customer) {
      setCustomer({ name: order.customer, id: null })
    } else {
      setCustomer(null)
    }
  }

  function deleteBill(idx) {
    setHeldBills(prev => prev.filter((_, i) => i !== idx))
  }

  function handleSplitCharge(amount, label) {
    setShowSplit(false)
    setShowCharge(true)
    setSplitTotals({ ...splitTotals, total: amount, splitLabel: label })
  }

  function handleTableSelect(table) {
    if (table.status === 'Reserved') return
    if (table.status === 'Occupied' && table.open_bill_id) {
      supabase.from('orders').select('*').eq('id', table.open_bill_id).single().then(({ data }) => {
        if (data) { recallFromOrder(data); setOrderType('Dine-in'); setShowFloorPlan(false) }
      })
    } else {
      clearCart(); setTableNo(table.name); setOrderType('Dine-in')
      setCustomer(null); setOpenBillId(null); setShowFloorPlan(false)
    }
  }

  function handleAddExtra(item) {
    // Add unsent copy of sent item so it goes to kitchen
    const extraItem = {
      ...item,
      qty: 1,
      _key: item._key + '-extra-' + Date.now(),
      _sent: false,
      _station: undefined,
    }
    setCart(prev => [...prev, extraItem])
  }

  function handleCustomItem(item) {
    addItem(item, {})
  }

  function handleNewOrder() {
    clearCart()
    setCustomer(null)
    setTableNo('')
    setDiscount(0)
    setOpenBillId(null)
    setDeliveryFee(0)
    setDeliveryAddr('')
    setOrderType('Dine-in')
    setSplitPaid(0)
    setAppliedPromo(null)
  }

  // Send Order = save as Open Bill + send kitchen tickets
  async function handleSendOrder({ subtotal, tax, discAmt, total, fee }) {
    if (cart.length === 0) return
    const now = new Date()
    const newItems = cart
      .filter(i => !i._sent)
      .map(i => ({ sku:i.sku||'', name:i.name, qty:i.qty, price:i.price, modifiers:i.modifiers||{}, note:i.note||'', cat:i.cat||'' }))

    if (newItems.length === 0) {
      // All already sent — just open charge
      setShowCharge(true)
      return
    }

    // Group new items by station
    const { KITCHEN_STATIONS } = await import('../shared/constants')
    const stations = {}
    newItems.forEach(item => {
      const station = KITCHEN_STATIONS[item.cat] || 'Kitchen'
      if (!stations[station]) stations[station] = []
      stations[station].push(item)
    })

    if (openBillId) {
      // Add to existing open bill
      const { data: existing } = await supabase.from('orders').select('items').eq('id', openBillId).single()
      const allItems = [...(existing?.items || []), ...newItems.map(i => ({ ...i, _sent:true, _station: KITCHEN_STATIONS[i.cat]||'Kitchen' }))]
      await supabase.from('orders').update({ items: allItems, subtotal, tax, discount: discAmt, total }).eq('id', openBillId)
    } else {
      // Create new open bill
      const orderId = 'ORD-' + Date.now()
      const order = {
        id: orderId,
        items: cart.map(i => ({ sku:i.sku||'', name:i.name, qty:i.qty, price:i.price, modifiers:i.modifiers||{}, note:i.note||'', cat:i.cat||'', _sent:true, _station: KITCHEN_STATIONS[i.cat]||'Kitchen' })),
        subtotal, tax, discount: discAmt, total,
        pay: '-', staff: staff.name, table: tableNo || null,
        customer: customer ? customer.name : null, customer_id: customer ? customer.id : null,
        status: 'Open', date: now.toISOString().slice(0,10),
        time: now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }), cogs:0,
      }
      await supabase.from('orders').insert(order)
      setOpenBillId(orderId)
    }

    // Send kitchen tickets per station
    for (const [station, items] of Object.entries(stations)) {
      await supabase.from('kitchen_tickets').insert({
        id: 'KT-' + Date.now() + '-' + station,
        table: tableNo || orderType,
        items: items.map(i => ({ name:i.name, qty:i.qty, note:i.note, modifiers:i.modifiers })),
        time: now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }),
        status: 'New', station,
      })
    }

    // Mark all cart items as sent
    setCart(prev => prev.map(i => ({ ...i, _sent:true, _station: KITCHEN_STATIONS[i.cat]||'Kitchen' })))
    alert('Order dikirim ke ' + Object.keys(stations).join(', ') + '!')
  }

  // Manager PIN required to remove sent item from open bill
  async function handleManagerRemoveItem(item) {
    const pin = prompt('Masukkan PIN Manager untuk hapus item:')
    if (pin !== '9999') { alert('PIN salah'); return }
    const reason = prompt('Alasan hapus item ' + item.name + ':')
    if (!reason) return
    const newCart = cart.filter(i => i._key !== item._key)
    setCart(newCart)
    if (openBillId) {
      const sub = newCart.reduce((a,i) => a + i.price*i.qty, 0)
      const discA = discount ? Math.round(sub*discount/100) : 0
      const tx = Math.round((sub-discA)*0.1)
      await supabase.from('orders').update({
        items: newCart.map(i => ({ sku:i.sku||'', name:i.name, qty:i.qty, price:i.price, modifiers:i.modifiers||{}, note:i.note||'', cat:i.cat||'', _sent:i._sent||false, _station:i._station||'' })),
        subtotal: sub, tax: tx, total: sub-discA+tx,
        notes: (item.notes||'') + ' | REMOVE: ' + item.name + ' - ' + reason
      }).eq('id', openBillId)
    }
  }

  async function handleCharge({ payMethod, cashGiven, usePoints, finalTotal, splitLabel, orderNote, promoDisc = 0, promoName }) {
    const discAmt = discount ? Math.round(subtotal * discount / 100) : 0

    // SPLIT — record partial payment
    if (splitLabel) {
      const now = new Date()
      const newSplitPaid = splitPaid + finalTotal
      const billTotal = subtotal + Math.round(subtotal * 0.1) - discAmt
      const isFullyPaid = newSplitPaid >= billTotal

      if (openBillId) {
        const { data: existing } = await supabase.from('orders').select('notes').eq('id', openBillId).single()
        const prevNotes = existing?.notes || ''
        const newNote = (prevNotes ? prevNotes + ' | ' : '') + 'SPLIT: ' + payMethod + ' Rp' + finalTotal
        if (isFullyPaid) {
          // All paid — close the bill
          await supabase.from('orders').update({
            status: 'Paid', pay: payMethod, notes: newNote, total: billTotal
          }).eq('id', openBillId)
          if (tableNo) await supabase.from('tables').update({ status: 'Available' }).eq('name', tableNo)
          if (customer?.id) {
            const pts = Math.floor(billTotal / 100)
            await supabase.from('customers').update({ points: (customer.points||0)+pts, visits: (customer.visits||0)+1 }).eq('id', customer.id)
          }
        } else {
          await supabase.from('orders').update({ notes: newNote }).eq('id', openBillId)
        }
      }

      setSplitPaid(isFullyPaid ? 0 : newSplitPaid)

      return {
        id: openBillId || ('SPLIT-' + Date.now()),
        total: finalTotal, pay: payMethod,
        change: payMethod === 'Cash' ? (parseInt(cashGiven)||0) - finalTotal : 0,
        date: now.toISOString().slice(0,10),
        time: now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}),
        staff: staff.name, customer: customer?.name || null, items: cart,
        subtotal, tax: Math.round(subtotal*0.1), discount: discAmt,
        _isSplit: !isFullyPaid, splitLabel, splitPaid: newSplitPaid,
        _fullyPaid: isFullyPaid
      }
    }

    // FULL PAYMENT — if open bill exists, update it to Paid instead of creating new
    if (openBillId) {
      const now = new Date()
      await supabase.from('orders').update({
        status: 'Paid', pay: payMethod,
        cash_given: payMethod === 'Cash' ? parseInt(cashGiven) : null,
        change: payMethod === 'Cash' ? (parseInt(cashGiven)||0) - finalTotal : null,
        total: finalTotal, discount: discAmt + promoDisc,
        notes: orderNote || null, promo: promoName || null,
        time: now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}),
      }).eq('id', openBillId)

      // Update customer points
      if (customer) {
        const pts = Math.floor(finalTotal / 100)
        await supabase.from('customers').update({
          points: (customer.points || 0) + pts,
          visits: (customer.visits || 0) + 1,
        }).eq('id', customer.id)
      }

      // Update table back to Available
      if (tableNo) {
        await supabase.from('tables').update({ status: 'Available', open_bill_id: null }).eq('name', tableNo)
      }

      const fakeOrder = {
        id: openBillId, total: finalTotal, pay: payMethod,
        change: payMethod === 'Cash' ? (parseInt(cashGiven)||0) - finalTotal : 0,
        date: now.toISOString().slice(0,10),
        time: now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}),
        staff: staff.name, customer: customer?.name || null, items: cart,
        subtotal, tax: Math.round(subtotal*0.1), discount: discAmt + promoDisc,
      }
      clearCart(); setCustomer(null); setTableNo(''); setDiscount(0)
      setOpenBillId(null); setOrderType('Dine-in'); setDeliveryFee(0)
      setDeliveryAddr(''); setAppliedPromo(null); setSplitPaid(0)
      return fakeOrder
    }

    // NO OPEN BILL — create new order
    const order = await saveOrder({
      cart, subtotal, payMethod, cashGiven,
      staff, tableNo, customer, discount: discAmt + promoDisc,
      orderNote, promoName, usePoints, finalTotal
    })
    if (order) {
      clearCart(); setCustomer(null); setTableNo(''); setDiscount(0)
      setOpenBillId(null); setOrderType('Dine-in'); setDeliveryFee(0)
      setDeliveryAddr(''); setAppliedPromo(null); setSplitPaid(0)
    }
    return order
  }

  if (showFloorPlan) return (
    <FloorPlan
      staff={staff}
      onSelectTable={handleTableSelect}
      onTakeaway={() => { clearCart(); setOrderType('Takeaway'); setTableNo(''); setShowFloorPlan(false) }}
      onDelivery={() => { clearCart(); setOrderType('Delivery'); setTableNo(''); setShowFloorPlan(false) }}
    />
  )

  if (loading) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F4F7FA' }}>
      <div style={{ fontSize:40 }}>🏠</div>
      <div style={{ fontSize:16, fontWeight:700, color:'#0A1628', marginTop:8 }}>Loading menu...</div>
    </div>
  )

  return (
    <div style={S.app}>
      <div style={S.header}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:18, fontWeight:900, color:'white' }}>PawonLoka</span>
          <span style={S.badge}>{staff.name} · {staff.role}</span>
          {shift && <span style={{ fontSize:11, color:'#86EFAC', fontWeight:600 }}>Shift Open</span>}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ position:'relative' }}>
            <button onClick={() => setShowTablePicker(p => !p)}
              style={{ ...S.headerBtn, background: tableNo ? '#10B981' : 'rgba(255,255,255,0.15)', color:'white', minWidth:100, fontWeight:700, lineHeight:1.2 }}>
              <div>{tableNo || 'Table -'}</div>
              {customer && <div style={{ fontSize:10, opacity:0.85, fontWeight:500 }}>{customer.name}</div>}
            </button>
            {showTablePicker && (
              <TablePicker
                current={tableNo}
                onSelect={async t => {
                  if (t !== tableNo) {
                    if (openBillId) {
                      await supabase.from('orders').update({ table: t }).eq('id', openBillId)
                      await supabase.from('tables').update({ status: 'Occupied' }).eq('name', t)
                      if (tableNo) await supabase.from('tables').update({ status: 'Available' }).eq('name', tableNo)
                    }
                  }
                  setTableNo(t); setOrderType('Dine-in')
                }}
                onSelectOccupied={async t => {
                  const { data } = await supabase.from('orders').select('*').eq('id', t.open_bill_id).single()
                  if (data) await recallFromOrder(data)
                  setOrderType('Dine-in')
                }}
                onClose={() => setShowTablePicker(false)}
              />
            )}
          </div>
          <button onClick={() => setShowCustomer(true)} style={S.headerBtn}>
            {customer ? customer.name : '+ Customer'}
          </button>
          <button onClick={() => setShowOrders(true)} style={S.headerBtn}>Orders</button>
          <button onClick={() => setShowCashLog(true)} style={S.headerBtn}>Cash</button>
          <button onClick={() => setShowVoid(true)} style={{ ...S.headerBtn, color:'#FCA5A5' }}>Void</button>
          <button onClick={() => setShowShift(true)} style={S.headerBtn}>Shift</button>
          <button onClick={() => setShowSettings(true)} style={S.headerBtn}>Settings</button>
          <button onClick={() => { setStaff(null); setShift(null) }} style={S.headerBtn}>Logout</button>
        </div>
      </div>

      <div style={S.body} className="pos-body">
        <MenuGrid
          products={products}
          categories={categories}
          onSelect={handleProductSelect}
          onCustomItem={() => setShowCustomItem(true)}
        />
        <div className={"pos-cart-panel" + (cartOpen ? " mobile-open" : "")}>
        <Cart
          cart={cart}
          onUpdateQty={updateQty}
          onClear={clearCart}
          onSendOrder={handleSendOrder}
          onCharge={() => setShowCharge(true)}
          onNewOrder={handleNewOrder}
          tableNo={tableNo}
          onTableNoChange={setTableNo}
          customer={customer}
          onShowCustomer={() => setShowCustomer(true)}
          onRemoveCustomer={() => setCustomer(null)}
          discount={discount}
          onDiscountChange={setDiscount}
          orderType={orderType}
          onOrderTypeChange={setOrderType}
          openBillId={openBillId}
          onManagerRemoveItem={handleManagerRemoveItem}
          onAddExtra={handleAddExtra}
          onSplit={() => setSplitTotals({ subtotal, tax: Math.round(subtotal*0.1), total: subtotal+Math.round(subtotal*0.1) })}
          deliveryFee={deliveryFee}
          onDeliveryFeeChange={setDeliveryFee}
          deliveryAddr={deliveryAddr}
          onDeliveryAddrChange={setDeliveryAddr}
        />
        </div>
        {/* Mobile cart backdrop */}
        <div className={"cart-mobile-backdrop" + (cartOpen ? " show" : "")} onClick={() => setCartOpen(false)} />
        {/* Cart FAB */}
        <button className="cart-fab" onClick={() => setCartOpen(o => !o)}>
          Cart {cart.length > 0 && <span style={{ background:"#fff", color:"#0066FF", borderRadius:12, padding:"1px 7px", fontSize:12, fontWeight:800, marginLeft:4 }}>{cart.reduce((s,i)=>s+i.qty,0)}</span>}
        </button>
      </div>

      {modifierItem && (
        <ModifierModal
          product={modifierItem}
          onConfirm={handleModifierConfirm}
          onCancel={() => setModifierItem(null)}
        />
      )}

      {showCharge && (
        <ChargeModal
          cart={cart}
          totals={{ subtotal, tax: Math.round(subtotal*0.1), total: subtotal+Math.round(subtotal*0.1), fee: parseFloat(deliveryFee)||0, discount, splitPaid }}
          customer={customer}
          onConfirm={handleCharge}
          onClose={() => setShowCharge(false)}
          onSuccess={async () => { setShowCharge(false); if (tableNo) { await supabase.from('tables').update({ status: 'Available' }).eq('name', tableNo) } clearCart(); setCustomer(null); setTableNo(''); setOpenBillId(null); setDiscount(0); setSplitPaid(0); setAppliedPromo(null); setDeliveryFee(0); setDeliveryAddr('') }}
          appliedPromo={appliedPromo}
          onOpenPromo={() => { setShowCharge(false); setShowPromo(true) }}
        />
      )}

      {showCustomer && (
        <CustomerSearch
          onSelect={async c => {
            setCustomer(c)
            setShowCustomer(false)
            if (openBillId) {
              await supabase.from('orders').update({
                customer: c.name,
                customer_id: c.id
              }).eq('id', openBillId)
            }
          }}
          onClose={() => setShowCustomer(false)}
        />
      )}

      {showOrders && (
        <OrdersModal
          onClose={() => setShowOrders(false)}
          onRecall={recallFromOrder}
        />
      )}

      {showVoid && (
        <VoidModal onClose={() => setShowVoid(false)} />
      )}

      {showCashLog && (
        <CashInOutModal staff={staff} onClose={() => setShowCashLog(false)} />
      )}
      {/* Settings Panel */}
      {showSettings && (
          <div onClick={e => { if(e.target===e.currentTarget) setShowSettings(false) }}
            style={{ position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', zIndex:2000, display:'flex', justifyContent:'flex-end' }}>
            <div style={{ width:'min(360px,100vw)', background:'#fff', display:'flex', flexDirection:'column', boxShadow:'-4px 0 24px rgba(9,30,66,0.2)', overflowY:'auto' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', background:'#0A1628', flexShrink:0 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:900, color:'white' }}>POS Settings</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:2 }}>Terminal configuration</div>
                </div>
                <button onClick={() => setShowSettings(false)}
                  style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'white', width:32, height:32, borderRadius:'50%', fontSize:18, cursor:'pointer' }}>x</button>
              </div>
              <div style={{ flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#091E42', paddingBottom:8, borderBottom:'1px solid #DFE1E6' }}>Printer & Hardware</div>
                <PrinterSettings hook={printer} />
              </div>
            </div>
          </div>
      )}

      {showPromo && (
        <PromoModal
          subtotal={subtotal}
          customer={customer}
          onApply={p => { setAppliedPromo(p); setShowPromo(false) }}
          onClose={() => setShowPromo(false)}
        />
      )}

      {showCustomItem && (
        <CustomItemModal
          onAdd={handleCustomItem}
          onClose={() => setShowCustomItem(false)}
        />
      )}

      {showTablePicker === false && null}

    </div>
  )
}

const S = {
  app:       { display:'flex', flexDirection:'column', height:'100vh', background:'#F4F7FA', fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif' },
  header:    { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', background:'#0A1628', flexShrink:0, flexWrap:'wrap', gap:8 },
  badge:     { fontSize:12, background:'rgba(255,255,255,0.15)', color:'white', padding:'4px 10px', borderRadius:20 },
  headerBtn: { fontSize:12, background:'rgba(255,255,255,0.1)', color:'white', border:'1px solid rgba(255,255,255,0.2)', padding:'7px 12px', borderRadius:8, cursor:'pointer', whiteSpace:'nowrap' },
  body:      { display:'flex', flex:1, overflow:'hidden' },
}
