
import { useState } from "react"
import "./backoffice.css"
import Dashboard    from "./components/Dashboard"
import Products     from "./components/Products"
import Categories   from "./components/Categories"
import Employees    from "./components/Employees"
import Customers    from "./components/Customers"
import Reports      from "./components/Reports"
import Settings     from "./components/Settings"
import PaymentsTax  from "./components/PaymentsTax"

const NAV = [
  { group: "Overview" },
  { id: "dashboard",   label: "Dashboard",       icon: "📊" },
  { id: "reports",     label: "Reports",          icon: "📈" },
  { group: "Menu" },
  { id: "products",    label: "Products",         icon: "🍽" },
  { id: "categories",  label: "Categories",       icon: "🏷" },
  { group: "People" },
  { id: "employees",   label: "Employees",        icon: "👤" },
  { id: "customers",   label: "Customers",        icon: "⭐" },
  { group: "Sales" },
  { id: "payments",    label: "Payments & Tax",   icon: "💳" },
  { group: "Operations" },
  { id: "floorplan",   label: "Floor Plan",       icon: "🪑" },
  { group: "System" },
  { id: "settings",    label: "Settings",         icon: "⚙️" },
]

const SCREENS = {
  dashboard:  Dashboard,
  reports:    Reports,
  products:   Products,
  categories: Categories,
  employees:  Employees,
  customers:  Customers,
  payments:   PaymentsTax,
  settings:   Settings,
}

export default function Backoffice() {
  const [active, setActive] = useState("dashboard")
  const Screen = SCREENS[active] || Dashboard

  return (
    <div className="bo-app">
      <div className="bo-sidebar">
        <div className="bo-sidebar-logo">
          <div className="bo-sidebar-logo-name">PawonLoka</div>
          <div className="bo-sidebar-logo-sub">Back Office</div>
        </div>

        <nav className="bo-nav">
          {NAV.map((n, i) => n.group
            ? <div key={i} className="bo-nav-group">{n.group}</div>
            : (
              <button key={n.id}
                className={"bo-nav-item" + (active === n.id ? " active" : "")}
                onClick={() => setActive(n.id)}>
                <span className="bo-nav-icon">{n.icon}</span>
                <span>{n.label}</span>
              </button>
            )
          )}
        </nav>

        <div className="bo-sidebar-footer">
          <a href="/" className="bo-pos-link">Open POS</a>
        </div>
      </div>

      <div className="bo-main">
        <div className="bo-topbar">
          <div className="bo-topbar-title">
            {NAV.find(n => n.id === active)?.label}
          </div>
          <div className="bo-topbar-date">
            {new Date().toLocaleDateString("id-ID", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}
          </div>
        </div>
        <div className="bo-content">
          <Screen />
        </div>
      </div>
    </div>
  )
}
