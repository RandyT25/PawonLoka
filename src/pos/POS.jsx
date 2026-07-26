import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, TAX_RATE, STAFF, KITCHEN_STATIONS } from '../shared/constants'
import useCart from './hooks/useCart'
import useOrders from './hooks/useOrders'
import useOfflineSync from './hooks/useOfflineSync'
import { offlineStore, offlineFullSync } from '../lib/offlineStore'
import { qr } from '../lib/quickRead'
import { dbWrite } from '../shared/dbWrite'
import { computeOrderTotals } from '../shared/orderPricing'

// Convert a qty expressed in `unit` into the ingredient's own base/stock unit
function toBaseUnit(ing, qty, unit) {
  if (unit === ing.unit) return qty
  const conv = (ing.conversions||[]).find(c => c.unit === unit)
  if (conv && parseFloat(conv.qty) > 0) return qty * parseFloat(conv.qty)
  const fallbacks = { kg:1000, L:1000, Galon:19000 }
  if (ing.unit==='gr' && fallbacks[unit]) return qty * fallbacks[unit]
  if (ing.unit==='ml' && fallbacks[unit]) return qty * fallbacks[unit]
  return qty
}
import PinLogin from './components/PinLogin'
import MenuGrid from './components/MenuGrid'
import Cart from './components/Cart'
import ChargeModal from './components/ChargeModal'
import ModifierModal from './components/ModifierModal'
import CustomerSearch from './components/CustomerSearch'
import CustomItemModal from './components/CustomItemModal'
import TablePicker from './components/TablePicker'
import { usePrinter, prefetchLogo } from './hooks/usePrinter'
import { useWhatsApp } from './hooks/useWhatsApp'
import MobileMenuSlider from './components/MobileMenuSlider'
import './pos.mobile.css'
import OfflineBar from './components/OfflineBar'
// Situational modals — only needed after a specific user action, not on first
// paint, so they're code-split out of the main bundle like Backoffice already does.
const ShiftModal      = lazy(() => import('./components/ShiftModal'))
const VoidModal       = lazy(() => import('./components/VoidModal'))
const ReprintModal    = lazy(() => import('./components/ReprintModal'))
const PromoModal      = lazy(() => import('./components/PromoModal'))
const CashInOutModal  = lazy(() => import('./components/CashInOutModal'))
const FloorPlan       = lazy(() => import('./components/FloorPlan'))
const OrdersModal     = lazy(() => import('./components/OrdersModal'))
const PrinterSettings = lazy(() => import('./components/PrinterSettings'))
const ClockInOutModal = lazy(() => import('./components/ClockInOutModal'))

export default function POS() {
  const [offlineReady,  setOfflineReady]  = useState(false)
  const [firstSync,     setFirstSync]     = useState(false)
  const [needsInternet, setNeedsInternet] = useState(false)

  // Check if IndexedDB has been seeded — gate access until it is
  useEffect(() => {
    offlineStore.getCache('products').then(async cached => {
      if (cached?.length) {
        setOfflineReady(true)
      } else if (navigator.onLine) {
        setFirstSync(true)
        await offlineFullSync(supabase).catch(() => {})
        setFirstSync(false)
        setOfflineReady(true)
      } else {
        setNeedsInternet(true)
      }
    })
  }, [])

  // Persist staff, openBillId, tableNo in sessionStorage so a page refresh doesn't log out
  // or lose the active order. sessionStorage is tab-scoped — clears on tab close (security).
  const [staff, setStaff]           = useState(() => { try { return JSON.parse(sessionStorage.getItem('pos_staff') || 'null') } catch { return null } })
  const [shift, setShift]           = useState(null)
  const [products, setProducts]     = useState([])
  const [categories, setCategories] = useState([])
  const [modifierGroups, setModifierGroups] = useState([])
  const [loading, setLoading]       = useState(true)
  const [tableNo, setTableNo]       = useState(() => sessionStorage.getItem('pos_table') || '')
  const [tableArea, setTableArea]   = useState(() => sessionStorage.getItem('pos_table_area') || '')
  const [pax, setPax]               = useState(0)
  const [showPaxModal, setShowPaxModal] = useState(false)
  const [pendingTable, setPendingTable] = useState(null)
  const [customer, setCustomer]     = useState(null)
  const [discount, setDiscount]     = useState(0)
  const [orderType, setOrderType]     = useState('Dine-in')
  const [openBillId, setOpenBillId]   = useState(() => sessionStorage.getItem('pos_open_bill') || null)
  const [deliveryFee, setDeliveryFee]   = useState(0)
  const [deliveryAddr, setDeliveryAddr] = useState('')

  // Modals
  const [showShift, setShowShift]         = useState(false)
  const [shiftAsked, setShiftAsked]       = useState(false)
  const [showClock, setShowClock]         = useState(false)
  const [showSettings, setShowSettings]   = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [voidAuth, setVoidAuth] = useState(null) // {orderId, reason, pin}

  // Sync session-critical state to sessionStorage on every change
  useEffect(() => {
    if (staff) sessionStorage.setItem('pos_staff', JSON.stringify(staff))
    else { sessionStorage.removeItem('pos_staff'); sessionStorage.removeItem('pos_open_bill'); sessionStorage.removeItem('pos_table'); sessionStorage.removeItem('pos_table_area') }
  }, [staff])
  useEffect(() => {
    if (openBillId) sessionStorage.setItem('pos_open_bill', openBillId)
    else sessionStorage.removeItem('pos_open_bill')
  }, [openBillId])
  useEffect(() => {
    if (tableNo) sessionStorage.setItem('pos_table', tableNo)
    else sessionStorage.removeItem('pos_table')
  }, [tableNo])
  useEffect(() => {
    if (tableArea) sessionStorage.setItem('pos_table_area', tableArea)
    else sessionStorage.removeItem('pos_table_area')
  }, [tableArea])

  const [cartOpen, setCartOpen]           = useState(false)
  const [heldBills, setHeldBills]         = useState([])
  const printer    = usePrinter()
  const [appSettings, setAppSettings] = useState(null)

  const [backofficeDiscounts, setBackofficeDiscounts] = useState([])
  const [staffList, setStaffList] = useState(STAFF)
  const [bundles, setBundles] = useState([])
  const [showBundles, setShowBundles] = useState(false)

  useEffect(() => {
    // Load from cache first — instant, no network needed
    Promise.all([
      offlineStore.getCache('app_settings'),
      offlineStore.getCache('discounts'),
      offlineStore.getCache('bundles'),
    ]).then(([cachedSettings, cachedDiscounts, cachedBundles]) => {
      if (cachedSettings) {
        setAppSettings(cachedSettings)
        if (cachedSettings.outlet?.logo) prefetchLogo(cachedSettings.outlet.logo, '80mm')
      }
      if (cachedDiscounts) setBackofficeDiscounts(cachedDiscounts)
      if (cachedBundles)   setBundles(cachedBundles)
    })
    // Staff from localStorage (already cache-first in PinLogin, mirror here)
    try {
      const s = JSON.parse(localStorage.getItem('pos_staff_cache') || 'null')
      if (s?.length) setStaffList(s)
    } catch {}

    // Then refresh from Supabase in background
    supabase.from('app_settings').select('*').eq('id','main').maybeSingle()
      .then(({data}) => {
        if (data) {
          setAppSettings(data)
          offlineStore.setCache('app_settings', data)
          if (data.outlet?.logo) prefetchLogo(data.outlet.logo, '80mm')
        }
      }).catch(() => {})
    supabase.from('discounts').select('*').eq('active', true).order('name')
      .then(({data}) => { if (data) { setBackofficeDiscounts(data); offlineStore.setCache('discounts', data) } })
      .catch(() => {})
    supabase.from('staff').select('id,name,role,pin,color,active').eq('active', true).order('name')
      .then(({data}) => {
        if (data?.length) {
          setStaffList(data)
          localStorage.setItem('pos_staff_cache', JSON.stringify(data))
        }
      }).catch(() => {})
    supabase.from('bundles').select('*').eq('active', true).order('name')
      .then(({data}) => { if (data) setBundles(data) }).catch(() => {})
  }, [])

  const paySettings = appSettings?.payments
  const TAX_RATE_LIVE = appSettings
    ? (paySettings?.tax?.enabled ? (paySettings.tax.rate||0)/100 : 0)
    : 0  // 0 until settings load (avoids wrong tax flash)
  const SERVICE_RATE = paySettings?.service?.enabled
    ? (paySettings.service.rate || 0) / 100
    : 0
  const ACTIVE_PAY_METHODS = paySettings?.methods?.length
    ? paySettings.methods.filter(m => m.enabled !== false)
    : null
  const { sendReceipt, resendReceipt } = useWhatsApp()
  const [showCharge, setShowCharge]       = useState(false)
  const [showCustomer, setShowCustomer]   = useState(false)
  const [modifierItem, setModifierItem]   = useState(null)
  const [showReceipt, setShowReceipt]     = useState(false)
  const [showVoid, setShowVoid]           = useState(false)
  const [showReprint, setShowReprint]     = useState(false)
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
  const { orders } = useOrders()
  const { pendingCount, syncing, syncNow } = useOfflineSync()
  const [dismissedBills, setDismissedBills] = useState(new Set())

  // Memoized (and declared ahead of the component's early returns — hooks can't
  // be called conditionally) so a stable onSelect can be passed to MenuGrid
  // without defeating React.memo.
  const handleModifierConfirm = useCallback((product, modifiers, note) => {
    // Calculate extra price from modifiers
    const mods = product._mods || modifierGroups
    const extraPrice = Object.entries(modifiers).reduce((sum, [modId, optName]) => {
      const mod = mods.find(m => m.id === modId)
      const opt = mod?.options?.find(o => (o.name||o) === optName)
      return sum + (opt?.price || 0)
    }, 0)
    const finalProduct = extraPrice > 0
      ? { ...product, price: product.price + extraPrice, _basePrice: product.price }
      : { ...product }
    // Build display labels with price
    const displayMods = Object.fromEntries(
      Object.entries(modifiers).map(([modId, optName]) => {
        const mod = mods.find(m => m.id === modId)
        const opt = mod?.options?.find(o => (o.name||o) === optName)
        const label = opt?.price > 0 ? optName + ' +Rp ' + opt.price.toLocaleString('id-ID') : optName
        return [modId, label]
      })
    )
    addItem({ ...finalProduct, note }, displayMods)
    setModifierItem(null)
  }, [modifierGroups, addItem])

  const handleProductSelect = useCallback(product => {
    const prodCatId = categories.find(c => c.name === product.cat)?.id
    const productLinkedMods = Array.isArray(product.linked_modifiers) && product.linked_modifiers.length > 0
    const relevantMods = productLinkedMods
      ? modifierGroups.filter(m => product.linked_modifiers.includes(m.id))
      : modifierGroups.filter(m => {
          const hasCatFilter = Array.isArray(m.linked_cats) && m.linked_cats.length > 0
          const hasProdFilter = Array.isArray(m.linked_products) && m.linked_products.length > 0
          if (!hasCatFilter && !hasProdFilter) return true
          if (hasCatFilter && prodCatId && m.linked_cats.includes(prodCatId)) return true
          if (hasProdFilter && m.linked_products.includes(product.sku)) return true
          return false
        })
    if (relevantMods.length) { setModifierItem({...product, _mods: relevantMods}) } else { handleModifierConfirm(product, {}, '') }
  }, [categories, modifierGroups, handleModifierConfirm])

  useEffect(() => {
    if (!staff) return
    loadData()
    restoreShift()
    // After a refresh, restore the active open bill so the cart isn't empty
    const savedBill = sessionStorage.getItem('pos_open_bill')
    if (savedBill) {
      supabase.from('orders').select('*').eq('id', savedBill).maybeSingle()
        .then(({ data }) => {
          if (data && (data.status === 'Open' || data.status === 'open')) {
            recallFromOrder(data)
          } else if (!data) {
            // Not in Supabase — might be an offline-created order still in the queue
            offlineStore.getCache('offline_open_bill_' + savedBill).then(local => {
              if (local) recallFromOrder(local)
              else { setOpenBillId(null); setTableNo(''); setTableArea('') }
            })
          } else {
            setOpenBillId(null); setTableNo(''); setTableArea('')
          }
        })
        .catch(async () => {
          // Offline — try local cache
          const local = await offlineStore.getCache('offline_open_bill_' + savedBill)
          if (local) recallFromOrder(local)
        })
    }
  }, [staff])

  // Live product sync — reacts to backoffice edits (Products/Profitability) and the
  // manual "Sync to POS" push, so an already-open POS session doesn't need a reload
  useEffect(() => {
    let debounceTimer = null
    const debouncedLoad = () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(loadData, 800) }
    const ch = supabase.channel('pos_products_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, debouncedLoad)
      .on('broadcast', { event: 'force_sync' }, debouncedLoad)
      .subscribe()
    return () => { clearTimeout(debounceTimer); supabase.removeChannel(ch) }
  }, [])

  async function restoreShift() {
    const today = new Date().toISOString().slice(0, 10)
    // Close any stale open shifts from previous days (all staff)
    await supabase.from('shifts')
      .update({ clock_out: 'auto-closed' })
      .is('clock_out', null)
      .neq('date', today)
    // Find the single active shift for today (shared across all staff)
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('date', today)
      .is('clock_out', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) {
      setShift(data)
      setShowShift(false)
    } else if (!shiftAsked) {
      setShiftAsked(true)
      setShowShift(true)
    }
  }

  async function deductStock(items) {
    try {
      const skus = [...new Set(items.map(i => i.sku).filter(Boolean))]
      if (!skus.length) return
      // Batch fetch all recipes for all SKUs in one query
      const allRecipes = await qr(supabase.from('recipes')
        .select('product_id, ingredient_id, qty, unit')
        .in('product_id', skus), { ms:5000 })
      if (!allRecipes?.length) return
      // Fetch ingredient records (incl. conversions) up front so recipe-line units can be converted to each ingredient's base unit
      const ingIds = [...new Set(allRecipes.map(r => r.ingredient_id))]
      const ings = await qr(supabase.from('ingredients').select('id, stock, name, unit, conversions').in('id', ingIds), { ms:5000 })
      const ingMap = {}
      for (const ing of ings || []) ingMap[ing.id] = ing
      // Accumulate total deductions per ingredient, converted to each ingredient's base unit
      const deductions = {}
      for (const item of items) {
        const rows = allRecipes.filter(r => r.product_id === item.sku)
        for (const ri of rows) {
          const ing = ingMap[ri.ingredient_id]
          if (!ing) continue
          const qtyBase = toBaseUnit(ing, ri.qty || 0, ri.unit) * (item.qty || 1)
          if (qtyBase) deductions[ri.ingredient_id] = (deductions[ri.ingredient_id] || 0) + qtyBase
        }
      }
      if (!Object.keys(deductions).length) return
      // Ingredient stock updates and the stock_movements log are independent of
      // each other (movements are built from `deductions`/`ingMap`, not from the
      // update results) — run both in parallel instead of one after the other.
      const movDate = new Date().toISOString().slice(0, 10)
      const movTime = new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })
      const ts = Date.now()
      const movements = Object.keys(deductions).map((id, idx) => {
        const ing = ingMap[id]
        return {
          id: `MOV-${ts}-${idx}`,
          type: 'Sale',
          ingredient_id: id,
          ingredient_name: ing?.name,
          qty: -Math.abs(deductions[id] || 0),
          unit: ing?.unit,
          ref: items[0]?.orderId || `ORD-${ts}`,
          note: 'Auto dari penjualan',
          date: movDate,
          time: movTime,
        }
      })
      await Promise.all([
        Promise.all(Object.keys(deductions).map(id => {
          const ing = ingMap[id]
          if (!ing) return null
          return supabase.from('ingredients').update({
            stock: Math.max(0, (ing.stock || 0) - deductions[id])
          }).eq('id', id)
        })),
        supabase.from('stock_movements').insert(movements).catch(() => {}),
      ])
    } catch(e) { console.error('Stock deduction error:', e) }
  }

  async function loadData() {
    // Step 1: Load from IndexedDB cache IMMEDIATELY — instant startup even offline
    const [cachedProds, cachedCats, cachedMods] = await Promise.all([
      offlineStore.getCache('products'),
      offlineStore.getCache('categories'),
      offlineStore.getCache('modifier_groups'),
    ])
    if (cachedProds?.length) setProducts(cachedProds)
    if (cachedCats?.length)  setCategories(cachedCats)
    if (cachedMods?.length)  setModifierGroups(cachedMods)
    // Show UI immediately if we have cached data — don't wait for network
    if (cachedProds?.length && cachedCats?.length) setLoading(false)

    // Step 2: Refresh from Supabase in background with a 10s timeout
    try {
      const [prods, cats, mods] = await Promise.all([
        qr(supabase.from('products').select('*').eq('active', true), { cache:'products', ms:5000 }),
        qr(supabase.from('categories').select('*').order('sort'), { cache:'categories', ms:5000 }),
        qr(supabase.from('modifier_groups').select('*').order('name'), { cache:'modifier_groups', ms:5000 }),
      ])
      // qr() already handles cache + errors; just apply to state
      if (prods) setProducts(prods)
      if (cats)  setCategories(cats)
      if (mods)  setModifierGroups(mods)
      // Cache today's orders — critical for offline bill access
      const todayStr = new Date().toISOString().slice(0,10)
      qr(supabase.from('orders').select('*').eq('date', todayStr).order('created_at', {ascending:false}).limit(200),
         { cache:'orders_today', ms:5000 })
        .then(orders => {
          if (orders) {
            orders.filter(o => o.status==='Open'||o.status==='open')
              .forEach(o => offlineStore.setCache('offline_open_bill_'+o.id, o))
          }
        })
      // Full sync once per session
      if (!sessionStorage.getItem('_synced')) {
        sessionStorage.setItem('_synced', '1')
        offlineFullSync(supabase).catch(() => {})
      }
    } catch {
      // Silent — cache already loaded above
    }
    setLoading(false)
  }

  // First-launch screens — shown before PinLogin until IndexedDB is seeded
  if (firstSync) return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0A1628', color:'#fff', gap:16, fontFamily:'system-ui,sans-serif' }}>
      <img src="/logo.png" alt="PawonLoka" style={{ width:72, height:72, borderRadius:16, objectFit:'cover', marginBottom:8 }} />
      <div style={{ fontSize:20, fontWeight:800 }}>Menyiapkan PawonLoka...</div>
      <div style={{ fontSize:13, opacity:0.6, textAlign:'center', maxWidth:260 }}>Mengunduh menu & data untuk mode offline. Hanya diperlukan sekali.</div>
      <div style={{ display:'flex', gap:6, marginTop:8 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width:8, height:8, borderRadius:'50%', background:'rgba(255,255,255,0.4)', animation:`pulse 1.2s ${i*0.3}s ease-in-out infinite` }}/>
        ))}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
    </div>
  )

  if (needsInternet) return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0A1628', color:'#fff', gap:16, fontFamily:'system-ui,sans-serif', padding:32, textAlign:'center' }}>
      <img src="/logo.png" alt="PawonLoka" style={{ width:72, height:72, borderRadius:16, objectFit:'cover', marginBottom:8 }} />
      <div style={{ fontSize:20, fontWeight:800 }}>Koneksi Internet Diperlukan</div>
      <div style={{ fontSize:13, opacity:0.6, maxWidth:280 }}>Setup pertama memerlukan internet untuk mengunduh menu & data. Setelah itu, app dapat digunakan tanpa internet.</div>
      <button onClick={async () => {
        if (!navigator.onLine) return alert('Masih tidak ada koneksi')
        setNeedsInternet(false); setFirstSync(true)
        await offlineFullSync(supabase).catch(() => {})
        setFirstSync(false); setOfflineReady(true)
      }} style={{ marginTop:8, padding:'14px 28px', background:'#10B981', color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer' }}>
        Coba Lagi
      </button>
    </div>
  )

  if (!offlineReady) return null

  // PIN Login
  if (!staff) return (
    <PinLogin onLogin={s => { sessionStorage.setItem('pos_staff', JSON.stringify(s)); setStaff(s) }} />
  )

  // Shift modal
  if (showShift) return (
    <Suspense fallback={null}>
      <ShiftModal
        staff={staff}
        shift={shift}
        printer={printer}
        onOpen={s => { setShift(s); setShowShift(false); setTimeout(()=>{ if(window.confirm('Shift dibuka! Jangan lupa Clock In ya ' + staff.name + '?')) { setShowClock(true) } },500) }}
        onClose={() => { setShift(null); setShowShift(false); setTimeout(()=>{ if(window.confirm('Shift ditutup! Jangan lupa Clock Out ya ' + staff.name + '?')) { setShowClock(true) } },500) }}
        onDismiss={() => setShowShift(false)}
        onLogout={() => { setStaff(null); setShift(null); setShowShift(false); clearCart(); setCustomer(null); setTableNo(''); setTableArea(''); setOpenBillId(null) }}
      />
    </Suspense>
  )

  const tax   = Math.round(subtotal * TAX_RATE_LIVE)
  const total = subtotal + tax


  // Keep local order cache in sync — always merges with existing so partial updates never lose fields
  async function updateOrderCache(order) {
    if (!order?.id) return
    const existing = (await offlineStore.getCache('offline_open_bill_' + order.id)) || {}
    const merged = { ...existing, ...order }   // existing fields first, then overlay updates
    offlineStore.setCache('offline_open_bill_' + merged.id, merged)
    const all = (await offlineStore.getCache('orders_today')) || []
    const idx = all.findIndex(o => o.id === merged.id)
    const updated = idx >= 0 ? all.map(o => o.id === merged.id ? merged : o) : [merged, ...all]
    offlineStore.setCache('orders_today', updated)
  }

  async function recallFromOrder(order) {
    // Auto-cache every order recalled — makes it available for offline access
    updateOrderCache(order)
    // If this is already the active bill, preserve any unsent cart items — don't reset
    if (order.id === openBillId) {
      const unsent = cart.filter(i => !i._sent)
      if (unsent.length > 0) return  // cart is correct, nothing to reload
    }
    setCart(order.items.map((i, idx) => ({ ...i, _key: i.sku + '-' + idx, modifiers: i.modifiers || {}, _sent: i._sent || true, _station: i._station || '', _printedQty: i.qty })))
    setTableNo(order.table || '')
    setTableArea(order.table_area || '')
    setPax(order.pax || 0)
    setOpenBillId(order.id)
    if (order.customer_id) {
      const { data: cust } = await supabase.from('customers').select('*').eq('id', order.customer_id).maybeSingle()
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
      const billId = table.open_bill_id
      // Already viewing this bill — just close floor plan, don't reload cart
      if (openBillId === billId) { setShowFloorPlan(false); return }
      // Cache-first: read from device storage instantly, fall back to Supabase with 5s timeout
      offlineStore.getCache('offline_open_bill_' + billId).then(async cached => {
        const data = cached || await qr(
          supabase.from('orders').select('*').eq('id', billId).maybeSingle(),
          { cache: 'offline_open_bill_' + billId, ms: 5000 }
        )
        if (data) { recallFromOrder(data); setOrderType('Dine-in'); setShowFloorPlan(false) }
        else alert('Tagihan tidak tersedia.\nPastikan ada koneksi internet saat membuka tagihan pertama kali.')
      })
    } else {
      clearCart(); setOrderType('Dine-in')
      setCustomer(null); setOpenBillId(null); setShowFloorPlan(false)
      setPendingTable({ name: table.name, area: table.area || '' })
      setPax(0)
      setShowPaxModal(true)
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
    setTableArea('')
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
    // Snapshot volatile state NOW — prevents table/orderType changing mid-async
    // (race condition: staff taps another table while this is awaiting)
    const capturedTable     = tableNo
    const capturedTableArea = tableArea
    const capturedOrderType = orderType
    const now = new Date()
    // kitchenItems: delta qty only — kitchen staff see only what's new/increased
    const kitchenItems = cart
      .filter(i => !i._sent)
      .map(i => ({
        sku: i.sku || '', name: i.name,
        qty: i._printedQty != null ? i.qty - i._printedQty : i.qty,
        _isAddition: i._printedQty != null,
        price: i.price, modifiers: i.modifiers || {}, note: i.note || '', cat: i.cat || '',
      }))
      .filter(i => i.qty > 0)

    // cancelItems: safety net — sent items whose qty fell below _printedQty
    // (normally printed immediately by manager functions; this catches edge cases)
    const cancelItems = cart
      .filter(i => i._sent && i._printedQty != null && i.qty < i._printedQty)
      .map(i => ({
        sku: i.sku || '', name: i.name,
        qty: i._printedQty - i.qty,
        price: i.price, modifiers: i.modifiers || {}, note: i.note || '', cat: i.cat || '',
      }))

    if (kitchenItems.length === 0 && cancelItems.length === 0) {
      // All already sent — just open charge
      setShowCharge(true)
      return
    }

    // Group new items by station — read dynamic routing from backoffice first
    const catRouting = appSettings?.cat_routing || (() => { try { return JSON.parse(localStorage.getItem('pl_cat_routing')||'{}') } catch { return {} } })()
    const getStation = cat => catRouting[cat] || KITCHEN_STATIONS[cat] || 'Kitchen'

    const stations = {}
    kitchenItems.forEach(item => {
      const station = getStation(item.cat)
      if (!stations[station]) stations[station] = []
      stations[station].push(item)
    })
    const cancelStations = {}
    cancelItems.forEach(item => {
      const station = getStation(item.cat)
      if (!cancelStations[station]) cancelStations[station] = []
      cancelStations[station].push(item)
    })

    if (openBillId) {
      // Rebuild item list from cart — cart is source of truth for the full order state
      const allItems = cart.map(i => ({ sku:i.sku||'', name:i.name, qty:i.qty, price:i.price, modifiers:i.modifiers||{}, note:i.note||'', cat:i.cat||'', _sent:true, _station: getStation(i.cat), isBundle:i.isBundle||false, bundleItems:i.bundleItems||null }))
      await dbWrite('orders', 'update', { items: allItems, subtotal, tax, discount: discAmt, total }, { id: openBillId })
      updateOrderCache({ id: openBillId, items: allItems, subtotal, tax, total, status: 'Open' })
    } else {
      // Create new open bill
      const orderId = 'ORD-' + Date.now()
      const order = {
        id: orderId,
        items: cart.map(i => ({ sku:i.sku||'', name:i.name, qty:i.qty, price:i.price, modifiers:i.modifiers||{}, note:i.note||'', cat:i.cat||'', _sent:true, _station: getStation(i.cat), isBundle:i.isBundle||false, bundleItems:i.bundleItems||null })),
        subtotal, tax, discount: discAmt, total,
        pay: '-', staff: staff.name, table: capturedTable || null, table_area: capturedTableArea || null,
        ...(pax > 0 ? { pax } : {}),
        customer: customer ? customer.name : null, customer_id: customer ? customer.id : null,
        status: 'Open', date: now.toISOString().slice(0,10),
        time: now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }), cogs:0,
      }
      const ok = await dbWrite('orders', 'insert', order)
      if (!ok) { alert('Gagal simpan order'); return }
      updateOrderCache(order)
      setOpenBillId(orderId)
    }

    // Save kitchen tickets (offline-safe — queued if no connection)
    // Skipped entirely when Kitchen Display is disabled in Settings
    const ROLE_MAP = { Kitchen:'kitchen', kitchen:'kitchen', Snack:'snack', snack:'snack', Bar:'bar', bar:'bar', Kasir:'receipt', kasir:'receipt' }
    const kdsOn = appSettings?.pos_behaviour?.kitchen_display !== false
    // Physical station printing is independent of the on-screen KDS toggle above —
    // it must keep working even if the digital Kitchen Display screen is disabled.
    const stationPrintOn = appSettings?.pos_behaviour?.auto_print_stations !== false
    if (kdsOn) {
      await Promise.all([
        ...Object.entries(stations).map(([station, items]) =>
          dbWrite('kitchen_tickets', 'insert', {
            id: 'KT-' + crypto.randomUUID(),
            table: capturedTable || capturedOrderType,
            items: items.map(i => ({ name:i.name, qty:i.qty, note:i.note, modifiers:i.modifiers })),
            time: now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }),
            status: 'New', station,
          })
        ),
        ...Object.entries(cancelStations).map(([station, items]) =>
          dbWrite('kitchen_tickets', 'insert', {
            id: 'KT-' + crypto.randomUUID(),
            table: capturedTable || capturedOrderType,
            items: items.map(i => ({ name:i.name, qty:i.qty })),
            time: now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }),
            status: 'New', station, type: 'cancellation',
          }).catch(() => {})
        ),
      ])
    }

    // Print per station — combine add+cancel into one ticket when both exist
    const allStations = stationPrintOn
      ? new Set([...Object.keys(stations), ...Object.keys(cancelStations)])
      : new Set()
    const isFirstSend = cart.every(i => !i._sent)
    // Print every station concurrently — a single slow/unreachable printer
    // shouldn't stall the others or delay the "Order dikirim!" confirmation.
    const failedStations = []
    await Promise.all([...allStations].map(async station => {
      const addItems = stations[station] || []
      const cItems   = cancelStations[station] || []
      const type     = addItems.length && cItems.length ? 'update' : cItems.length ? 'cancellation' : isFirstSend ? 'new' : 'addition'
      const stationRole = ROLE_MAP[station] || ROLE_MAP[station?.charAt(0).toUpperCase()+station?.slice(1)] || 'kitchen'
      const fmtItem = (i, prefix) => {
        const parts = [prefix + i.qty + 'x ' + i.name]
        if (i.modifiers && Object.values(i.modifiers).length) parts.push('  [' + Object.values(i.modifiers).join(', ') + ']')
        if (i.note) parts.push('  * ' + i.note)
        return parts.join('\n')
      }
      try {
        const printJob = printer.printKitchenTicket({
          stationRole, stationName: station,
          table: capturedTable || '-', orderType: capturedOrderType, type,
          items:       addItems.map(i => fmtItem(i, i._isAddition ? '+' : '')),
          cancelItems: cItems.map(i => fmtItem(i, '-')),
          time: now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }) + ' | ' + now.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' }),
          orderId: openBillId || 'NEW',
          settings: appSettings?.kitchen_ticket || {},
        })
        await Promise.race([printJob, new Promise((_, rej) => setTimeout(() => rej(new Error('print timeout')), 15000))])
      } catch(e) {
        console.error('[print] failed for station', station, e)
        failedStations.push(station)
      }
    }))
    if (failedStations.length) {
      alert('⚠️ Gagal cetak ke ' + failedStations.join(', ') + '\nPesanan SUDAH tersimpan di sistem.\nCek koneksi printer, atau gunakan tombol Cetak Checker.')
    }
    // Mark all cart items as sent; update _printedQty so next comparison is correct
    setCart(prev => prev.map(i => ({ ...i, _sent:true, _station: getStation(i.cat), _printedQty: i.qty })))

    // Auto-print checker to receipt printer — new items only, silent (no alert on failure)
    // Skip if disabled, or if receipt printer already fired as a station (Kasir routing) — prevents double-print
    const receiptUsedAsStation = [...allStations].some(s => {
      const mapped = ROLE_MAP[s] || ROLE_MAP[s?.charAt(0).toUpperCase() + s?.slice(1)]
      return mapped === 'receipt'
    })
    if (appSettings?.pos_behaviour?.auto_print_checker !== false && !receiptUsedAsStation) {
      const rp = printer.printers?.find(p => p.role === 'receipt')
      if (rp) {
        const _kt = appSettings?.kitchen_ticket || {}
        const _footerNote = (appSettings?.receipt?.pre_bill_note || '').trim()
        printer.printKitchenTicket({
          stationRole: 'receipt',
          stationName: 'CHECKER',
          table: capturedTable || '-',
          orderType: capturedOrderType,
          items: kitchenItems.map(i => {
            const parts = [i.qty + 'x ' + i.name]
            if (_kt.show_modifiers !== false && i.modifiers && Object.values(i.modifiers).filter(Boolean).length)
              parts.push('  [' + Object.values(i.modifiers).join(', ') + ']')
            if (_kt.show_note !== false && i.note) parts.push('  * ' + i.note)
            return parts.join('\n')
          }),
          settings: {
            ..._kt,
            show_footer: !!(_footerNote || _kt.show_footer),
            footer_text: _footerNote || _kt.footer_text || '',
          }
        }).catch(e => console.error('[auto-checker]', e.message))
      }
    }

    const stationList = [...new Set([...Object.keys(stations), ...Object.keys(cancelStations)])].join(', ')
    alert('Order dikirim ke ' + stationList + '!')
  }

  // Immediately print a cancellation ticket to the correct stations.
  // Called by handleManagerRemoveItem and handleManagerReduceQty.
  async function printCancelTicket(items) {
    if (!items?.length) return
    const catRouting = appSettings?.cat_routing || (() => { try { return JSON.parse(localStorage.getItem('pl_cat_routing')||'{}') } catch { return {} } })()
    const getStation = cat => catRouting[cat] || KITCHEN_STATIONS[cat] || 'Kitchen'
    const ROLE_MAP = { Kitchen:'kitchen', kitchen:'kitchen', Snack:'snack', snack:'snack', Bar:'bar', bar:'bar', Kasir:'receipt', kasir:'receipt' }
    const now = new Date()
    const nowTime = now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }) + ' | ' + now.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })
    const stns = {}
    items.forEach(i => { const s = getStation(i.cat); if (!stns[s]) stns[s] = []; stns[s].push(i) })
    for (const [station, stItems] of Object.entries(stns)) {
      dbWrite('kitchen_tickets', 'insert', {
        id: 'KT-' + crypto.randomUUID(), table: tableNo || orderType,
        items: stItems.map(i => ({ name:i.name, qty:i.qty })),
        time: nowTime, status: 'New', station, type: 'cancellation',
      })
      const stationRole = ROLE_MAP[station] || ROLE_MAP[station?.charAt(0).toUpperCase()+station?.slice(1)] || 'kitchen'
      try {
        await printer.printKitchenTicket({
          stationRole, stationName: station,
          table: tableNo || '-', orderType,
          type: 'cancellation', time: nowTime,
          settings: appSettings?.kitchen_ticket || {},
          cancelItems: stItems.map(i => {
            const parts = ['-' + i.qty + 'x ' + i.name]
            if (i.modifiers && Object.values(i.modifiers).filter(Boolean).length)
              parts.push('  [' + Object.values(i.modifiers).join(', ') + ']')
            if (i.note) parts.push('  * ' + i.note)
            return parts.join('\n')
          }),
        })
      } catch(e) {
        console.error('[cancel print] station', station, e)
        alert('Gagal cetak batalkan ke ' + station + ':\n' + e.message)
      }
    }
  }

  // Print table checker — items only, no pricing
  // Print Table Check — items only (no prices), goes to receipt printer as kitchen-style checker
  async function printCheck() {
    const receiptPrinter = printer.printers?.find(p=>p.role==='receipt')
    if (!receiptPrinter) { alert('No receipt printer configured'); return }
    const kt = appSettings?.kitchen_ticket || {}
    const footerNote = (appSettings?.receipt?.pre_bill_note || '').trim()
    const items = cart.map(i => {
      const parts = [i.qty + 'x ' + i.name]
      if (kt.show_modifiers !== false && i.modifiers && Object.values(i.modifiers).length)
        parts.push('  [' + Object.values(i.modifiers).join(', ') + ']')
      if (kt.show_note !== false && i.note) parts.push('  * ' + i.note)
      return parts.join('\n')
    })
    try {
      await printer.printKitchenTicket({
        stationRole: 'receipt',
        table: tableNo || orderType,
        stationName: 'CHECKER',
        orderType,
        paperSize: receiptPrinter.paperSize,
        items,
        settings: {
          ...kt,
          show_footer: !!(footerNote || kt.show_footer),
          footer_text: footerNote || kt.footer_text || '',
        }
      })
    } catch(e) { alert('Print failed: ' + e.message) }
  }

  // Print Bill / Tagihan — pre-payment bill with prices, shown to customer before they pay
  async function printBill() {
    const rs = appSettings?.receipt || {}
    const order = {
      table: tableNo || null,
      cashier: staff.name,
      staff: staff.name,
      created_at: new Date().toISOString(),
      items: cart,
      discount: discount ? Math.round(subtotal * discount / 100) : 0,
    }
    const outlet = {
      name:         rs.outlet_name  || appSettings?.outlet?.name || 'PawonLoka',
      address:      rs.address      || appSettings?.outlet?.address || '',
      phone:        rs.phone        || appSettings?.outlet?.phone || '',
      website:      rs.website      || '',
      tagline:      rs.tagline      || '',
      wifi:         rs.footer_wifi  || '',
      promo:        rs.footer_promo || '',
      social:       rs.social       || '',
      custom_line_1: rs.custom_line_1 || '',
      custom_line_2: rs.custom_line_2 || '',
      thankYou:     rs.footer_thank_you || '',
      showOrderId:  rs.show_order_id  !== false,
      showTable:    rs.show_table     !== false,
      showCashier:  rs.show_cashier   !== false,
      showDatetime: rs.show_datetime  !== false,
      showTax:      rs.show_tax       !== false,
      showService:  rs.show_service   !== false,
      show_outlet_name: rs.show_outlet_name !== false,
    }
    try {
      await printer.printPreBill(order, {
        outlet,
        tax: { enabled: TAX_RATE_LIVE > 0, rate: Math.round(TAX_RATE_LIVE * 100), label: 'PPN' },
        service: { enabled: SERVICE_RATE > 0, rate: Math.round(SERVICE_RATE * 100) },
        preBillNote:  rs.pre_bill_note  || 'Ini bukan struk pembayaran',
        preBillNote2: rs.pre_bill_note_2 || '',
      })
    } catch(e) { alert('Print failed: ' + e.message) }
  }

  // Manager PIN required to remove sent item from open bill
  async function handleManagerRemoveItem(item) {
    const pin = prompt('Masukkan PIN Manager untuk hapus item:')
    const managerPin = appSettings?.pos_behaviour?.manager_pin || '9999'
    if (pin !== managerPin) { alert('PIN salah'); return }
    const reason = prompt('Alasan hapus item ' + item.name + ':')
    if (!reason) return
    const newCart = cart.filter(i => i._key !== item._key)
    setCart(newCart)
    if (item._sent) printCancelTicket([{ ...item, qty: item._printedQty || item.qty }])
    if (openBillId) {
      if (newCart.length === 0) {
        // Last item removed — delete the empty order and reset POS
        await dbWrite('orders', 'delete', null, { id: openBillId })
        if (tableNo) await dbWrite('tables', 'update', { status:'Available', open_bill_id:null }, tableArea ? { name: tableNo, area: tableArea } : { name: tableNo })
        setOpenBillId(null); setTableNo(''); setTableArea(''); setPax(0); setCustomer(null); setDiscount(0)
      } else {
        const mapped = newCart.map(i => ({ sku:i.sku||'', name:i.name, qty:i.qty, price:i.price, modifiers:i.modifiers||{}, note:i.note||'', cat:i.cat||'', _sent:i._sent||false, _station:i._station||'', isBundle:i.isBundle||false, bundleItems:i.bundleItems||null, itemDisc:i.itemDisc||0, itemDiscLabel:i.itemDiscLabel||'' }))
        const totals = computeOrderTotals({ items: mapped, discountPct: discount, taxRate: TAX_RATE_LIVE })
        await dbWrite('orders', 'update', {
          ...totals,
          notes: (item.notes||'') + ' | REMOVE: ' + item.name + ' - ' + reason
        }, { id: openBillId })
      }
    }
  }

  // Manager PIN required to reduce qty on a sent item (partial cancellation)
  async function handleManagerReduceQty(item, delta) {
    const pin = prompt('Masukkan PIN Manager untuk kurangi ' + item.name + ':')
    const managerPin = appSettings?.pos_behaviour?.manager_pin || '9999'
    if (pin !== managerPin) { alert('PIN salah'); return }
    const reason = prompt('Alasan kurangi ' + delta + 'x ' + item.name + ':')
    if (!reason) return
    const newQty = item.qty - delta
    const newCart = newQty <= 0
      ? cart.filter(i => i._key !== item._key)
      : cart.map(i => i._key === item._key ? { ...i, qty: newQty, _printedQty: newQty } : i)
    setCart(newCart)
    if (item._sent) printCancelTicket([{ ...item, qty: delta }])
    if (openBillId) {
      if (newCart.length === 0) {
        // Cart is now empty — delete the order and reset POS
        await dbWrite('orders', 'delete', null, { id: openBillId })
        if (tableNo) await dbWrite('tables', 'update', { status:'Available', open_bill_id:null }, tableArea ? { name: tableNo, area: tableArea } : { name: tableNo })
        setOpenBillId(null); setTableNo(''); setTableArea(''); setPax(0); setCustomer(null); setDiscount(0)
      } else {
        const mapped = newCart.map(i => ({ sku:i.sku||'', name:i.name, qty:i.qty, price:i.price, modifiers:i.modifiers||{}, note:i.note||'', cat:i.cat||'', _sent:i._sent||false, _station:i._station||'', isBundle:i.isBundle||false, bundleItems:i.bundleItems||null, itemDisc:i.itemDisc||0, itemDiscLabel:i.itemDiscLabel||'' }))
        const totals = computeOrderTotals({ items: mapped, discountPct: discount, taxRate: TAX_RATE_LIVE })
        await dbWrite('orders', 'update', {
          ...totals,
          notes: (item.notes||'') + ' | REDUCE: ' + item.name + ' -' + delta + ' - ' + reason
        }, { id: openBillId })
      }
    }
  }

  async function handleCharge({ payMethod, cashGiven, usePoints, finalTotal, splitLabel, splitItems, orderNote, promoDisc = 0, promoName, multiPay }) {
    const orderCogs = cart.reduce((sum, item) => {
      const prod = products.find(p => p.sku === item.sku)
      return sum + (prod?.cogs || 0) * (item.qty || 1)
    }, 0)

    // SPLIT — record partial payment
    if (splitLabel) {
      const now = new Date()
      const mappedItems = cart.map(i => ({ sku:i.sku||'', name:i.name, qty:i.qty, price:i.price, modifiers:i.modifiers||{}, note:i.note||'', cat:i.cat||'', itemDisc:i.itemDisc||0, itemDiscLabel:i.itemDiscLabel||'' }))
      const totals = computeOrderTotals({ items: mappedItems, discountPct: discount, promoDisc, pointsValue: (usePoints||0)*100, taxRate: TAX_RATE_LIVE })
      const billTotal = totals.total
      const newSplitPaid = splitPaid + finalTotal
      const isFullyPaid = newSplitPaid >= billTotal

      if (openBillId) {
        const { data: existing } = await supabase.from('orders').select('notes,payments').eq('id', openBillId).maybeSingle()
        const prevNotes = existing?.notes || ''
        const prevPayments = existing?.payments || []
        const newNote = (prevNotes ? prevNotes + ' | ' : '') + 'SPLIT: ' + payMethod + ' Rp' + finalTotal
        const newPayments = [...prevPayments, { method: payMethod, amount: finalTotal, time: now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) }]

        const saved = isFullyPaid
          ? await dbWrite('orders', 'update', {
              status: 'Paid', pay: 'Split', notes: newNote,
              subtotal: totals.subtotal, tax: totals.tax, discount: totals.discount, total: billTotal,
              payments: newPayments, cogs: orderCogs, customer_id: customer?.id || null,
              items: mappedItems,
            }, { id: openBillId })
          : await dbWrite('orders', 'update', { notes: newNote, payments: newPayments }, { id: openBillId })

        if (!saved) {
          alert('⚠️ Gagal menyimpan pembayaran split — cek koneksi dan coba lagi. Pesanan BELUM tercatat sebagai dibayar.')
          return null
        }

        if (isFullyPaid) {
          // All paid — close the bill (independent writes, run together)
          await Promise.all([
            tableNo
              ? dbWrite('tables', 'update', { status: 'Available' }, tableArea ? { name: tableNo, area: tableArea } : { name: tableNo })
              : null,
            customer?.id
              ? dbWrite('customers', 'update', { points: (customer.points||0)+Math.floor(billTotal / 100), visits: (customer.visits||0)+1 }, { id: customer.id })
              : null,
            deductStock(cart),
          ])
        }
      }

      setSplitPaid(isFullyPaid ? 0 : newSplitPaid)

      return {
        id: openBillId || ('SPLIT-' + Date.now()),
        total: finalTotal, pay: payMethod,
        change: payMethod === 'Cash' ? (parseInt(cashGiven)||0) - finalTotal : 0,
        date: now.toISOString().slice(0,10),
        time: now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}),
        staff: staff.name, customer: customer?.name || null,
        items: splitItems || cart,
        subtotal: totals.subtotal, tax: totals.tax, discount: totals.discount,
        payments: [{ method: payMethod, amount: finalTotal }],
        _isSplit: !isFullyPaid, splitLabel, splitPaid: newSplitPaid,
        _fullyPaid: isFullyPaid,
        ...(!splitItems && { _splitAmount: finalTotal, _splitRemaining: Math.max(0, billTotal - newSplitPaid) }),
      }
    }

    // FULL PAYMENT — if open bill exists, update it to Paid instead of creating new
    if (openBillId) {
      const now = new Date()
      const mappedItems = cart.map(i => ({ sku:i.sku||'', name:i.name, qty:i.qty, price:i.price, modifiers:i.modifiers||{}, note:i.note||'', cat:i.cat||'', itemDisc:i.itemDisc||0, itemDiscLabel:i.itemDiscLabel||'' }))
      const totals = computeOrderTotals({ items: mappedItems, discountPct: discount, promoDisc, pointsValue: (usePoints||0)*100, taxRate: TAX_RATE_LIVE })
      const saved = await dbWrite('orders', 'update', {
        status: 'Paid', pay: payMethod,
        cash_given: payMethod === 'Cash' ? parseInt(cashGiven) : null,
        change: payMethod === 'Cash' ? (parseInt(cashGiven)||0) - finalTotal : null,
        subtotal: totals.subtotal, tax: totals.tax, discount: totals.discount, total: finalTotal,
        notes: orderNote || null, promo: promoName || null,
        time: now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}),
        cogs: orderCogs, customer_id: customer?.id || null,
        items: mappedItems,
      }, { id: openBillId })

      if (!saved) {
        alert('⚠️ Gagal menyimpan pembayaran — cek koneksi dan coba lagi. Pesanan BELUM tercatat sebagai dibayar.')
        return null
      }

      // Customer points, table release, and stock deduction are all independent
      // of each other once the order itself is safely saved/queued — run them
      // together instead of one after another.
      await Promise.all([
        customer
          ? dbWrite('customers', 'update', {
              points: (customer.points || 0) + Math.floor(finalTotal / 100),
              visits: (customer.visits || 0) + 1,
            }, { id: customer.id })
          : null,
        tableNo
          ? dbWrite('tables', 'update', { status: 'Available', open_bill_id: null }, tableArea ? { name: tableNo, area: tableArea } : { name: tableNo })
          : null,
        deductStock(cart),
      ])

      const fakeOrder = {
        id: openBillId, total: finalTotal, pay: payMethod,
        change: payMethod === 'Cash' ? (parseInt(cashGiven)||0) - finalTotal : 0,
        created_at: now.toISOString(),
        date: now.toISOString().slice(0,10),
        time: now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}),
        cashier: staff.name, staff: staff.name,
        table: tableNo || null,
        customer: customer?.name || null, items: cart,
        subtotal: totals.subtotal, tax: totals.tax, discount: totals.discount,
        payments: [{ method: payMethod, amount: finalTotal }],
      }
      clearCart(); setCustomer(null); setTableNo(''); setTableArea(''); setPax(0); setDiscount(0)
      setOpenBillId(null); setOrderType('Dine-in'); setDeliveryFee(0)
      setDeliveryAddr(''); setAppliedPromo(null); setSplitPaid(0)
      return fakeOrder
    }

    // NO OPEN BILL — create and immediately close a new order
    const now2 = new Date()
    const newOrderId = 'ORD-' + Date.now()
    const noBillItems = cart.map(i => ({ sku:i.sku||'', name:i.name, qty:i.qty, price:i.price, modifiers:i.modifiers||{}, note:i.note||'', cat:i.cat||'', itemDisc:i.itemDisc||0, itemDiscLabel:i.itemDiscLabel||'' }))
    const noBillTotals = computeOrderTotals({ items: noBillItems, discountPct: discount, promoDisc, pointsValue: (usePoints||0)*100, taxRate: TAX_RATE_LIVE })
    const newOrder = {
      id: newOrderId,
      items: noBillItems,
      subtotal: noBillTotals.subtotal, tax: noBillTotals.tax,
      discount: noBillTotals.discount, total: finalTotal,
      pay: payMethod, staff: staff.name,
      table: tableNo || null, table_area: tableArea || null,
      customer: customer?.name || null, customer_id: customer?.id || null,
      notes: [orderNote, promoName].filter(Boolean).join(' | ') || null,
      status: 'Paid', date: now2.toISOString().slice(0,10),
      time: now2.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }),
      payments: [{ method: payMethod, amount: finalTotal }],
      change: payMethod === 'Cash' ? Math.max(0, (parseInt(cashGiven)||0) - finalTotal) : 0,
      cogs: orderCogs,
    }
    const saved = await dbWrite('orders', 'insert', newOrder)
    if (!saved) { alert('⚠️ Gagal menyimpan order — cek koneksi dan coba lagi.'); return null }
    await Promise.all([
      customer?.id
        ? dbWrite('customers', 'update', {
            points: (customer.points||0) + (usePoints ? 0 : Math.floor(finalTotal / 100)),
            visits: (customer.visits||0) + 1,
          }, { id: customer.id })
        : null,
      deductStock(cart),
    ])
    clearCart(); setCustomer(null); setTableNo(''); setTableArea(''); setPax(0); setDiscount(0)
    setOpenBillId(null); setOrderType('Dine-in'); setDeliveryFee(0)
    setDeliveryAddr(''); setAppliedPromo(null); setSplitPaid(0)
    return newOrder
  }

  async function handleReprint(order) {
    try {
      const rs = appSettings?.receipt || {}
      const outlet = {
        name: rs.outlet_name || appSettings?.outlet?.name || 'PawonLoka',
        address: rs.address || appSettings?.outlet?.address || '',
        phone: rs.phone || appSettings?.outlet?.phone || '',
        website: rs.website || '',
        tagline: rs.tagline || '',
        thankYou: rs.footer_thank_you || 'Terima kasih!',
        wifi: rs.footer_wifi || '',
        promo: rs.footer_promo || '',
        social: rs.social || '',
        custom_line_1: rs.custom_line_1 || '',
        custom_line_2: rs.custom_line_2 || '',
        logo: rs.show_logo !== false ? (rs.logo_bw || '') : '',
        showOrderId: rs.show_order_id !== false,
        showTable: rs.show_table !== false,
        showCashier: rs.show_cashier !== false,
        showDatetime: rs.show_datetime !== false,
        showTax: rs.show_tax !== false,
        showService: rs.show_service !== false,
        showLoyalty: rs.show_loyalty !== false,
        showSku: rs.show_sku === true,
        show_outlet_name: rs.show_outlet_name !== false,
      }
      await printer.printReceipt(order, { outlet, tax: { enabled: TAX_RATE_LIVE>0, rate: Math.round(TAX_RATE_LIVE*100), label:'PPN' }, service: { enabled: SERVICE_RATE>0, rate: Math.round(SERVICE_RATE*100) } })
    } catch(e) { alert('Print failed: ' + e.message) }
  }

  if (showFloorPlan) return (
    <Suspense fallback={null}>
      <FloorPlan
        staff={staff}
        appSettings={appSettings}
        onSelectTable={handleTableSelect}
        onTakeaway={() => { clearCart(); setOrderType('Takeaway'); setTableNo(''); setTableArea(''); setShowFloorPlan(false) }}
        onDelivery={() => { clearCart(); setOrderType('Delivery'); setTableNo(''); setTableArea(''); setShowFloorPlan(false) }}
        onBack={() => setShowFloorPlan(false)}
      />
    </Suspense>
  )

  if (loading) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F4F7FA' }}>
      <div style={{ fontSize:40 }}>🏠</div>
      <div style={{ fontSize:16, fontWeight:700, color:'#0A1628', marginTop:8 }}>Loading menu...</div>
    </div>
  )

  return (
    <div style={S.app}>
      <OfflineBar pendingCount={pendingCount} syncing={syncing} onSyncNow={syncNow} />
      {printer.printError && (
        <div style={{ background:'#DC2626', color:'#fff', padding:'8px 12px', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
          <span>🖨 Print Error: {printer.printError}</span>
          <button onClick={printer.clearPrintError} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:4, padding:'2px 8px', cursor:'pointer', fontSize:11 }}>✕</button>
        </div>
      )}
      {orders.filter(o => o.bill_requested && o.status === 'Open' && !dismissedBills.has(o.id)).map(o => (
        <div key={o.id} style={{ background:'#F59E0B', color:'#fff', padding:'8px 12px', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
          <span>🔔 Meja {o.table} minta struk!</span>
          <button onClick={() => setDismissedBills(prev => new Set([...prev, o.id]))} style={{ background:'rgba(255,255,255,0.25)', border:'none', color:'#fff', borderRadius:4, padding:'2px 8px', cursor:'pointer', fontSize:11 }}>✕</button>
        </div>
      ))}
      <div style={S.header}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:18, fontWeight:900, color:'white' }}>PawonLoka</span>
          <span style={S.badge}>{staff.name} · {staff.role}</span>
          {shift && <span style={{ fontSize:11, color:'#86EFAC', fontWeight:600 }}>Shift Open</span>}
        </div>
        <div className="pos-header-row" style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
          <div style={{ position:'relative' }}>
            <button onClick={() => setShowFloorPlan(true)}
              style={{ ...S.headerBtn, background: tableNo ? '#10B981' : 'rgba(255,255,255,0.15)', color:'white', fontWeight:700 }}>
              {tableNo || 'Table'}{tableNo && pax > 0 ? ` · ${pax}px` : ''}
            </button>
            {showTablePicker && (
              <TablePicker
                current={tableNo}
                appSettings={appSettings}
                onSelect={async t => {
                  if (t.name !== tableNo) {
                    if (openBillId) {
                      await dbWrite('orders', 'update', { table: t.name, table_area: t.area || null }, { id: openBillId })
                      await dbWrite('tables', 'update', { status: 'Occupied' }, { id: t.id })
                      if (tableNo) await dbWrite('tables', 'update', { status: 'Available' }, tableArea ? { name: tableNo, area: tableArea } : { name: tableNo })
                    }
                  }
                  setTableNo(t.name); setTableArea(t.area || ''); setOrderType('Dine-in')
                }}
                onSelectOccupied={async t => {
                  const billId = t.open_bill_id
                  const cached = await offlineStore.getCache('offline_open_bill_' + billId)
                  const data = cached || await qr(
                    supabase.from('orders').select('*').eq('id', billId).maybeSingle(),
                    { cache: 'offline_open_bill_' + billId, ms: 5000 }
                  )
                  if (data) await recallFromOrder(data)
                  setOrderType('Dine-in')
                }}
                onClose={() => setShowTablePicker(false)}
              />
            )}
          </div>
          <button onClick={() => setShowOrders(true)} style={S.headerBtn}>Orders</button>
          {(() => {
            const rp = printer.printers?.find(p=>p.role==='receipt')
            if (!rp) return (
              <button onClick={()=>setShowSettings(true)}
                style={{ ...S.headerBtn, background:'rgba(239,68,68,0.3)', color:'#FCA5A5', fontWeight:700 }}>
                No Printer
              </button>
            )
            if (!rp.connected) return (
              <button onClick={async()=>{ try{ await printer.connect(rp.id) }catch(e){} }}
                style={{ ...S.headerBtn, background:'rgba(234,179,8,0.3)', color:'#FCD34D', fontWeight:700 }}>
                Reconnect
              </button>
            )
            return (
              <span style={{ ...S.headerBtn, background:'rgba(16,185,129,0.2)', color:'#6EE7B7', cursor:'default' }}>
                Printer OK
              </span>
            )
          })()}
          <button onClick={() => setShowCustomer(true)} style={{ ...S.headerBtn }} className="pos-hide-mobile">
            {customer ? customer.name : '+ Customer'}
          </button>
          <button onClick={() => { if (staff?.permissions && !staff.permissions.cash) { alert('No cash in/out permission'); return } setShowCashLog(true) }} style={S.headerBtn} className="pos-hide-mobile">Cash</button>
          <button onClick={() => setShowReprint(true)} style={{ ...S.headerBtn, color:'#86EFAC' }} className="pos-hide-mobile">🖨 Reprint</button>
          <button onClick={() => setShowVoid(true)} style={{ ...S.headerBtn, color:'#FCA5A5' }} className="pos-hide-mobile">Void</button>
          <button onClick={() => setShowShift(true)} style={S.headerBtn} className="pos-hide-mobile">Shift</button>
          <button onClick={() => setShowMobileMenu(true)} style={{ ...S.headerBtn, fontSize:20, padding:'4px 10px' }}>☰</button>
        </div>
      </div>

      <div style={S.body} className="pos-body">
        <div className="pos-menu-panel" style={{ display:"flex", flexDirection:"column", flex:1, minWidth:0, overflow:"hidden" }}>
          <MenuGrid
            products={products}
            categories={categories}
            bundles={bundles}
            onSelect={handleProductSelect}
          />
        </div>
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
          backofficeDiscounts={backofficeDiscounts}
          taxRate={TAX_RATE_LIVE}
          staffPerms={staff?.permissions}
          onPrintCheck={printCheck}
          onPrintBill={printBill}
          orderType={orderType}
          onOrderTypeChange={setOrderType}
          openBillId={openBillId}
          onManagerRemoveItem={handleManagerRemoveItem}
          onManagerReduceQty={handleManagerReduceQty}
          onAddExtra={handleAddExtra}
          onSplit={() => setSplitTotals({ subtotal, tax: Math.round(subtotal*TAX_RATE_LIVE), total: subtotal+Math.round(subtotal*TAX_RATE_LIVE) })}
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

      {showPaxModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(9,22,48,0.7)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'white', borderRadius:20, width:'100%', maxWidth:360, padding:24 }}>
            <div style={{ fontSize:18, fontWeight:900, color:'#0A1628', marginBottom:4 }}>Meja {pendingTable?.name || pendingTable}</div>
            <div style={{ fontSize:13, color:'#6B7A8D', marginBottom:20 }}>Berapa jumlah tamu?</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                <button key={n} onClick={() => setPax(n)}
                  style={{ padding:'14px 0', borderRadius:12, border:'2px solid', fontSize:16, fontWeight:800, cursor:'pointer',
                    borderColor: pax===n ? '#0A1628' : '#E2E8F0',
                    background: pax===n ? '#0A1628' : 'white',
                    color: pax===n ? 'white' : '#0A1628' }}>
                  {n}
                </button>
              ))}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setTableNo(pendingTable?.name || pendingTable); setTableArea(pendingTable?.area || ''); setShowPaxModal(false); setPendingTable(null) }}
                style={{ flex:1, padding:14, borderRadius:12, border:'1.5px solid #E2E8F0', background:'white', color:'#6B7A8D', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                Lewati
              </button>
              <button onClick={() => { setTableNo(pendingTable?.name || pendingTable); setTableArea(pendingTable?.area || ''); setShowPaxModal(false); setPendingTable(null) }}
                disabled={pax === 0}
                style={{ flex:2, padding:14, borderRadius:12, border:'none', background: pax===0 ? '#E2E8F0' : '#0A1628', color: pax===0 ? '#94A3B8' : 'white', fontSize:14, fontWeight:800, cursor: pax===0 ? 'not-allowed' : 'pointer' }}>
                {pax > 0 ? `Mulai · ${pax} Tamu` : 'Pilih jumlah tamu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modifierItem && (
        <ModifierModal
          modifierGroups={modifierItem?._mods || modifierGroups}
          product={modifierItem}
          onConfirm={handleModifierConfirm}
          onCancel={() => setModifierItem(null)}
        />
      )}

      {showCharge && (
        <ChargeModal
          cart={cart}
          totals={{ subtotal, tax: Math.round(subtotal*TAX_RATE_LIVE), total: subtotal+Math.round(subtotal*TAX_RATE_LIVE), fee: parseFloat(deliveryFee)||0, discount, splitPaid }}
          customer={customer}
          onConfirm={handleCharge}
          onClose={() => setShowCharge(false)}
          onReprint={handleReprint}
          onSuccess={async (paidOrder) => { setShowCharge(false); if (tableNo) await dbWrite('tables', 'update', { status: 'Available' }, tableArea ? { name: tableNo, area: tableArea } : { name: tableNo }); if (paidOrder && paidOrder.id) { await dbWrite('audit_logs', 'insert', { action:'payment', module:'pos', user_name:staff?.name, details: JSON.stringify({ order_id:paidOrder.id, total:paidOrder.total }) }); offlineStore.setCache('offline_open_bill_' + paidOrder.id, null) } if (paidOrder && paidOrder.id && customer?.phone) { try { sendReceipt(paidOrder, customer) } catch(e) {} } clearCart(); setCustomer(null); setTableNo(''); setTableArea(''); setOpenBillId(null); setDiscount(0); setSplitPaid(0); setAppliedPromo(null); setDeliveryFee(0); setDeliveryAddr('') }}
          appliedPromo={appliedPromo}
          onOpenPromo={() => { setShowCharge(false); setShowPromo(true) }}
          payMethods={ACTIVE_PAY_METHODS}
          backofficeDiscounts={backofficeDiscounts}
          taxRate={TAX_RATE_LIVE}
          staffPerms={staff?.permissions}
          onPrintCheck={printCheck}
          onPrintBill={printBill}
          serviceRate={SERVICE_RATE}
          bundles={bundles}
        />
      )}

      {showCustomer && (
        <CustomerSearch
          onSelect={async c => {
            setCustomer(c)
            setShowCustomer(false)
            if (openBillId) {
              await dbWrite('orders', 'update', { customer: c.name, customer_id: c.id }, { id: openBillId })
            }
          }}
          onClose={() => setShowCustomer(false)}
        />
      )}

      {showOrders && (
        <Suspense fallback={null}>
          <OrdersModal
            onClose={() => setShowOrders(false)}
            onRecall={recallFromOrder}
            onPrintKitchen={async (ticket) => { await printer.printKitchenTicket(ticket) }}
          />
        </Suspense>
      )}

      {showReprint && (
        <Suspense fallback={null}>
          <ReprintModal onClose={() => setShowReprint(false)} onReprint={handleReprint} />
        </Suspense>
      )}
      {showVoid && (
        <Suspense fallback={null}>
          <VoidModal onClose={() => setShowVoid(false)} managerPin={appSettings?.pos_behaviour?.manager_pin || '9999'} />
        </Suspense>
      )}

      {showCashLog && (
        <Suspense fallback={null}>
          <CashInOutModal staff={staff} onClose={() => setShowCashLog(false)} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <ClockInOutModal
          show={showClock}
          onClose={() => setShowClock(false)}
          staff={staff}
          staffList={staffList}
        />
      </Suspense>
      <MobileMenuSlider
        show={showMobileMenu}
        onClose={() => setShowMobileMenu(false)}
        staff={staff}
        onClockIn={() => setShowClock(true)}
        onCashLog={() => { if (staff?.permissions && !staff.permissions.cash) { alert('No cash in/out permission'); return } setShowCashLog(true) }}
        onReprint={() => { setShowMobileMenu(false); setShowReprint(true) }}
        onPrintCheck={cart.length > 0 ? () => { setShowMobileMenu(false); printCheck() } : null}
        onSettings={() => setShowSettings(true)}
        onLogout={() => { if (shift) { setShowShift(true); return } setStaff(null); setShift(null); clearCart(); setCustomer(null); setTableNo(''); setTableArea(''); setOpenBillId(null) }}
      />
      {/* Void Auth Modal */}
      {voidAuth !== null && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center' }}
          onClick={e=>e.target===e.currentTarget&&setVoidAuth(null)}>
          <div style={{ background:'#fff',borderRadius:20,padding:28,width:340,maxWidth:'90vw' }}>
            <div style={{ fontSize:17,fontWeight:800,marginBottom:16,color:'#DC2626' }}>Void Authorization</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12,fontWeight:700,color:'#6B7A8D',marginBottom:4 }}>Reason (required)</div>
              <input value={voidAuth.reason||''} onChange={e=>setVoidAuth(v=>({...v,reason:e.target.value}))}
                placeholder="e.g. Wrong order, customer cancelled..."
                style={{ width:'100%',padding:'10px 12px',borderRadius:10,border:'1.5px solid #E2E8F0',fontSize:13,boxSizing:'border-box' }} />
            </div>
            {!staff?.permissions?.void && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:12,fontWeight:700,color:'#6B7A8D',marginBottom:4 }}>Manager PIN</div>
                <input type="password" maxLength={4} value={voidAuth.pin||''} onChange={e=>setVoidAuth(v=>({...v,pin:e.target.value}))}
                  placeholder="Enter manager PIN"
                  style={{ width:'100%',padding:'10px 12px',borderRadius:10,border:'1.5px solid #E2E8F0',fontSize:18,letterSpacing:6,boxSizing:'border-box' }} />
              </div>
            )}
            <div style={{ display:'flex',gap:10,marginTop:8 }}>
              <button onClick={()=>setVoidAuth(null)}
                style={{ flex:1,padding:12,borderRadius:10,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer',fontSize:14 }}>Cancel</button>
              <button onClick={async()=>{
                if (!voidAuth.reason?.trim()) { alert('Please enter a reason'); return }
                if (!staff?.permissions?.void) {
                  const mgr = staffList.find(s => s.pin === voidAuth.pin)
                  if (!mgr?.permissions?.void) { alert('Invalid PIN or no void permission'); return }
                }
                await dbWrite('orders', 'update', { status:'void', void_reason:voidAuth.reason, voided_by:staff.name }, { id: voidAuth.orderId })
                await dbWrite('audit_logs', 'insert', { action:'void', module:'pos', user_name:staff.name, details: JSON.stringify({ order_id:voidAuth.orderId, reason:voidAuth.reason }) })
                setVoidAuth(null)
                alert('Order voided')
              }} style={{ flex:1,padding:12,borderRadius:10,border:'none',background:'#DC2626',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:14 }}>
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Settings Panel */}
      {showSettings && (
          <div onClick={e => { if(e.target===e.currentTarget) setShowSettings(false) }}
            style={{ position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', zIndex:2000, display:'flex', justifyContent:'flex-end' }}>
            <div style={{ width:'min(360px,100vw)', background:'#fff', display:'flex', flexDirection:'column', boxShadow:'-4px 0 24px rgba(9,30,66,0.2)', overflowY:'auto' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', paddingTop:'calc(16px + env(safe-area-inset-top))', background:'#0A1628', flexShrink:0 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:900, color:'white' }}>POS Settings</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:2 }}>Terminal configuration</div>
                </div>
                <button onClick={() => setShowSettings(false)}
                  style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'white', width:32, height:32, borderRadius:'50%', fontSize:18, cursor:'pointer' }}>x</button>
              </div>
              <div style={{ flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#091E42', paddingBottom:8, borderBottom:'1px solid #DFE1E6' }}>Printer & Hardware</div>
                <Suspense fallback={null}><PrinterSettings hook={printer} /></Suspense>
              </div>
            </div>
          </div>
      )}

      {showPromo && (
        <Suspense fallback={null}>
          <PromoModal
            subtotal={subtotal}
            customer={customer}
            onApply={p => { setAppliedPromo(p); setShowPromo(false) }}
            onClose={() => setShowPromo(false)}
          />
        </Suspense>
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
  menuPanel: { display:'flex', flexDirection:'column', flex:1, overflow:'hidden' },
}