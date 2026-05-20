import { useState } from "react"
import InvOverview    from "./inventory/InvOverview"
import InvIngredients from "./inventory/InvIngredients"
import InvPO          from "./inventory/InvPO"
import InvSuppliers   from "./inventory/InvSuppliers"
import InvProduction  from "./inventory/InvProduction"
import InvOpname      from "./inventory/InvOpname"
import InvWaste       from "./inventory/InvWaste"
import InvMovements   from "./inventory/InvMovements"

const TABS = [
  { id:"inv-overview",     label:"Overview",         icon:"📦" },
  { id:"inv-ingredients",  label:"Ingredients",      icon:"🧂" },
  { id:"inv-po",           label:"Purchase Orders",  icon:"🛒" },
  { id:"inv-suppliers",    label:"Suppliers",        icon:"🏭" },
  { id:"inv-production",   label:"Production",       icon:"⚙️" },
  { id:"inv-opname",       label:"Stock Opname",     icon:"🔢" },
  { id:"inv-waste",        label:"Waste Recording",  icon:"🗑" },
  { id:"inv-movements",    label:"Movement History", icon:"📋" },
]

const SCREENS = {
  "inv-overview":    InvOverview,
  "inv-ingredients": InvIngredients,
  "inv-po":          InvPO,
  "inv-suppliers":   InvSuppliers,
  "inv-production":  InvProduction,
  "inv-opname":      InvOpname,
  "inv-waste":       InvWaste,
  "inv-movements":   InvMovements,
}

export default function Inventory({ initialTab, onNavChange }) {
  const [activeTab, setActiveTab] = useState(initialTab || "inv-overview")

  function navigate(tab) {
    setActiveTab(tab)
    if (onNavChange) onNavChange(tab)
  }

  const Screen = SCREENS[activeTab] || InvOverview

  return (
    <div>
      <div style={{ display:"flex", gap:4, marginBottom:20, overflowX:"auto", paddingBottom:4, flexWrap:"wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>navigate(t.id)}
            className={"bo-btn bo-btn-sm "+(activeTab===t.id?"bo-btn-primary":"bo-btn-ghost")}
            style={{ whiteSpace:"nowrap" }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <Screen onNav={navigate} />
    </div>
  )
}
