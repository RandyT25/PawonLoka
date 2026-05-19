import { useState } from "react"
import "./backoffice.css"
import Dashboard   from "./components/Dashboard"
import Products    from "./components/Products"
import Categories  from "./components/Categories"
import Employees   from "./components/Employees"
import Customers   from "./components/Customers"
import Reports     from "./components/Reports"
import Settings    from "./components/Settings"
import PaymentsTax from "./components/PaymentsTax"
import Promotions  from "./components/Promotions"
import FloorPlan   from "./components/FloorPlan"

const BO_PIN     = "1999"
const SESSION_KEY = "bo_auth"

const NAV = [
  { group:"Overview" },
  { id:"dashboard",  label:"Dashboard",      icon:"📊" },
  { id:"reports",    label:"Reports",         icon:"📈" },
  { group:"Menu" },
  { id:"products",   label:"Products",        icon:"🍽" },
  { id:"categories", label:"Categories",      icon:"🏷" },
  { group:"People" },
  { id:"employees",  label:"Employees",       icon:"👤" },
  { id:"customers",  label:"Customers",       icon:"⭐" },
  { group:"Sales" },
  { id:"promotions", label:"Promotions",      icon:"🎁" },
  { id:"payments",   label:"Payments & Tax",  icon:"💳" },
  { group:"Operations" },
  { id:"floorplan",  label:"Floor Plan",      icon:"🪑" },
  { group:"System" },
  { id:"settings",   label:"Settings",        icon:"⚙️" },
]

const SCREENS = {
  dashboard:  Dashboard,
  reports:    Reports,
  products:   Products,
  categories: Categories,
  employees:  Employees,
  customers:  Customers,
  promotions: Promotions,
  payments:   PaymentsTax,
  floorplan:  FloorPlan,
  settings:   Settings,
}

function BackofficeLogin({ onAuth }) {
  const [pin,   setPin]   = useState("")
  const [error, setError] = useState("")
  const [shake, setShake] = useState(false)

  function press(val) {
    if (val === "del") { setPin(p => p.slice(0,-1)); setError(""); return }
    if (pin.length >= 6) return
    const next = pin + val
    setPin(next)
    if (next.length === BO_PIN.length) setTimeout(() => check(next), 120)
  }

  function check(code) {
    if (code === BO_PIN) {
      sessionStorage.setItem(SESSION_KEY, "1")
      onAuth()
    } else {
      setShake(true); setError("Wrong PIN"); setPin("")
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div className="bo-login">
      <div className="bo-login-card" style={{ animation: shake ? "shake 0.4s ease" : "none" }}>
        <div className="bo-login-logo">🍳 PawonLoka</div>
        <div className="bo-login-sub">Back Office · Staff Access</div>
        <div className="bo-pin-dots">
          {Array.from({ length: BO_PIN.length }, (_,i) => (
            <div key={i} className={"bo-pin-dot" + (i < pin.length ? " filled" : "")} />
          ))}
        </div>
        <div className="bo-pin-err">{error}</div>
        <div className="bo-pin-pad">
          {["1","2","3","4","5","6","7","8","9","","0","del"].map((k,i) => (
            k === "" ? <div key={i} /> :
            <button key={k+i} className="bo-pin-key" onClick={() => press(k)}>
              {k === "del" ? "⌫" : k}
            </button>
          ))}
        </div>
        <a href="/" className="bo-back-link">← Back to POS</a>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}`}</style>
    </div>
  )
}

export default function Backoffice() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1")
  const [active, setActive] = useState("dashboard")

  function logout() { sessionStorage.removeItem(SESSION_KEY); setAuthed(false) }

  if (!authed) return <BackofficeLogin onAuth={() => setAuthed(true)} />

  const Screen = SCREENS[active] || Dashboard

  return (
    <div className="bo-app">
      <div className="bo-sidebar">
        <div className="bo-sidebar-logo">
          <div className="bo-sidebar-logo-name">PawonLoka</div>
          <div className="bo-sidebar-logo-sub">Back Office</div>
        </div>
        <nav className="bo-nav">
          {NAV.map((n,i) => n.group
            ? <div key={i} className="bo-nav-group">{n.group}</div>
            : (
              <button key={n.id}
                className={"bo-nav-item" + (active===n.id?" active":"")}
                onClick={() => setActive(n.id)}>
                <span className="bo-nav-icon">{n.icon}</span>
                <span>{n.label}</span>
              </button>
            )
          )}
        </nav>
        <div className="bo-sidebar-footer">
          <a href="/" className="bo-pos-link">← Open POS</a>
          <button onClick={logout} className="bo-logout">Log Out</button>
        </div>
      </div>

      <div className="bo-main">
        <div className="bo-topbar">
          <div className="bo-topbar-title">{NAV.find(n=>n.id===active)?.label}</div>
          <div className="bo-topbar-date">
            {new Date().toLocaleDateString("id-ID",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
          </div>
        </div>
        <div className="bo-content"><Screen /></div>
      </div>
    </div>
  )
}
