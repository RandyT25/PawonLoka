import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { supabase } from "../../../lib/supabase"
import DateRangePicker, { buildDateRange } from "../DateRangePicker"
import { exportExcel, exportPDF, formatPeriodLabel, filenameSlug, fmtIDR } from "../exportUtils"
import { toBaseUnit as toBase } from "../../../shared/unitConversion"

const fmt    = n => "Rp " + Number(n||0).toLocaleString("id-ID")
const fmtQty = (n, unit) => Number(n||0).toLocaleString("id-ID", { maximumFractionDigits:2 }) + (unit ? " " + unit : "")

const STATUS_CFG = {
  out:  { label:"Habis",    bg:"#FFEBE6", color:"#DE350B" },
  low:  { label:"Menipis",  bg:"#FFF7E6", color:"#FF8B00" },
  ok:   { label:"Cukup",    bg:"#E3FCEF", color:"#00875A" },
}

export default function InvStockCompare() {
  const today = new Date().toISOString().slice(0, 10)

  const [range,        setRange]        = useState("month")
  const [customDate,   setCustomDate]   = useState(today)
  const [customDateTo, setCustomDateTo] = useState(today)
  const [ingredients,  setIngredients]  = useState([])
  const [purchased,    setPurchased]    = useState({}) // { ingredient_id: { qty, cost } }
  const [loading,      setLoading]      = useState(true)
  const [err,          setErr]          = useState(null)
  const [search,       setSearch]       = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [showPurchased,setShowPurchased]= useState(false)
  const [lastUpdated,  setLastUpdated]  = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)

    const { fromStr, toStr } = buildDateRange(range, customDate, customDateTo)
    const fromDate = fromStr.slice(0, 10)
    const toDate   = (toStr || new Date().toISOString()).slice(0, 10)

    const [{ data: ings, error: ingsErr }, { data: pos, error: posErr }] = await Promise.all([
      supabase.from("ingredients").select("id,name,unit,stock,min_stock,cost_per_unit,conversions").order("name"),
      supabase.from("purchase_orders").select("items").eq("status","Paid").gte("date",fromDate).lte("date",toDate),
    ])

    if (ingsErr || posErr) { setErr((ingsErr||posErr).message); setLoading(false); return }

    // Build ingredient map for unit conversion
    const ingMap = {}
    for (const ing of ings || []) ingMap[ing.id] = ing

    // Aggregate PO line items by ingredient, converting qty to base unit
    const agg = {}
    for (const po of pos || []) {
      const items = typeof po.items === "string" ? JSON.parse(po.items || "[]") : (po.items || [])
      for (const item of items) {
        const id = item.ingredient_id
        if (!id) continue
        const baseQty = ingMap[id] ? toBase(ingMap[id], parseFloat(item.qty||0), item.unit) : parseFloat(item.qty||0)
        const cost    = parseFloat(item.total_cost||0) || parseFloat(item.qty||0) * parseFloat(item.unit_cost||0)
        if (!agg[id]) agg[id] = { qty: 0, cost: 0 }
        agg[id].qty  += baseQty
        agg[id].cost += cost
      }
    }

    setIngredients(ings || [])
    setPurchased(agg)
    setLastUpdated(new Date())
    setLoading(false)
  }, [range, customDate, customDateTo])

  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load })
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    return ingredients.map(ing => {
      const po      = purchased[ing.id] || { qty: 0, cost: 0 }
      const stock   = parseFloat(ing.stock   || 0)
      const minStock= parseFloat(ing.min_stock || 0)
      let status = "ok"
      if (stock <= 0)                       status = "out"
      else if (minStock > 0 && stock < minStock) status = "low"
      const coverPct = minStock > 0 ? Math.min(100, Math.round(stock / minStock * 100)) : null
      return { ...ing, purchasedQty: po.qty, purchasedCost: po.cost, stock, minStock, status, coverPct }
    })
  }, [ingredients, purchased])

  const filtered = useMemo(() => {
    return rows
      .filter(r => {
        if (showPurchased && r.purchasedQty <= 0) return false
        if (statusFilter !== "all" && r.status !== statusFilter) return false
        if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false
        return true
      })
      .sort((a, b) => {
        const rank = { out:0, low:1, ok:2 }
        return (rank[a.status] - rank[b.status]) || a.name.localeCompare(b.name)
      })
  }, [rows, search, statusFilter, showPurchased])

  const totalSpend     = Object.values(purchased).reduce((s,x) => s + x.cost, 0)
  const purchasedCount = rows.filter(r => r.purchasedQty > 0).length
  const alertCount     = rows.filter(r => r.status !== "ok").length
  const periodLabel    = formatPeriodLabel(range, customDate, customDateTo)
  const slug           = filenameSlug(range, customDate, customDateTo)

  function handleExportExcel() {
    exportExcel({
      title: "Stok vs Pembelian", periodLabel, filterLabel: null,
      filename: "pawonloka-stok-vs-beli-" + slug + ".xlsx",
      sheets: [{
        name: "Stok vs Pembelian",
        columns: ["Bahan", "Satuan", "Dibeli (Periode)", "Nilai Beli", "Stok Saat Ini", "Min Stok", "Coverage %", "Status"],
        colWidths: [28, 10, 18, 22, 18, 12, 14, 12],
        rows: filtered.map(r => [
          r.name,
          r.unit,
          Number(r.purchasedQty.toFixed(2)),
          fmtIDR(r.purchasedCost),
          Number(r.stock.toFixed(2)),
          Number(r.minStock.toFixed(2)),
          r.coverPct !== null ? r.coverPct + "%" : "—",
          STATUS_CFG[r.status].label,
        ]),
      }],
    })
  }

  function handleExportPdf() {
    exportPDF({
      title: "Stok vs Pembelian", periodLabel, filterLabel: null,
      filename: "pawonloka-stok-vs-beli-" + slug + ".pdf",
      tables: [{
        label: "Stok vs Pembelian",
        head: ["Bahan", "Sat", "Dibeli", "Nilai Beli", "Stok", "Min", "Status"],
        body: filtered.map(r => [
          r.name,
          r.unit,
          fmtQty(r.purchasedQty),
          fmtIDR(r.purchasedCost),
          fmtQty(r.stock),
          fmtQty(r.minStock),
          STATUS_CFG[r.status].label,
        ]),
      }],
    })
  }

  return (
    <div>
      <DateRangePicker
        range={range} setRange={setRange}
        customDate={customDate} setCustomDate={setCustomDate}
        customDateTo={customDateTo} setCustomDateTo={setCustomDateTo}
        loading={loading} lastUpdated={lastUpdated} onRefresh={() => loadRef.current()}>
        <button onClick={handleExportExcel} className="bo-btn bo-btn-ghost bo-btn-sm">↓ Excel</button>
        <button onClick={handleExportPdf}   className="bo-btn bo-btn-ghost bo-btn-sm">↓ PDF</button>
      </DateRangePicker>

      {err && (
        <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8, padding:"10px 14px", marginBottom:16, color:"#DC2626", fontSize:13 }}>
          ⚠ Gagal memuat data: {err}
        </div>
      )}

      {/* KPI cards */}
      <div className="bo-rekon-kpi">
        {[
          ["Total Belanja", fmt(totalSpend), "#0052CC", "periode ini"],
          ["Bahan Dibeli",  purchasedCount + " bahan", "#00875A", "ada pembelian"],
          ["Perlu Perhatian", alertCount + " bahan", alertCount > 0 ? "#DE350B" : "#00875A", alertCount > 0 ? "stok menipis / habis" : "semua aman"],
        ].map(([l, v, c, sub]) => (
          <div key={l} style={{ background:"#fff", borderRadius:12, padding:"14px 16px", border:"1px solid var(--surface3)", borderTop:"3px solid " + c }}>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--ink4)", marginBottom:4 }}>{l}</div>
            <div style={{ fontSize:18, fontWeight:900, color:c }}>{v}</div>
            <div style={{ fontSize:11, color:"var(--ink5)", marginTop:2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          className="bo-input" placeholder="Cari bahan..." style={{ width:200 }} />
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {[["all","Semua"],["low","Menipis"],["out","Habis"]].map(([v,l]) => (
            <button key={v} onClick={() => { setStatusFilter(v); setShowPurchased(false) }}
              className={"bo-btn bo-btn-sm " + (statusFilter === v && !showPurchased ? "bo-btn-primary" : "bo-btn-ghost")}>
              {l}
            </button>
          ))}
          <button onClick={() => { setShowPurchased(p => !p); setStatusFilter("all") }}
            className={"bo-btn bo-btn-sm " + (showPurchased ? "bo-btn-primary" : "bo-btn-ghost")}>
            Dibeli Saja
          </button>
        </div>
        <span style={{ fontSize:12, color:"var(--ink5)", marginLeft:"auto" }}>
          {filtered.length} bahan
        </span>
      </div>

      {/* Table */}
      <div className="bo-card" style={{ padding:0, overflowX:"auto" }}>
        {loading ? (
          <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Memuat...</div>
        ) : (
          <table className="bo-table">
            <thead>
              <tr>
                <th>BAHAN</th>
                <th>SAT</th>
                <th style={{ textAlign:"right" }}>DIBELI (PERIODE)</th>
                <th style={{ textAlign:"right" }}>NILAI BELI</th>
                <th style={{ textAlign:"right" }}>STOK SAAT INI</th>
                <th style={{ textAlign:"right" }}>MIN STOK</th>
                <th>COVERAGE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign:"center", color:"var(--ink5)", padding:"40px 0" }}>
                    Tidak ada data
                  </td>
                </tr>
              ) : filtered.map(r => {
                const cfg = STATUS_CFG[r.status]
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight:600, fontSize:13 }}>{r.name}</td>
                    <td style={{ fontSize:12, color:"var(--ink4)" }}>{r.unit}</td>
                    <td style={{ textAlign:"right", fontWeight: r.purchasedQty > 0 ? 700 : 400, color: r.purchasedQty > 0 ? "var(--ink)" : "var(--ink5)" }}>
                      {r.purchasedQty > 0 ? fmtQty(r.purchasedQty) : "—"}
                    </td>
                    <td style={{ textAlign:"right", fontSize:13 }}>
                      {r.purchasedCost > 0 ? fmt(r.purchasedCost) : "—"}
                    </td>
                    <td style={{ textAlign:"right", fontWeight:700, color: r.status === "out" ? "#DE350B" : r.status === "low" ? "#FF8B00" : "var(--ink)" }}>
                      {fmtQty(r.stock)}
                    </td>
                    <td style={{ textAlign:"right", color:"var(--ink4)", fontSize:12 }}>
                      {r.minStock > 0 ? fmtQty(r.minStock) : "—"}
                    </td>
                    <td style={{ minWidth:90 }}>
                      {r.minStock > 0 ? (
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <div style={{ flex:1, height:5, background:"var(--surface2)", borderRadius:3, overflow:"hidden" }}>
                            <div style={{ height:"100%", width: Math.min(100, r.coverPct) + "%", background: r.status === "out" ? "#DE350B" : r.status === "low" ? "#FF8B00" : "#00875A", borderRadius:3 }} />
                          </div>
                          <span style={{ fontSize:10, color:"var(--ink5)", width:32, textAlign:"right", flexShrink:0 }}>{r.coverPct}%</span>
                        </div>
                      ) : <span style={{ color:"var(--ink5)", fontSize:11 }}>—</span>}
                    </td>
                    <td>
                      <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:10, whiteSpace:"nowrap", background:cfg.bg, color:cfg.color }}>
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
