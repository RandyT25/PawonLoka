import { useState, useEffect, useRef, lazy, Suspense } from "react"
import { supabase } from "../lib/supabase"
import NavIcon from "./components/NavIcon"
import { setFoodCategories, setSupplyCategories } from "./lib/ingredientCategories"

import "./backoffice.css"

// Lazy-load all tab components — only the active tab is downloaded
const Dashboard        = lazy(() => import("./components/Dashboard"))
const SalesAnalysis    = lazy(() => import("./components/SalesAnalysis"))
const MenuPerformance  = lazy(() => import("./components/MenuPerformance"))
const SalesReport      = lazy(() => import("./components/SalesReport"))
const ProductReport    = lazy(() => import("./components/ProductReport"))
const TopSlowReport    = lazy(() => import("./components/TopSlowReport"))
const Products        = lazy(() => import("./components/Products"))
const Categories      = lazy(() => import("./components/Categories"))
const Modifiers       = lazy(() => import("./components/Modifiers"))
const UnitsOfMeasure  = lazy(() => import("./components/UnitsOfMeasure"))
const IngredientCategories = lazy(() => import("./components/IngredientCategories"))
const Recipes         = lazy(() => import("./components/RecipeEditor"))
const Employees       = lazy(() => import("./components/Employees"))
const Shifts          = lazy(() => import("./components/Shifts"))
const Performance     = lazy(() => import("./components/Performance"))
const Customers       = lazy(() => import("./components/Customers"))
const Loyalty         = lazy(() => import("./components/Loyalty"))
const Reports         = lazy(() => import("./components/Reports"))
const Settings        = lazy(() => import("./components/Settings"))
const PaymentsTax     = lazy(() => import("./components/PaymentsTax"))
const Promotions      = lazy(() => import("./components/Promotions"))
const Bundles         = lazy(() => import("./components/Bundles"))
const Discounts       = lazy(() => import("./components/Discounts"))
const FloorPlan       = lazy(() => import("./components/FloorPlan"))
const ReceiptDesigner        = lazy(() => import("./components/ReceiptDesigner"))
const KitchenTicketDesigner  = lazy(() => import("./components/KitchenTicketDesigner"))
const KitchenDisplay         = lazy(() => import("./components/KitchenDisplay"))
const Hardware        = lazy(() => import("./components/Hardware"))
const UsersAccess     = lazy(() => import("./components/UsersAccess"))
const AuditLog        = lazy(() => import("./components/AuditLog"))
const OrderAnomalies  = lazy(() => import("./components/OrderAnomalies"))
const Integrations    = lazy(() => import("./components/Integrations"))
const Inventory       = lazy(() => import("./components/Inventory"))
const StaffSubmissions= lazy(() => import("./components/StaffSubmissions"))
const ImportExport    = lazy(() => import("./components/ImportExport"))
const Schedule        = lazy(() => import("./components/Schedule"))
const Attendance      = lazy(() => import("./components/Attendance"))
const DepartmentsPage = lazy(() => import("./components/Departments"))
const Accounting      = lazy(() => import("./components/Accounting"))
const Rekonsiliasi    = lazy(() => import("./components/Rekonsiliasi"))
const Assets          = lazy(() => import("./components/Assets"))
const Orders          = lazy(() => import("./components/Orders"))
const MarketPrices    = lazy(() => import("./components/MarketPrices"))
const Profitability   = lazy(() => import("./components/Profitability"))
const InvStockCompare = lazy(() => import("./components/inventory/InvStockCompare"))
const InvPurchaseSpend= lazy(() => import("./components/inventory/InvPurchaseSpend"))

function useNotifications() {
  const [pending, setPending] = useState(0)
  const [notes,   setNotes]   = useState([])
  const channelRef = useRef(null)

  useEffect(() => {
    // Load initial pending count
    supabase.from("staff_submissions").select("id,type,submitted_by,submitted_at,data")
      .eq("status","pending").order("submitted_at",{ascending:false})
      .then(({data}) => {
        setPending((data||[]).length)
        setNotes((data||[]).map(s => ({
          id: s.id, type: s.type, by: s.submitted_by,
          station: s.data?.station||"",
          time: new Date(s.submitted_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}),
          read: false,
        })))
      })
    // Realtime
    channelRef.current = supabase.channel("bo_notif")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"staff_submissions"}, payload => {
        const s = payload.new
        setPending(n => n+1)
        setNotes(prev => [{
          id:s.id, type:s.type, by:s.submitted_by,
          station:s.data?.station||"",
          time:new Date(s.submitted_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}),
          read:false,
        }, ...prev])
        try {
          const ctx = new AudioContext()
          const o = ctx.createOscillator(); const g = ctx.createGain()
          o.connect(g); g.connect(ctx.destination)
          o.frequency.value=880; g.gain.value=0.2; o.start(); o.stop(ctx.currentTime+0.12)
        } catch {}
      })
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"staff_submissions"}, () => {
        supabase.from("staff_submissions").select("id").eq("status","pending")
          .then(({data}) => setPending((data||[]).length))
      })
      .subscribe()
    return () => { supabase.removeChannel(channelRef.current) }
  }, [])

  function markRead() { setNotes(n => n.map(x=>({...x,read:true}))); setPending(0) }
  return { pending, notes, markRead }
}

const TYPE_ICONS = { opname:"opname", waste:"waste", production:"production", requisition:"requisition" }
const TYPE_LABELS = { opname:"Stock Count", waste:"Waste", production:"Production", requisition:"Request" }

function BellMenu({ pending, notes, onNav, markRead }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position:"relative" }}>
      <button onClick={()=>{ setOpen(o=>!o); if(!open) markRead() }}
        style={{ position:"relative", background:"none", border:"none", cursor:"pointer", padding:"6px", borderRadius:8, color:"var(--ink3)", display:"flex", alignItems:"center", transition:"color 0.15s" }}
        onMouseEnter={e=>e.currentTarget.style.color="var(--ink)"}
        onMouseLeave={e=>e.currentTarget.style.color="var(--ink3)"}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {pending > 0 && (
          <span style={{ position:"absolute", top:2, right:2, background:"#DE350B", color:"#fff", borderRadius:20, fontSize:9, fontWeight:900, minWidth:15, height:15, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px", lineHeight:1 }}>{pending}</span>
        )}
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:"fixed", inset:0, zIndex:998 }} />
          <div style={{ position:"absolute", right:0, top:"calc(100% + 8px)", width:300, background:"#fff", borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,0.15)", border:"1px solid var(--surface3)", zIndex:999, overflow:"hidden" }}>
            <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--surface3)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:13, fontWeight:800 }}>Notifications</div>
              <button onClick={()=>{ setOpen(false); onNav("staff-submissions") }}
                style={{ fontSize:11, color:"var(--brand)", background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>View All</button>
            </div>
            <div style={{ maxHeight:320, overflowY:"auto" }}>
              {notes.length === 0 ? (
                <div style={{ padding:"24px 16px", textAlign:"center", color:"var(--ink5)", fontSize:13 }}>No pending reports</div>
              ) : notes.slice(0,10).map(n => (
                <div key={n.id} onClick={()=>{ setOpen(false); onNav("staff-submissions") }}
                  style={{ padding:"10px 16px", borderBottom:"1px solid var(--surface)", cursor:"pointer", background:n.read?"#fff":"var(--brand-lt)", display:"flex", gap:10, alignItems:"flex-start" }}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface)"}
                  onMouseLeave={e=>e.currentTarget.style.background=n.read?"#fff":"var(--brand-lt)"}>
                  <span style={{ flexShrink:0, color:"var(--brand)", opacity:0.8 }}><NavIcon id={TYPE_ICONS[n.type]||"default"} /></span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700 }}>{TYPE_LABELS[n.type]||n.type} — {n.by}</div>
                    <div style={{ fontSize:11, color:"var(--ink4)" }}>{n.station && n.station+" · "}{n.time}</div>
                  </div>
                  {!n.read && <span style={{ width:8, height:8, borderRadius:"50%", background:"var(--brand)", flexShrink:0, marginTop:4 }} />}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}


const SESSION_KEY = "bo_auth"


const NAV = [
  { group:"Overview" },
  { id:"dashboard" },
  { id:"sales-analysis",    label:"Sales Analysis" },
  { id:"menu-performance",  label:"Menu Performance" },
  { id:"sales-report",      label:"Sales Report" },
  { id:"product-report",    label:"Product Report" },
  { id:"top-slow",          label:"Top & Slow Moving" },
  { id:"reports",           label:"Reports & Export" },
  { group:"Finance" },
  { id:"accounting" },
  { id:"rekonsiliasi" },
  { id:"assets" },
  { group:"Menu" },
  { id:"products" },
  { id:"categories" },
  { id:"modifiers" },
  { id:"recipes",           label:"Recipes & COGS" },
  { id:"market-prices",     label:"Market Prices" },
  { id:"profitability" },
  { group:"Inventory" },
  { id:"inv-overview",      label:"Overview" },
  { id:"inv-daily-recon",   label:"Daily Stock Audit" },
  { id:"inv-ingredients",   label:"Ingredients" },
  { id:"inv-supplies",      label:"Supplies" },
  { id:"inv-po",            label:"Purchase Orders" },
  { id:"inv-suppliers",     label:"Suppliers" },
  { id:"inv-production",    label:"Production" },
  { id:"inv-opname",        label:"Stock Opname" },
  { id:"inv-waste",         label:"Waste Recording" },
  { id:"inv-movements",      label:"Movement History" },
  { id:"inv-stock-compare", label:"Stock vs Purchase" },
  { id:"inv-purchase-spend", label:"Top Purchases" },
  { id:"units-of-measure", label:"Units of Measure" },
  { id:"item-categories", label:"Item Categories" },
  { id:"staff-submissions", label:"Staff Reports" },
  { group:"People" },
  { id:"employees" },
  { id:"departments" },
  { id:"shifts" },
  { id:"schedule" },
  { id:"attendance" },
  { id:"performance" },
  { id:"customers" },
  { id:"loyalty",           label:"Loyalty & Vouchers" },
  { group:"Sales" },
  { id:"promotions" },
  { id:"bundles",           label:"Bundle Packages" },
  { id:"discounts" },
  { id:"payments",          label:"Payments & Tax" },
  { group:"Operations" },
  { id:"floorplan",         label:"Floor Plan" },
  { id:"kitchen-display",   label:"Kitchen Display" },
  { group:"System" },
  { id:"import-export",     label:"Import / Export" },
  { id:"settings" },
  { id:"receipt-designer",         label:"Receipt Designer" },
  { id:"kitchen-ticket-designer",  label:"Kitchen Ticket Designer" },
  { id:"hardware" },
  { id:"users-access",      label:"Users & Access" },
  { id:"audit-log",         label:"Audit Log" },
  { id:"order-anomalies",   label:"Order Anomalies" },
  { id:"integrations" },
]

const NAV_LABELS = {
  dashboard: "Dashboard", "sales-analysis": "Sales Analysis",
  "menu-performance": "Menu Performance", "sales-report": "Sales Report",
  "product-report": "Product Report", "top-slow": "Top & Slow Moving",
  reports: "Reports & Export", accounting: "Accounting",
  rekonsiliasi: "Rekonsiliasi", assets: "Assets", products: "Products",
  categories: "Categories", modifiers: "Modifiers",
  "units-of-measure": "Units of Measure",
  "item-categories": "Item Categories",
  recipes: "Recipes & COGS", "market-prices": "Market Prices",
  profitability: "Profitability", "inv-overview": "Overview",
  "inv-daily-recon": "Daily Stock Audit",
  "inv-ingredients": "Ingredients", "inv-supplies": "Supplies", "inv-po": "Purchase Orders",
  "inv-suppliers": "Suppliers", "inv-production": "Production",
  "inv-opname": "Stock Opname", "inv-waste": "Waste Recording",
  "inv-consumption": "Staff Consumption",
  "inv-movements": "Movement History", "inv-stock-compare": "Stock vs Purchase",
  "inv-purchase-spend": "Top Purchases",
  "staff-submissions": "Staff Reports",
  employees: "Employees", departments: "Departments",
  shifts: "Shifts", schedule: "Schedule",
  attendance: "Attendance", performance: "Performance",
  customers: "Customers", loyalty: "Loyalty & Vouchers",
  promotions: "Promotions", bundles: "Bundle Packages",
  discounts: "Discounts", payments: "Payments & Tax",
  floorplan: "Floor Plan", "kitchen-display": "Kitchen Display",
  "import-export": "Import / Export", settings: "Settings",
  "receipt-designer": "Receipt Designer",
  "kitchen-ticket-designer": "Kitchen Ticket Designer",
  hardware: "Hardware", "users-access": "Users & Access",
  "audit-log": "Audit Log", "order-anomalies": "Order Anomalies", integrations: "Integrations",
}

const SCREENS = {
  dashboard:          Dashboard,
  "sales-analysis":   SalesAnalysis,
  "menu-performance": MenuPerformance,
  "sales-report":     SalesReport,
  "product-report":   ProductReport,
  "top-slow":         TopSlowReport,
  reports:            Reports,
  accounting:        Accounting,
  rekonsiliasi:      Rekonsiliasi,
  assets:            Assets,
  products:          Products,
  categories:        Categories,
  modifiers:         Modifiers,
  "units-of-measure": UnitsOfMeasure,
  "item-categories": IngredientCategories,
  recipes:           Recipes,
  "inv-overview":    (props) => <Inventory {...props} initialTab="inv-overview" />,
  "inv-daily-recon": (props) => <Inventory {...props} initialTab="inv-daily-recon" />,
  "inv-ingredients": (props) => <Inventory {...props} initialTab="inv-ingredients" />,
  "inv-supplies":    (props) => <Inventory {...props} initialTab="inv-supplies" />,
  "inv-po":          (props) => <Inventory {...props} initialTab="inv-po" />,
  "inv-suppliers":   (props) => <Inventory {...props} initialTab="inv-suppliers" />,
  "inv-production":  (props) => <Inventory {...props} initialTab="inv-production" />,
  "inv-opname":      (props) => <Inventory {...props} initialTab="inv-opname" />,
  "inv-waste":       (props) => <Inventory {...props} initialTab="inv-waste" />,
  "inv-consumption": (props) => <Inventory {...props} initialTab="inv-consumption" />,
  "inv-movements":      (props) => <Inventory {...props} initialTab="inv-movements" />,
  "inv-stock-compare":  InvStockCompare,
  "inv-purchase-spend": InvPurchaseSpend,
  "staff-submissions":  StaffSubmissions,
  "import-export":      ImportExport,
  employees:         Employees,
  departments:       DepartmentsPage,
  shifts:            Shifts,
  orders:            Orders,
  'market-prices':   MarketPrices,
  profitability:     Profitability,
  schedule:          Schedule,
  attendance:        Attendance,
  performance:       Performance,
  customers:         Customers,
  loyalty:           Loyalty,
  promotions:        Promotions,
  bundles:           Bundles,
  discounts:         Discounts,
  payments:          PaymentsTax,
  floorplan:         FloorPlan,
  settings:          Settings,
  "receipt-designer":         ReceiptDesigner,
  "kitchen-ticket-designer":  KitchenTicketDesigner,
  "kitchen-display":          KitchenDisplay,
  hardware:          Hardware,
  "users-access":    UsersAccess,
  "audit-log":       AuditLog,
  "order-anomalies": OrderAnomalies,
  integrations:      Integrations,
}

function BackofficeLogin({ onAuth }) {
  const [pin,     setPin]     = useState("")
  const [error,   setError]   = useState("")
  const [shake,   setShake]   = useState(false)
  const [loading, setLoading] = useState(false)

  function press(val) {
    if (val === "del") { setPin(p => p.slice(0,-1)); setError(""); return }
    if (val === "ok") { if (pin.length >= 4) check(pin); return }
    if (pin.length >= 4) return
    const next = pin + val
    setPin(next)
    if (next.length === 4) check(next)
  }

  async function check(code) {
    if (!code || code.length < 4) return
    setLoading(true)
    const { data } = await supabase.from("staff").select("id,name,role,permissions").eq("pin", code).maybeSingle()
    setLoading(false)
    if (!data) { fail("PIN tidak ditemukan"); return }
    if (data.permissions?.backoffice !== true) { fail("Akses backoffice tidak diizinkan"); return }
    sessionStorage.setItem(SESSION_KEY, "1")
    sessionStorage.setItem("bo_staff", JSON.stringify({ id:data.id, name:data.name, role:data.role, permissions:data.permissions }))
    onAuth()
  }

  function fail(msg) {
    setShake(true); setError(msg); setPin("")
    setTimeout(() => setShake(false), 500)
  }

  return (
    <div className="bo-login">
      <div className="bo-login-card" style={{ animation:shake?"shake 0.4s ease":"none" }}>
        <img src="/logo-backoffice.png" alt="PawonLoka"
          onError={e=>e.target.style.display="none"}
          style={{ width:80, height:80, objectFit:"contain", borderRadius:16, marginBottom:8 }} />
        <div className="bo-login-logo">PawonLoka</div>
        <div className="bo-login-sub">Back Office · Masukkan PIN Anda</div>
        <div className="bo-pin-dots">
          {Array.from({length:4},(_,i)=>(
            <div key={i} className={"bo-pin-dot"+(i<pin.length?" filled":"")} />
          ))}
        </div>
        <div className="bo-pin-err">{loading ? "Memeriksa..." : error}</div>
        <div className="bo-pin-pad">
          {["1","2","3","4","5","6","7","8","9","del","0","ok"].map((k,i)=>(
            <button key={k+i} className={"bo-pin-key"+(k==="ok"?" bo-pin-ok":"")}
              onClick={()=>press(k)}
              style={k==="ok"?{background:"var(--brand)",color:"#fff",fontWeight:900}:{}}>
              {k==="del"?"⌫":k==="ok"?"▶":k}
            </button>
          ))}
        </div>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}`}</style>
    </div>
  )
}

function pageFromPath() {
  const segment = window.location.pathname.replace(/\/+$/, "").replace(/^\/backoffice\/?/, "")
  return segment || sessionStorage.getItem("bo_active") || "dashboard"
}

const KDS_IDS = new Set(["kitchen-display"])

function getStoredStaff() {
  try { return JSON.parse(sessionStorage.getItem("bo_staff") || "null") } catch { return null }
}

export default function Backoffice() {
  const [authed, setAuthed] = useState(()=>sessionStorage.getItem(SESSION_KEY)==="1")
  const [active, setActive] = useState(pageFromPath)
  const [kdsEnabled, setKdsEnabled] = useState(true)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [boStaff, setBoStaff] = useState(getStoredStaff)

  const { pending, notes, markRead } = useNotifications(navTo)

  function navTo(id) {
    setActive(id)
    sessionStorage.setItem("bo_active", id)
    history.pushState(null, "", "/backoffice/" + id)
  }

  // Load appSettings and subscribe for realtime KDS toggle
  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase.from("app_settings").select("pos_behaviour").eq("id","main").maybeSingle()
      const enabled = data?.pos_behaviour?.kitchen_display !== false
      setKdsEnabled(enabled)
      if (!enabled && KDS_IDS.has(pageFromPath())) {
        setActive("dashboard")
        sessionStorage.setItem("bo_active", "dashboard")
        history.replaceState(null, "", "/backoffice/dashboard")
      }
    }
    loadSettings()
    const ch = supabase.channel("bo_app_settings")
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"app_settings", filter:"id=eq.main" }, payload => {
        const enabled = payload.new?.pos_behaviour?.kitchen_display !== false
        setKdsEnabled(enabled)
        if (!enabled && KDS_IDS.has(sessionStorage.getItem("bo_active") || "")) {
          setActive("dashboard")
          sessionStorage.setItem("bo_active", "dashboard")
          history.replaceState(null, "", "/backoffice/dashboard")
        }
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  // Register the live food/supply category lists so isSupplyCategory/isFoodCategory
  // classify correctly everywhere (Dashboard, InvOverview, RecipeEditor, InvIngredients)
  // as soon as the backoffice loads, not just after visiting the Item Categories page.
  useEffect(() => {
    supabase.from("app_settings").select("food_categories,supply_categories").eq("id","main").maybeSingle()
      .then(({data}) => {
        if (data?.food_categories?.length) setFoodCategories(data.food_categories.map(c=>c.name))
        if (data?.supply_categories?.length) setSupplyCategories(data.supply_categories.map(c=>c.name))
      })
  }, [])

  // Back / Forward browser buttons
  useEffect(() => {
    function onPop() { setActive(pageFromPath()) }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  useEffect(() => {
    supabase.from("ingredients").select("id,stock,min_stock")
      .then(({ data }) => {
        if (!data) return
        setLowStockCount(data.filter(i => (i.stock <= 0) || (i.min_stock > 0 && i.stock <= i.min_stock)).length)
      })
  }, [])

  useEffect(() => {
    const el = document.querySelector(".bo-nav-item.active")
    if (el) el.scrollIntoView({ block:"nearest", behavior:"instant" })
  }, [])

  const boModules = boStaff?.permissions?.bo_modules || {}
  const isOwner   = !boStaff || boStaff.role === "Owner"
  const visibleNav = NAV.filter(n => {
    if (!n.id) return true
    if (!kdsEnabled && KDS_IDS.has(n.id)) return false
    if (isOwner) return true
    return boModules[n.id] !== false
  })

  const [mobileSidebar, setMobileSidebar] = useState(false)

  function logout() {
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem("bo_staff")
    setBoStaff(null)
    setAuthed(false)
  }

  if (!authed) return <BackofficeLogin onAuth={()=>{ setBoStaff(getStoredStaff()); setAuthed(true) }} />

  const Screen = SCREENS[active] || Dashboard

  return (
    <div className="bo-app">
      <div className="bo-sidebar">
        <div className="bo-sidebar-logo">
          <img src="/logo-backoffice.png" alt="PawonLoka" onError={e=>{e.target.style.display="none"}} style={{ width:56, height:56, borderRadius:12, objectFit:"contain", marginBottom:6, display:"block", background:"#fff", padding:4 }} />
          <div className="bo-sidebar-logo-name">PawonLoka</div>
          <div className="bo-sidebar-logo-sub">Back Office</div>
        </div>
        <nav className="bo-nav">
          {visibleNav.map((n,i)=>n.group
            ?<div key={i} className="bo-nav-group">{n.group}</div>
            :(
              <button key={n.id} className={"bo-nav-item"+(active===n.id?" active":"")} onClick={()=>navTo(n.id)}>
                <span className="bo-nav-icon"><NavIcon id={n.id} /></span>
                <span>{n.label || NAV_LABELS[n.id] || n.id}</span>
                {n.id === "inv-overview" && lowStockCount > 0 && (
                  <span style={{ marginLeft:"auto", background:"var(--amber)", color:"#fff", fontSize:10, fontWeight:800, borderRadius:10, padding:"1px 6px", lineHeight:"16px" }}>{lowStockCount}</span>
                )}
              </button>
            )
          )}
        </nav>
        <div className="bo-sidebar-footer">

          <button onClick={logout} className="bo-logout">Log Out</button>
        </div>
      </div>
      <div className="bo-main">
        <div className="bo-topbar">
          <button className="bo-hamburger" onClick={()=>setMobileSidebar(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <img src="/logo-backoffice.png" alt="" className="bo-topbar-logo" onError={e=>e.target.style.display="none"} />
          <div className="bo-topbar-title">{NAV_LABELS[active] || active}</div>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginLeft:"auto" }}>
            <div className="bo-topbar-date">{new Date().toLocaleDateString("id-ID",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</div>
            <BellMenu pending={pending} notes={notes} onNav={navTo} markRead={markRead} />
          </div>
        </div>
        <div className="bo-content">
          <Suspense fallback={<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"60vh",color:"#6B778C",fontSize:14}}>Loading...</div>}>
            <Screen onNavChange={navTo} />
          </Suspense>
        </div>
        {/* Mobile sidebar overlay */}
        {mobileSidebar && (
          <div onClick={()=>setMobileSidebar(false)}
            style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex" }}>
            <div onClick={e=>e.stopPropagation()}
              style={{ width:280,height:"100%",background:"#1a1a2e",display:"flex",flexDirection:"column",overflowY:"auto",WebkitOverflowScrolling:"touch" }}>
              {/* Header */}
              <div style={{ padding:"20px 16px 12px",borderBottom:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:12 }}>
                <img src="/logo-backoffice.png" alt="" onError={e=>e.target.style.display="none"} style={{ width:36,height:36,borderRadius:8,objectFit:"contain" }} />
                <div>
                  <div style={{ fontSize:15,fontWeight:900,color:"#fff" }}>PawonLoka</div>
                  <div style={{ fontSize:10,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:1 }}>Back Office</div>
                </div>
                <button onClick={()=>setMobileSidebar(false)}
                  style={{ marginLeft:"auto",background:"none",border:"none",color:"rgba(255,255,255,0.5)",fontSize:22,cursor:"pointer",padding:4 }}>✕</button>
              </div>
              {/* Nav items */}
              <nav style={{ flex:1,padding:"8px 8px",overflowY:"auto" }}>
                {visibleNav.map((n,i) => n.group
                  ? <div key={i} style={{ fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.25)",letterSpacing:"1.5px",textTransform:"uppercase",padding:"14px 16px 4px",marginTop:4 }}>{n.group}</div>
                  : <button key={n.id}
                      onClick={()=>{ navTo(n.id); setMobileSidebar(false) }}
                      style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,
                        color:active===n.id?"#fff":"rgba(255,255,255,0.55)",
                        background:active===n.id?"rgba(0,102,255,0.25)":"none",
                        border:"none",cursor:"pointer",width:"100%",textAlign:"left",
                        fontSize:13,fontWeight:active===n.id?700:400,marginBottom:1 }}>
                      <span style={{ width:20,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}><NavIcon id={n.id} /></span>
                      <span>{n.label || NAV_LABELS[n.id] || n.id}</span>
                      {n.id === "inv-overview" && lowStockCount > 0 && (
                        <span style={{ marginLeft:"auto", background:"#F59E0B", color:"#fff", fontSize:10, fontWeight:800, borderRadius:10, padding:"1px 6px", lineHeight:"16px" }}>{lowStockCount}</span>
                      )}
                    </button>
                )}
              </nav>
              {/* Footer */}
              <div style={{ padding:"12px 8px",borderTop:"1px solid rgba(255,255,255,0.08)" }}>
                <button onClick={logout} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,color:"rgba(255,255,255,0.5)",background:"none",border:"none",cursor:"pointer",width:"100%",fontSize:13 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
