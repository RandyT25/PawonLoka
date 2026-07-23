import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, KITCHEN_STATIONS } from '../shared/constants'
import { computeOrderTotals, impliedDiscountPct } from '../shared/orderPricing'
import './customer.css'

// ── SVG Icons ────────────────────────────────────────────────────────────────

const IconMenu = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11l19-9-9 19-2-8-8-2z"/>
  </svg>
)
const IconCart = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
  </svg>
)
const IconBill = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>
)

// ── Modifier Sheet ───────────────────────────────────────────────────────────

function ModSheet({ product, mods, onAdd }) {
  const [selected, setSelected] = useState({})
  const [note, setNote] = useState('')
  const requiredFilled = mods.filter(m => m.required).every(m => selected[m.id])

  return (
    <div className="cust-modsheet">
      {mods.map(mod => {
        const opts = (mod.options || []).map(o => typeof o === 'string' ? { name: o, price: 0 } : o)
        return (
          <div key={mod.id} className="cust-mod-group">
            <div className="cust-mod-label">
              {mod.name}{mod.required && <span className="cust-mod-req"> *</span>}
            </div>
            <div className="cust-mod-opts">
              {opts.map(opt => (
                <button key={opt.name}
                  className={'cust-mod-opt' + (selected[mod.id] === opt.name ? ' active' : '')}
                  onClick={() => setSelected(prev => ({ ...prev, [mod.id]: opt.name }))}>
                  {opt.name}{opt.price > 0 && <span className="cust-mod-price"> +{fmt(opt.price)}</span>}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      <div className="cust-mod-group">
        <div className="cust-mod-label">Catatan</div>
        <input className="cust-mod-note" placeholder="mis. tidak pedas, tanpa bawang..."
          value={note} onChange={e => setNote(e.target.value)} />
      </div>
      <div className="cust-modsheet-footer">
        <button className="cust-btn-primary" disabled={!requiredFilled}
          onClick={() => onAdd(product, selected, note)}>
          Tambah ke Keranjang
        </button>
      </div>
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function CustomerApp({ tableId }) {
  const [tab, setTab] = useState('menu') // menu | cart | bill
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [modifierGroups, setModifierGroups] = useState([])
  const [activeCat, setActiveCat] = useState(null)

  // Cart — persisted to localStorage so refresh doesn't lose it
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`cust_cart_${tableId}`) || '[]') }
    catch { return [] }
  })

  const [openOrder, setOpenOrder] = useState(null)
  const [tableRecord, setTableRecord] = useState(null)
  const [billRequested, setBillRequested] = useState(false)
  const [ordering, setOrdering] = useState(false)
  const [orderSentToast, setOrderSentToast] = useState(false)
  const toastTimer = useRef(null)

  const [taxRate, setTaxRate] = useState(0)
  const [outletName, setOutletName] = useState('PawonLoka')
  const [logoUrl, setLogoUrl] = useState('/logo.png')
  const [modProduct, setModProduct] = useState(null)

  // Fix #root overflow:hidden (set for POS) and remove POS PWA manifest
  useEffect(() => {
    const root = document.getElementById('root')
    if (root) { root.style.overflow = 'auto'; root.style.height = 'auto' }
    const manifest = document.querySelector('link[rel="manifest"]')
    if (manifest) manifest.remove()
    return () => { if (root) { root.style.overflow = ''; root.style.height = '' } }
  }, [])

  // Persist cart to localStorage on every change
  useEffect(() => {
    localStorage.setItem(`cust_cart_${tableId}`, JSON.stringify(cart))
  }, [cart, tableId])

  useEffect(() => { load() }, [tableId])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [
        { data: tableData },
        { data: prods },
        { data: cats },
        { data: mods },
        { data: settings },
      ] = await Promise.all([
        supabase.from('tables').select('*').eq('name', tableId).maybeSingle(),
        supabase.from('products').select('*').eq('active', true),
        supabase.from('categories').select('*').order('sort'),
        supabase.from('modifier_groups').select('*'),
        supabase.from('app_settings').select('*').maybeSingle(),
      ])

      setTableRecord(tableData)
      setProducts(prods || [])
      setCategories(cats || [])
      setModifierGroups(mods || [])
      if (cats?.length) setActiveCat(cats[0].name)

      const pay = settings?.payments
      setTaxRate(pay?.tax?.enabled ? (pay.tax.rate || 0) / 100 : 0)
      setOutletName(settings?.outlet?.name || 'PawonLoka')
      if (settings?.outlet?.logo_url) setLogoUrl(settings.outlet.logo_url)

      if (tableData?.open_bill_id) {
        const { data: order } = await supabase
          .from('orders').select('*').eq('id', tableData.open_bill_id).maybeSingle()
        if (order?.status === 'Open') {
          setOpenOrder(order)
          setBillRequested(order.bill_requested || false)
        }
      }
    } catch {
      setError('Gagal memuat menu. Coba scan QR lagi.')
    } finally {
      setLoading(false)
    }
  }

  // Cart calculations
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)
  const subtotal  = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const tax       = Math.round(subtotal * taxRate)
  const total     = subtotal + tax

  const visibleProducts = activeCat ? products.filter(p => p.cat === activeCat) : products

  // Exact same modifier matching logic as the POS
  function getProductMods(product) {
    const prodCatId = categories.find(c => c.name === product.cat)?.id
    const hasLinked = Array.isArray(product.linked_modifiers) && product.linked_modifiers.length > 0
    return hasLinked
      ? modifierGroups.filter(m => product.linked_modifiers.includes(m.id))
      : modifierGroups.filter(m => {
          const hasCatFilter  = Array.isArray(m.linked_cats)     && m.linked_cats.length > 0
          const hasProdFilter = Array.isArray(m.linked_products)  && m.linked_products.length > 0
          if (!hasCatFilter && !hasProdFilter) return true
          if (hasCatFilter  && prodCatId && m.linked_cats.includes(prodCatId)) return true
          if (hasProdFilter && m.linked_products.includes(product.sku)) return true
          return false
        })
  }

  function handleTapProduct(product) {
    const mods = getProductMods(product)
    if (mods.length > 0) setModProduct({ product: { ...product, _mods: mods }, mods })
    else addToCart(product, {}, '')
  }

  function addToCart(product, modifiers, note) {
    setModProduct(null)
    const mods = product._mods || modifierGroups

    // Extra price from modifier options — same as POS
    const extraPrice = Object.entries(modifiers).reduce((sum, [modId, optName]) => {
      const mod = mods.find(m => m.id === modId)
      const opt = mod?.options?.find(o => (o.name || o) === optName)
      return sum + (opt?.price || 0)
    }, 0)

    // Display labels with price suffix — same as POS
    const displayMods = Object.fromEntries(
      Object.entries(modifiers).map(([modId, optName]) => {
        const mod = mods.find(m => m.id === modId)
        const opt = mod?.options?.find(o => (o.name || o) === optName)
        const label = opt?.price > 0 ? optName + ' +Rp ' + opt.price.toLocaleString('id-ID') : optName
        return [modId, label]
      })
    )

    const finalPrice = product.price + extraPrice
    const key = product.sku + JSON.stringify(displayMods) + (note || '')

    setCart(prev => {
      const existing = prev.find(i => i._key === key)
      if (existing) return prev.map(i => i._key === key ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, {
        _id: Date.now() + Math.random(), _key: key,
        sku: product.sku, name: product.name,
        price: finalPrice, cat: product.cat,
        qty: 1, modifiers: displayMods, note: note || '',
        icon: product.icon, image_url: product.image_url,
      }]
    })
  }

  function updateQty(_id, delta) {
    setCart(prev =>
      prev.map(i => i._id === _id ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0)
    )
  }

  function showToast() {
    setOrderSentToast(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setOrderSentToast(false), 3000)
  }

  async function handlePlaceOrder() {
    if (cart.length === 0 || ordering) return
    setOrdering(true)
    const now = new Date()
    const getStation = cat => KITCHEN_STATIONS[cat] || 'Kitchen'
    try {
      const orderItems = cart.map(i => ({
        sku: i.sku, name: i.name, qty: i.qty, price: i.price,
        modifiers: i.modifiers || {}, note: i.note || '',
        cat: i.cat || '', _sent: true, _station: getStation(i.cat),
      }))

      let orderId = openOrder?.id

      if (openOrder) {
        const merged = [...(openOrder.items || []), ...orderItems]
        // Preserve whatever discount rate was already applied to this bill (e.g. by staff via POS)
        const totals = computeOrderTotals({ items: merged, discountPct: impliedDiscountPct(openOrder), taxRate })
        await supabase.from('orders').update(totals).eq('id', openOrder.id)
        setOpenOrder(prev => ({ ...prev, ...totals }))
      } else {
        orderId = 'ORD-' + Date.now()
        const { error: e } = await supabase.from('orders').insert({
          id: orderId, items: orderItems, subtotal, tax, discount: 0, total,
          pay: '-', staff: 'Self Order', table: tableId,
          customer: null, customer_id: null, status: 'Open',
          date: now.toISOString().slice(0, 10),
          time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          cogs: 0,
        })
        if (e) throw e
        await supabase.from('tables').update({ status: 'Occupied', open_bill_id: orderId }).eq('name', tableId)
        const { data: newOrder } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle()
        setOpenOrder(newOrder)
      }

      // Kitchen tickets per station
      const stations = {}
      cart.forEach(i => { const s = getStation(i.cat); if (!stations[s]) stations[s] = []; stations[s].push(i) })
      await Promise.all(Object.entries(stations).map(([station, items]) =>
        supabase.from('kitchen_tickets').insert({
          id: 'KT-' + crypto.randomUUID(), table: tableId,
          items: items.map(i => ({ name: i.name, qty: i.qty, note: i.note || '', modifiers: i.modifiers || {} })),
          time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          status: 'New', station,
        })
      ))

      setCart([])
      localStorage.removeItem(`cust_cart_${tableId}`)
      showToast()
      setTab('bill')
    } catch {
      alert('Gagal mengirim pesanan. Silakan coba lagi.')
    } finally {
      setOrdering(false)
    }
  }

  async function handleRequestBill() {
    if (!openOrder?.id || billRequested) return
    await supabase.from('orders').update({ bill_requested: true }).eq('id', openOrder.id)
    setBillRequested(true)
  }

  const hasOrder = !!openOrder

  // ── Loading / Error ──────────────────────────────────────────────────────────

  if (loading) return (
    <div className="cust-center">
      <div className="cust-spinner" />
      <div className="cust-center-sub">Memuat menu...</div>
    </div>
  )

  if (error || !tableRecord) return (
    <div className="cust-center">
      <div className="cust-center-icon">🍽️</div>
      <div className="cust-center-title">Meja tidak ditemukan</div>
      <div className="cust-center-sub">{error || 'Silakan scan ulang QR code di meja Anda'}</div>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="cust-root">

      {/* Header */}
      <header className="cust-header">
        <img
          className="cust-logo"
          src={logoUrl}
          alt={outletName}
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
        <div className="cust-header-info">
          <div className="cust-header-title">{outletName}</div>
          <div className="cust-header-sub">Meja {tableId}</div>
        </div>
        {billRequested && (
          <div className="cust-header-badge">Struk diminta</div>
        )}
      </header>

      {/* ── MENU TAB ── */}
      {tab === 'menu' && (
        <>
          <div className="cust-cats-wrap">
            {categories.map(cat => (
              <button key={cat.name}
                className={'cust-cat-btn' + (activeCat === cat.name ? ' active' : '')}
                onClick={() => setActiveCat(cat.name)}>
                {cat.icon && <span>{cat.icon} </span>}{cat.name}
              </button>
            ))}
          </div>
          <div className="cust-products">
            {visibleProducts.map(product => (
              <button key={product.sku} className="cust-product-card" onClick={() => handleTapProduct(product)}>
                <div className="cust-product-img">
                  {product.image_url
                    ? <img src={product.image_url} alt={product.name} />
                    : <span className="cust-product-emoji">{categories.find(c=>c.name===product.cat)?.icon || product.icon || '🍽️'}</span>}
                </div>
                <div className="cust-product-body">
                  <div className="cust-product-name">{product.name}</div>
                  {product.desc && <div className="cust-product-desc">{product.desc}</div>}
                  <div className="cust-product-price">{fmt(product.price)}</div>
                </div>
                <div className="cust-product-add">+</div>
              </button>
            ))}
            {visibleProducts.length === 0 && (
              <div className="cust-empty" style={{ gridColumn: '1/-1' }}>Tidak ada menu</div>
            )}
          </div>
        </>
      )}

      {/* ── CART TAB ── */}
      {tab === 'cart' && (
        <div className="cust-tab-content">
          <div className="cust-tab-title">Keranjang</div>
          {cart.length === 0 ? (
            <div className="cust-empty-cart">
              <div className="cust-empty-cart-icon">
                <IconCart />
              </div>
              <div className="cust-empty-cart-text">Keranjang masih kosong</div>
              <button className="cust-btn-primary" onClick={() => setTab('menu')}>Lihat Menu</button>
            </div>
          ) : (
            <>
              <div className="cust-cart-list">
                {cart.map(item => (
                  <div key={item._id} className="cust-cart-row">
                    <div className="cust-cart-info">
                      <div className="cust-cart-name">{item.name}</div>
                      {item.modifiers && Object.values(item.modifiers).filter(Boolean).length > 0 && (
                        <div className="cust-cart-mods">{Object.values(item.modifiers).filter(Boolean).join(', ')}</div>
                      )}
                      {item.note && <div className="cust-cart-note">📝 {item.note}</div>}
                      <div className="cust-cart-price">{fmt(item.price * item.qty)}</div>
                    </div>
                    <div className="cust-qty-ctrl">
                      <button className="cust-qty-btn" onClick={() => updateQty(item._id, -1)}>−</button>
                      <span className="cust-qty-val">{item.qty}</span>
                      <button className="cust-qty-btn" onClick={() => updateQty(item._id, 1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="cust-cart-summary">
                {taxRate > 0 && <div className="cust-summary-row"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>}
                {taxRate > 0 && <div className="cust-summary-row"><span>Pajak ({Math.round(taxRate * 100)}%)</span><span>{fmt(tax)}</span></div>}
                <div className="cust-summary-row cust-summary-grand"><span>Total</span><span>{fmt(total)}</span></div>
              </div>
              <div className="cust-cart-actions">
                <button className="cust-btn-primary" onClick={handlePlaceOrder} disabled={ordering}>
                  {ordering ? 'Mengirim...' : `Kirim Pesanan · ${fmt(total)}`}
                </button>
                <button className="cust-btn-ghost" onClick={() => setTab('menu')}>Tambah Menu Lain</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── BILL TAB ── */}
      {tab === 'bill' && (
        <div className="cust-tab-content">
          <div className="cust-tab-title">Tagihan</div>
          {!openOrder ? (
            <div className="cust-empty-cart">
              <div className="cust-empty-cart-icon"><IconBill /></div>
              <div className="cust-empty-cart-text">Belum ada pesanan</div>
              <button className="cust-btn-primary" onClick={() => setTab('menu')}>Pesan Sekarang</button>
            </div>
          ) : (
            <>
              <div className="cust-bill-items">
                {(openOrder.items || []).map((item, idx) => (
                  <div key={idx} className="cust-bill-row">
                    <div className="cust-bill-qty">{item.qty}×</div>
                    <div className="cust-bill-name">
                      {item.name}
                      {item.modifiers && Object.values(item.modifiers).filter(Boolean).length > 0 && (
                        <div className="cust-bill-mods">{Object.values(item.modifiers).filter(Boolean).join(', ')}</div>
                      )}
                    </div>
                    <div className="cust-bill-price">{fmt(item.price * item.qty)}</div>
                  </div>
                ))}
              </div>
              <div className="cust-bill-totals">
                {taxRate > 0 && <div className="cust-summary-row"><span>Subtotal</span><span>{fmt(openOrder.subtotal)}</span></div>}
                {taxRate > 0 && <div className="cust-summary-row"><span>Pajak ({Math.round(taxRate * 100)}%)</span><span>{fmt(openOrder.tax)}</span></div>}
                <div className="cust-summary-row cust-summary-grand"><span>Total</span><span>{fmt(openOrder.total)}</span></div>
              </div>

              <div className="cust-bill-actions">
                {billRequested ? (
                  <div className="cust-requested-badge">
                    ✓ Kasir sedang dihubungi — silakan ke kasir untuk pembayaran
                  </div>
                ) : (
                  <button className="cust-btn-request" onClick={handleRequestBill}>
                    Minta Struk &amp; Bayar di Kasir
                  </button>
                )}
                <button className="cust-btn-ghost" onClick={() => setTab('menu')}>+ Tambah Pesanan</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Bottom tab nav */}
      <nav className="cust-bottom-nav">
        <button className={'cust-nav-btn' + (tab === 'menu' ? ' active' : '')} onClick={() => setTab('menu')}>
          <IconMenu />
          <span>Menu</span>
        </button>
        <button className={'cust-nav-btn' + (tab === 'cart' ? ' active' : '')} onClick={() => setTab('cart')}>
          <div className="cust-nav-icon-wrap">
            <IconCart />
            {cartCount > 0 && <span className="cust-nav-badge">{cartCount}</span>}
          </div>
          <span>Keranjang</span>
        </button>
        <button className={'cust-nav-btn' + (tab === 'bill' ? ' active' : '')} onClick={() => setTab('bill')}>
          <div className="cust-nav-icon-wrap">
            <IconBill />
            {billRequested && <span className="cust-nav-dot" />}
          </div>
          <span>Tagihan</span>
        </button>
      </nav>

      {/* Order sent toast */}
      {orderSentToast && (
        <div className="cust-toast">
          <span className="cust-toast-icon">✓</span>
          Pesanan dikirim ke dapur!
        </div>
      )}

      {/* Modifier overlay */}
      {modProduct && (
        <div className="cust-overlay" onClick={() => setModProduct(null)}>
          <div className="cust-sheet" onClick={e => e.stopPropagation()}>
            <div className="cust-sheet-hd">
              <div>
                <div className="cust-sheet-title">{modProduct.product.name}</div>
                <div className="cust-sheet-price">{fmt(modProduct.product.price)}</div>
              </div>
              <button className="cust-close-btn" onClick={() => setModProduct(null)}>✕</button>
            </div>
            <ModSheet product={modProduct.product} mods={modProduct.mods} onAdd={addToCart} />
          </div>
        </div>
      )}
    </div>
  )
}
