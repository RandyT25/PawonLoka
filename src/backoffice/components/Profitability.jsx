import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import * as XLSX from "xlsx"

const fmt  = n => "Rp " + Number(Math.round(n||0)).toLocaleString("id-ID")
const fmtP = n => (Number(n||0)).toLocaleString("id-ID",{minimumFractionDigits:1,maximumFractionDigits:1}) + "%"

function statusLabel(cogsP, type, isConsignment) {
  if (isConsignment || type === "Consignment") return { text:"Pure Profit", color:"#6554C0", bg:"#EEF2FF" }
  if (cogsP <= 30)  return { text:"Sangat Baik", color:"var(--green)", bg:"var(--green-lt)" }
  if (cogsP <= 35)  return { text:"On Target", color:"#00875A", bg:"#E3FCEF" }
  if (cogsP <= 40)  return { text:"Perlu Pantau", color:"var(--amber)", bg:"#FFF7E6" }
  if (type === "Extra" && cogsP > 50) return { text:"Too High", color:"var(--red)", bg:"var(--red-lt)" }
  return { text:"Naik Harga!", color:"var(--red)", bg:"var(--red-lt)" }
}

const UNIT_TO_BASE = {
  gr:1,g:1,kg:1000,ml:1,mL:1,L:1000,Galon:19000,
  pcs:1,butir:1,biji:1,buah:1,lembar:1,ekor:1,Ekor:1,
  tsp:5,tbsp:15,cup:240,portion:1,porsi:1,slice:1,
  bungkus:1,pack:1,sachet:1,ikat:1,botol:1,
}
const toBase = (qty, unit) => (Number(qty)||0) * (UNIT_TO_BASE[unit]||1)

export default function Profitability() {
  const [products,   setProducts]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [target,     setTarget]     = useState(() => Number(localStorage.getItem("pl_target_food_cost")) || 35)
  const [targetInput,setTargetInput]= useState("")
  const [catFilter,  setCatFilter]  = useState("")
  const [statusFilter,setStatusFilter] = useState("")
  const [search,     setSearch]     = useState("")
  const [editPrices, setEditPrices] = useState({}) // sku -> new price
  const [saving,     setSaving]     = useState(false)
  const [syncing,    setSyncing]    = useState(false)

  useEffect(() => {
    load()
    // COGS can change in another tab (e.g. marking a PO Paid) while this page stays mounted
    // in the background — refetch when it becomes visible again instead of only on mount.
    const onVisible = () => { if (document.visibilityState === "visible") load() }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [])

  async function load() {
    setLoading(true)
    const [prodRes, { data: settings }] = await Promise.all([
      supabase.from("products").select("sku,name,cat,price,cogs,active,needs_recalc").eq("active",true).order("cat").order("name"),
      supabase.from("profitability_settings").select("*").eq("id","main").maybeSingle()
    ])
    // Falls back to a select without needs_recalc if that column hasn't been migrated onto
    // this environment yet — PostgREST rejects the whole request over one unknown column, so
    // without this the entire product list would silently come back empty until it's added.
    let prods = prodRes.data
    if (prodRes.error) {
      const retry = await supabase.from("products").select("sku,name,cat,price,cogs,active").eq("active",true).order("cat").order("name")
      prods = retry.data
    }
    setProducts(prods||[])
    if (settings?.target_food_cost) {
      setTarget(settings.target_food_cost)
      localStorage.setItem("pl_target_food_cost", String(settings.target_food_cost))
    }
    setLoading(false)
  }

  async function saveTarget(val) {
    const n = Math.max(1, Math.min(99, Number(val) || 35))
    setTarget(n)
    localStorage.setItem("pl_target_food_cost", String(n))
    try {
      await supabase.from("profitability_settings").upsert({ id:"main", target_food_cost: n })
    } catch(e) { /* persisted in localStorage */ }
  }

  async function applyPriceChanges() {
    const entries = Object.entries(editPrices).filter(([,v]) => v && parseFloat(v) > 0)
    if (!entries.length) { alert("No price changes to apply"); return }
    if (!confirm("Apply " + entries.length + " price changes to products?")) return
    setSaving(true)
    for (const [sku, price] of entries) {
      await supabase.from("products").update({ price: parseFloat(price) }).eq("sku", sku)
    }
    setEditPrices({})
    await load()
    setSaving(false)
    alert("Prices updated successfully")
  }

  async function syncCogs() {
    if (!confirm("Recalculate COGS for all products from their recipes? This will overwrite existing COGS values.")) return
    setSyncing(true)
    const [{ data: recipes }, { data: ingredients }, { data: subRecipes }, { data: mps }] = await Promise.all([
      supabase.from("recipes").select("productSku,ingredient_id,qty,unit"),
      supabase.from("ingredients").select("id,unit,cost_per_unit"),
      supabase.from("sub_recipes").select("id,unit,cost_per_unit"),
      supabase.from("market_prices").select("ingredient_id,price,conv_qty").order("checked_at", { ascending: false }),
    ])
    const mpMap = {}
    ;(mps||[]).forEach(p => { if (!mpMap[p.ingredient_id]) mpMap[p.ingredient_id] = p.price / (p.conv_qty||1) })
    const lookup = {}
    ;(ingredients||[]).forEach(i => { lookup[i.id] = { unit:i.unit||"gr", cost_per_unit:i.cost_per_unit||0, market_cost:mpMap[i.id]||0 } })
    ;(subRecipes||[]).forEach(s => { lookup[s.id] = { unit:s.unit||"gr", cost_per_unit:s.cost_per_unit||0, market_cost:0 } })
    const byProduct = {}
    ;(recipes||[]).forEach(r => { if (r.productSku && r.ingredient_id) { if (!byProduct[r.productSku]) byProduct[r.productSku]=[]; byProduct[r.productSku].push(r) } })
    let updated = 0
    for (const [sku, lines] of Object.entries(byProduct)) {
      const cogs = lines.reduce((sum, row) => {
        const ing = lookup[row.ingredient_id]
        const c = ing?.cost_per_unit || ing?.market_cost || 0
        if (!c) return sum
        return sum + (c / (UNIT_TO_BASE[ing.unit]||1)) * toBase(row.qty, row.unit)
      }, 0)
      const rounded = Math.round(cogs)
      if (rounded > 0) { await supabase.from("products").update({ cogs: rounded }).eq("sku", sku); updated++ }
    }
    await load()
    setSyncing(false)
    alert(`COGS synced for ${updated} products`)
  }

  function exportExcel() {
    const rows = filtered.map((p,idx) => {
      const cpp   = p.cogs || 0
      const price = p.price || 0
      const cogsP = price > 0 ? (cpp / price * 100) : 0
      const newPrice = parseFloat(editPrices[p.sku]) || price
      const newCogsP = newPrice > 0 ? (cpp / newPrice * 100) : 0
      const roundTo  = cpp < 2000 ? 500 : cpp < 10000 ? 1000 : 5000
      const recPrice = cpp > 0 && cogsP > target ? Math.ceil((cpp / (target / 100)) / roundTo) * roundTo : 0
      return {
        "No": idx+1, "Nama Menu": p.name, "Category": p.cat||"",
        "HPP (Rp)": cpp, "Harga Sekarang (Rp)": price,
        "COGS % Sekarang": fmtP(cogsP),
        "Profit Sekarang (Rp)": price - cpp,
        "Harga Baru (Rp)": newPrice,
        "COGS % Baru": fmtP(newCogsP),
        "Delta COGS": fmtP(newCogsP - cogsP),
        "Profit Baru (Rp)": newPrice - cpp,
        ["Recommended @ "+target+"%"]: recPrice,
        "Status": statusLabel(cogsP, p.cat, p.is_consignment).text
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Profitability")
    XLSX.writeFile(wb, "menu_profitability.xlsx")
  }

  const cats = [...new Set(products.map(p=>p.cat).filter(Boolean))]

  const filtered = products.filter(p => {
    const cpp   = p.cogs || 0
    const price = p.price || 0
    const cogsP = price > 0 ? (cpp / price * 100) : 0
    const st    = statusLabel(cogsP, p.cat, p.is_consignment)
    const matchCat    = !catFilter || p.cat === catFilter
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || st.text === statusFilter
    return matchCat && matchSearch && matchStatus
  })

  // Summary stats
  const withCogs   = products.filter(p => p.cogs > 0)
  const avgCogs    = withCogs.length ? withCogs.reduce((s,p) => s + (p.cogs/p.price*100), 0) / withCogs.length : 0
  const danger     = products.filter(p => p.price > 0 && (p.cogs/p.price*100) > 40).length
  const onTarget   = products.filter(p => p.price > 0 && (p.cogs/p.price*100) <= target).length
  const pendingChanges = Object.values(editPrices).filter(v => v && parseFloat(v) > 0).length

  return (
    <div style={{ padding:24, maxWidth:1200, margin:"0 auto" }}>
      <div style={{ marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:900, color:"var(--ink1)", marginBottom:4 }}>Menu Profitability Model</div>
          <div style={{ fontSize:13, color:"var(--ink4)" }}>Analyze menu pricing, COGS, and profitability targets</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", background:"#fff", borderRadius:10, border:"1px solid #E8ECF0", flexWrap:"wrap" }}>
            <span style={{ fontSize:12, fontWeight:700, color:"var(--ink4)" }}>Target Food Cost:</span>
            {[25,30,35,40,45].map(t => (
              <button key={t} onClick={()=>saveTarget(t)}
                className={"bo-btn bo-btn-sm "+(target===t?"bo-btn-primary":"bo-btn-ghost")}>
                {t}%
              </button>
            ))}
            <div style={{ display:"flex", alignItems:"center", gap:4, marginLeft:4 }}>
              <input
                type="number" min={1} max={99}
                value={targetInput !== "" ? targetInput : ""}
                placeholder={target + "%"}
                onChange={e => setTargetInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && targetInput) { saveTarget(targetInput); setTargetInput("") } }}
                onBlur={() => { if (targetInput) { saveTarget(targetInput); setTargetInput("") } }}
                style={{ width:54, padding:"4px 8px", borderRadius:8, border:"1.5px solid var(--surface3)", fontSize:12, textAlign:"center", outline:"none" }}
              />
              <span style={{ fontSize:11, color:"var(--ink4)", fontWeight:700 }}>%</span>
            </div>
          </div>
          <button onClick={syncCogs} disabled={syncing} className="bo-btn bo-btn-ghost">{syncing ? "Syncing..." : "Sync COGS"}</button>
          <button onClick={exportExcel} className="bo-btn bo-btn-ghost">Export Excel</button>
          {pendingChanges > 0 && (
            <button onClick={applyPriceChanges} disabled={saving}
              className="bo-btn bo-btn-primary" style={{ background:"var(--green)" }}>
              {saving ? "Saving..." : "Apply " + pendingChanges + " Price Changes"}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:20 }}>
        {[
          ["Total Menu", products.length, "var(--brand)"],
          ["With COGS", withCogs.length, "#6554C0"],
          ["Avg COGS %", fmtP(avgCogs), avgCogs > 40 ? "var(--red)" : avgCogs > 35 ? "var(--amber)" : "var(--green)"],
          ["On Target", onTarget, "var(--green)"],
          ["Need Attention", danger, "var(--red)"],
        ].map(([l,v,c]) => (
          <div key={l} style={{ background:"#fff", borderRadius:12, padding:"14px 18px", border:"1px solid #E8ECF0" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--ink4)", marginBottom:4, textTransform:"uppercase" }}>{l}</div>
            <div style={{ fontSize:22, fontWeight:900, color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:"12px 16px", marginBottom:16, display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
        <input placeholder="Search menu..." value={search} onChange={e=>setSearch(e.target.value)} className="bo-input" style={{ flex:1, minWidth:160 }} />
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} className="bo-select" style={{ width:180 }}>
          <option value="">All Categories</option>
          {cats.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="bo-select" style={{ width:180 }}>
          <option value="">All Status</option>
          {["Sangat Baik","On Target","Perlu Pantau","Naik Harga!","Too High","Pure Profit"].map(s => <option key={s}>{s}</option>)}
        </select>
        <button onClick={()=>{setSearch("");setCatFilter("");setStatusFilter("")}} className="bo-btn bo-btn-ghost bo-btn-sm">Clear</button>
      </div>

      {/* Legend */}
      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
        {[["≤30% Sangat Baik","var(--green)"],["30-35% On Target","#00875A"],["35-40% Perlu Pantau","var(--amber)","var(--amber)"],[">40% Naik Harga!","var(--red)"]].map(([l,c]) => (
          <div key={l} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, fontWeight:600, color:c }}>
            <div style={{ width:10, height:10, borderRadius:2, background:c }} />
            {l}
          </div>
        ))}
        {pendingChanges > 0 && <span style={{ fontSize:11, fontWeight:700, color:"var(--green)", marginLeft:8 }}>{pendingChanges} unsaved price changes</span>}
      </div>

      {/* Table */}
      {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", overflow:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:1000 }}>
            <thead>
              <tr style={{ background:"#F8FAFC" }}>
                {["#","Menu","Cat","HPP/COGS","Harga Sekarang","COGS %","Profit","Harga Baru","COGS % Baru","Δ COGS","Profit Baru","Rec. Price @ "+target+"%","Status"].map(h => (
                  <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:10, fontWeight:700, color:"var(--ink4)", borderBottom:"1px solid #E8ECF0", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={13} style={{ textAlign:"center", padding:32, color:"var(--ink5)" }}>No products found</td></tr>}
              {filtered.map((p, idx) => {
                const cpp      = p.cogs || 0
                const price    = p.price || 0
                const cogsP    = price > 0 ? (cpp / price * 100) : 0
                const profit   = price - cpp
                const newPrice = parseFloat(editPrices[p.sku]) || price
                const newCogsP = newPrice > 0 ? (cpp / newPrice * 100) : 0
                const delta    = newCogsP - cogsP
                const newProfit= newPrice - cpp
                // Only recommend a new price when COGS % is above target
                // Round UP (ceil) so the recommended price always achieves the target
                const roundTo  = cpp < 2000 ? 500 : cpp < 10000 ? 1000 : 5000
                const recPrice = cpp > 0 && cogsP > target
                  ? Math.ceil((cpp / (target / 100)) / roundTo) * roundTo
                  : 0
                const st       = statusLabel(cogsP, "Regular")
                const rowBg    = cogsP > 40 ? "#FFF5F5" : cogsP > 35 ? "#FFFBEB" : cogsP > 0 && cogsP <= 30 ? "#F0FFF4" : "#fff"
                const hasChange = editPrices[p.sku] && parseFloat(editPrices[p.sku]) !== price
                return (
                  <tr key={p.sku} style={{ borderBottom:"1px solid #F0F4F8", background: hasChange ? "#F0F7FF" : rowBg }}>
                    <td style={{ padding:"8px 12px", fontSize:12, color:"var(--ink5)" }}>{idx+1}</td>
                    <td style={{ padding:"8px 12px", fontWeight:700, fontSize:13 }}>
                      {p.name}
                      {p.needs_recalc && (
                        <span title="A Paid PO touching this recipe's ingredients was voided since COGS was last recalculated — this value may be stale."
                          style={{ marginLeft:6, fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:8, background:"var(--amber-lt)", color:"var(--amber)" }}>
                          COGS mungkin belum sinkron
                        </span>
                      )}
                    </td>
                    <td style={{ padding:"8px 12px", fontSize:11, color:"var(--ink4)" }}>{p.cat||"—"}</td>
                    <td style={{ padding:"8px 12px", fontSize:12, fontWeight:600, color: cpp > 0 ? "var(--ink)" : "var(--ink5)" }}>
                      {cpp > 0 ? fmt(cpp) : <span style={{ color:"var(--ink5)" }}>No COGS</span>}
                    </td>
                    <td style={{ padding:"8px 12px", fontWeight:700 }}>{fmt(price)}</td>
                    <td style={{ padding:"8px 12px" }}>
                      {cpp > 0 ? (
                        <span style={{ fontSize:12, fontWeight:800, color: cogsP > 40 ? "var(--red)" : cogsP > 35 ? "var(--amber)" : "var(--green)" }}>
                          {fmtP(cogsP)}
                        </span>
                      ) : <span style={{ color:"var(--ink5)", fontSize:12 }}>—</span>}
                    </td>
                    <td style={{ padding:"8px 12px", fontSize:12, fontWeight:600, color: profit > 0 ? "var(--green)" : "var(--red)" }}>{fmt(profit)}</td>
                    <td style={{ padding:"8px 12px" }}>
                      <input type="number" value={editPrices[p.sku]||""} onChange={e=>setEditPrices(prev=>({...prev,[p.sku]:e.target.value}))}
                        placeholder={price.toLocaleString("id-ID")} className="bo-input" style={{ width:90, fontSize:12, padding:"4px 8px", borderColor: hasChange ? "var(--brand)" : undefined }} />
                    </td>
                    <td style={{ padding:"8px 12px" }}>
                      {cpp > 0 && newPrice > 0 ? (
                        <span style={{ fontSize:12, fontWeight:800, color: newCogsP > 40 ? "var(--red)" : newCogsP > 35 ? "var(--amber)" : "var(--green)" }}>
                          {fmtP(newCogsP)}
                        </span>
                      ) : <span style={{ color:"var(--ink5)", fontSize:12 }}>—</span>}
                    </td>
                    <td style={{ padding:"8px 12px" }}>
                      {hasChange && cpp > 0 ? (
                        <span style={{ fontSize:12, fontWeight:700, color: delta < 0 ? "var(--green)" : "var(--red)" }}>
                          {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toLocaleString("id-ID",{minimumFractionDigits:1,maximumFractionDigits:1})}%
                        </span>
                      ) : <span style={{ color:"var(--ink5)", fontSize:12 }}>—</span>}
                    </td>
                    <td style={{ padding:"8px 12px", fontSize:12, fontWeight:600, color: newProfit > 0 ? "var(--green)" : "var(--red)" }}>
                      {hasChange ? fmt(newProfit) : <span style={{ color:"var(--ink5)" }}>—</span>}
                    </td>
                    <td style={{ padding:"8px 12px", fontSize:12, fontWeight:700, color:"var(--brand)" }}>
                      {recPrice > 0 ? fmt(recPrice) : "—"}
                    </td>
                    <td style={{ padding:"8px 12px" }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:"3px 8px", borderRadius:20, background:st.bg, color:st.color, whiteSpace:"nowrap" }}>
                        {st.text}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length > 0 && (
            <div style={{ padding:"10px 14px", borderTop:"1px solid #E8ECF0", fontSize:12, color:"var(--ink4)", display:"flex", gap:16 }}>
              <span>{filtered.length} items shown</span>
              <span>Avg COGS: <strong style={{ color: avgCogs > 40 ? "var(--red)" : "var(--green)" }}>{fmtP(avgCogs)}</strong></span>
              {pendingChanges > 0 && <span style={{ color:"var(--brand)", fontWeight:700 }}>{pendingChanges} price changes pending</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
