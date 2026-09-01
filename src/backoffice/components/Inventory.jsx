import { useState } from "react"
import InvOverview    from "./inventory/InvOverview"
import InvIngredients from "./inventory/InvIngredients"
import InvPO          from "./inventory/InvPO"
import InvSuppliers   from "./inventory/InvSuppliers"
import InvProduction  from "./inventory/InvProduction"
import InvOpname      from "./inventory/InvOpname"
import InvWaste       from "./inventory/InvWaste"
import InvStaffConsumption from "./inventory/InvStaffConsumption"
import InvMovements   from "./inventory/InvMovements"
import InvRebuildPreview from "./inventory/InvRebuildPreview"

const TABS = [
  { id:"inv-overview",     label:"Overview",         icon:"📦" },
  { id:"inv-ingredients",  label:"Ingredients",      icon:"🧂" },
  { id:"inv-supplies",     label:"Supplies",         icon:"🧴" },
  { id:"inv-po",           label:"Purchase Orders",  icon:"🛒" },
  { id:"inv-suppliers",    label:"Suppliers",        icon:"🏭" },
  { id:"inv-production",   label:"Production",       icon:"⚙️" },
  { id:"inv-opname",       label:"Stock Opname",     icon:"🔢" },
  { id:"inv-waste",        label:"Waste Recording",  icon:"🗑" },
  { id:"inv-consumption",  label:"Staff Consumption",icon:"🍽" },
  { id:"inv-movements",    label:"Movement History", icon:"📋" },
  { id:"inv-rebuild",      label:"Rebuild Preview",  icon:"🧭" },
]

const SCREENS = {
  "inv-overview":    InvOverview,
  "inv-ingredients": InvIngredients,
  "inv-supplies":    (props) => <InvIngredients {...props} mode="supplies" />,
  "inv-po":          InvPO,
  "inv-suppliers":   InvSuppliers,
  "inv-production":  InvProduction,
  "inv-opname":      InvOpname,
  "inv-waste":       InvWaste,
  "inv-consumption": InvStaffConsumption,
  "inv-movements":   InvMovements,
  "inv-rebuild":     InvRebuildPreview,
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
      <div style={{ display:"flex", gap:4, marginBottom:20, overflowX:"auto", paddingBottom:4, flexWrap:"nowrap", WebkitOverflowScrolling:"touch", scrollbarWidth:"none" }}>
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
