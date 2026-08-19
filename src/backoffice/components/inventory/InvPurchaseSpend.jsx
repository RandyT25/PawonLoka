import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { supabase } from "../../../lib/supabase"
import DateRangePicker, { buildDateRange } from "../DateRangePicker"
import MultiItemSelect from "../MultiItemSelect"
import { exportExcel, exportPDF, formatPeriodLabel, filenameSlug, fmtIDR } from "../exportUtils"
import { toBaseUnit as toBase } from "../../../shared/unitConversion"
import { isFoodCategory, isSupplyCategory } from "../../lib/ingredientCategories"

const fmt    = n => "Rp " + Number(n||0).toLocaleString("id-ID")
const fmtQty = (n, unit) => Number(n||0).toLocaleString("id-ID", { maximumFractionDigits:2 }) + (unit ? " " + unit : "")

const RANK_COLORS = ["#F59E0B", "#94A3B8", "#B45309"]
const TOP_N = 15

export default function InvPurchaseSpend() {
  const today = new Date().toISOString().slice(0, 10)

  const [range,        setRange]        = useState("month")
  const [customDate,   setCustomDate]   = useState(today)
  const [customDateTo, setCustomDateTo] = useState(today)
  const [ingredients,  setIngredients]  = useState([])
  const [purchased,    setPurchased]    = useState({}) // { ingredient_id: { qty, cost, poCount } }
  const [poCount,      setPoCount]      = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [err,          setErr]          = useState(null)
  const [search,       setSearch]       = useState("")
  const [catFilter,    setCatFilter]    = useState(new Set())
  const [scope,        setScope]        = useState("all") // all | food | supply
  const [lastUpdated,  setLastUpdated]  = useState(null)
  const [sortKey,      setSortKey]      = useState("cost") // qty | cost
  const [sortDir,      setSortDir]      = useState("desc") // asc | desc

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc")
    else { setSortKey(key); setSortDir("desc") }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)

    const { fromStr, toStr } = buildDateRange(range, customDate, customDateTo)
    const fromDate = fromStr.slice(0, 10)
    const toDate   = (toStr || new Date().toISOString()).slice(0, 10)

    const [{ data: ings, error: ingsErr }, { data: pos, error: posErr }] = await Promise.all([
      supabase.from("ingredients").select("id,name,unit,category,cost_per_unit,conversions").order("name"),
      supabase.from("purchase_orders").select("items,date").eq("status","Paid").gte("date",fromDate).lte("date",toDate),
    ])

    if (ingsErr || posErr) { setErr((ingsErr||posErr).message); setLoading(false); return }

    const ingMap = {}
    for (const ing of ings || []) ingMap[ing.id] = ing

    // Same per-ingredient aggregation InvStockCompare.jsx uses, plus a per-PO occurrence count —
    // status="Paid" already excludes voided POs (void only ever flips purchase_orders.status,
    // never a running total, so filtering on status is both simplest and correct).
    const agg = {}
    for (const po of pos || []) {
      const items = typeof po.items === "string" ? JSON.parse(po.items || "[]") : (po.items || [])
      for (const item of items) {
        const id = item.ingredient_id
        if (!id) continue
        const baseQty = ingMap[id] ? toBase(ingMap[id], parseFloat(item.qty||0), item.unit) : parseFloat(item.qty||0)
        const cost    = parseFloat(item.total_cost||0) || parseFloat(item.qty||0) * parseFloat(item.unit_cost||0)
        if (!agg[id]) agg[id] = { qty: 0, cost: 0, poCount: 0 }
        agg[id].qty     += baseQty
        agg[id].cost     += cost
        agg[id].poCount += 1
      }
    }

    setIngredients(ings || [])
    setPurchased(agg)
    setPoCount((pos || []).length)
    setLastUpdated(new Date())
    setLoading(false)
  }, [range, customDate, customDateTo])

  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load })
  useEffect(() => { load() }, [load])

  // Only ingredients actually purchased in the period belong in a spend report — unlike
  // InvStockCompare (a stock-health screen that lists everything), zero-spend rows here would
  // just be noise against the "where does my money go" question this screen answers.
  const rows = useMemo(() => {
    return ingredients
      .map(ing => {
        const po = purchased[ing.id]
        if (!po || po.cost <= 0) return null
        return { ...ing, purchasedQty: po.qty, purchasedCost: po.cost, poCount: po.poCount }
      })
      .filter(Boolean)
      .sort((a, b) => b.purchasedCost - a.purchasedCost)
  }, [ingredients, purchased])

  const categoryOptions = useMemo(() => {
    return [...new Set(rows.map(r => r.category).filter(Boolean))].sort()
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (scope === "food" && !isFoodCategory(r.category)) return false
      if (scope === "supply" && !isSupplyCategory(r.category)) return false
      if (catFilter.size > 0 && !catFilter.has(r.category)) return false
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [rows, search, catFilter, scope])

  // The table sorts independently from `filtered` (which stays cost-descending for the
  // Top-15/category-rollup panels above) — the click-to-sort here only affects the full table.
  const sortedRows = useMemo(() => {
    const field = sortKey === "qty" ? "purchasedQty" : "purchasedCost"
    const dir = sortDir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => (a[field] - b[field]) * dir)
  }, [filtered, sortKey, sortDir])

  const categoryRollup = useMemo(() => {
    const byCat = {}
    for (const r of filtered) {
      byCat[r.category] = (byCat[r.category] || 0) + r.purchasedCost
    }
    return Object.entries(byCat)
      .map(([category, cost]) => ({ category, cost }))
      .sort((a, b) => b.cost - a.cost)
  }, [filtered])

  const totalSpend      = filtered.reduce((s,r) => s + r.purchasedCost, 0)
  const uniqueCount     = filtered.length
  const topCategory     = categoryRollup[0]
  const topCategoryShare= topCategory && totalSpend > 0 ? Math.round(topCategory.cost / totalSpend * 100) : 0
  const top15           = filtered.slice(0, TOP_N)
  const maxTop15Cost     = top15.length ? top15[0].purchasedCost : 1
  const maxCatCost       = categoryRollup.length ? categoryRollup[0].cost : 1
  const periodLabel     = formatPeriodLabel(range, customDate, customDateTo)
  const slug            = filenameSlug(range, customDate, customDateTo)

  function handleExportExcel() {
    exportExcel({
      title: "Belanja per Bahan", periodLabel, filterLabel: null,
      filename: "pawonloka-belanja-bahan-" + slug + ".xlsx",
      sheets: [{
        name: "Belanja per Bahan",
        columns: ["Bahan", "Kategori", "Satuan", "Qty Dibeli", "Total Belanja", "Harga Rata-rata", "# PO"],
        colWidths: [28, 18, 10, 16, 18, 18, 8],
        rows: filtered.map(r => [
          r.name, r.category, r.unit,
          Number(r.purchasedQty.toFixed(2)),
          fmtIDR(r.purchasedCost),
          fmtIDR(r.purchasedQty > 0 ? r.purchasedCost / r.purchasedQty : 0),
          r.poCount,
        ]),
      }],
    })
  }

  function handleExportPdf() {
    exportPDF({
      title: "Belanja per Bahan", periodLabel, filterLabel: null,
      filename: "pawonloka-belanja-bahan-" + slug + ".pdf",
      tables: [{
        label: "Belanja per Bahan",
        head: ["Bahan", "Kategori", "Sat", "Qty", "Belanja", "# PO"],
        body: filtered.map(r => [r.name, r.category, r.unit, fmtQty(r.purchasedQty), fmtIDR(r.purchasedCost), r.poCount]),
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

      <div className="bo-rekon-kpi">
        {[
          ["Total Belanja", fmt(totalSpend), "#0052CC", "periode ini"],
          ["Bahan Dibeli", uniqueCount + " bahan", "#00875A", "bahan unik dibeli"],
          ["Purchase Order", poCount + " PO", "#6554C0", "PO lunas periode ini"],
          ["Kategori Terbesar", topCategory ? topCategory.category : "—", "#DE350B", topCategory ? topCategoryShare + "% dari total belanja" : "belum ada data"],
        ].map(([l, v, c, sub]) => (
          <div key={l} style={{ background:"#fff", borderRadius:12, padding:"14px 16px", border:"1px solid var(--surface3)", borderTop:"3px solid " + c }}>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--ink4)", marginBottom:4 }}>{l}</div>
            <div style={{ fontSize:18, fontWeight:900, color:c }}>{v}</div>
            <div style={{ fontSize:11, color:"var(--ink5)", marginTop:2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="bo-card" style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Memuat...</div>
      ) : (
        <div className="bo-topslow-grid">
          <div className="bo-card">
            <div className="bo-card-title" style={{ color:"#0052CC" }}>Top {TOP_N} Bahan Termahal</div>
            {top15.length === 0
              ? <div style={{ color:"#94A3B8", fontSize:13 }}>Belum ada pembelian periode ini</div>
              : top15.map((r,i) => (
                <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                  <div style={{ width:26, height:26, borderRadius:"50%", flexShrink:0, background:RANK_COLORS[i]||"#F4F5F7", color:i<3?"#fff":"#42526E", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{i+1}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:"#0A1628", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</span>
                      <span style={{ fontSize:12, fontWeight:800, color:"#0052CC", flexShrink:0, marginLeft:8 }}>{fmt(r.purchasedCost)}</span>
                    </div>
                    <div style={{ height:5, background:"#F4F5F7", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:Math.round(r.purchasedCost/maxTop15Cost*100)+"%", background:"#0052CC", borderRadius:3 }}/>
                    </div>
                    <div style={{ fontSize:10, color:"#6B778C", marginTop:2 }}>{fmtQty(r.purchasedQty, r.unit)} · {r.poCount} PO</div>
                  </div>
                </div>
              ))
            }
          </div>
          <div className="bo-card">
            <div className="bo-card-title" style={{ color:"#6554C0" }}>Belanja per Kategori</div>
            {categoryRollup.length === 0
              ? <div style={{ color:"#94A3B8", fontSize:13 }}>Belum ada pembelian periode ini</div>
              : categoryRollup.map((c,i) => (
                <div key={c.category} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                  <div style={{ width:26, height:26, borderRadius:"50%", flexShrink:0, background:RANK_COLORS[i]||"#F4F5F7", color:i<3?"#fff":"#42526E", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{i+1}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:"#0A1628", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.category}</span>
                      <span style={{ fontSize:12, fontWeight:800, color:"#6554C0", flexShrink:0, marginLeft:8 }}>{fmt(c.cost)}</span>
                    </div>
                    <div style={{ height:5, background:"#F4F5F7", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:Math.round(c.cost/maxCatCost*100)+"%", background:"#6554C0", borderRadius:3 }}/>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display:"flex", gap:8, margin:"20px 0 16px", flexWrap:"wrap", alignItems:"center" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          className="bo-input" placeholder="Cari bahan..." style={{ width:200 }} />
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {[["all","Semua"],["food","Bahan Baku"],["supply","Supplies"]].map(([v,l]) => (
            <button key={v} onClick={() => setScope(v)}
              className={"bo-btn bo-btn-sm " + (scope === v ? "bo-btn-primary" : "bo-btn-ghost")}>
              {l}
            </button>
          ))}
        </div>
        <MultiItemSelect options={categoryOptions} selected={catFilter} onChange={setCatFilter} placeholder="Semua Kategori" />
        <span style={{ fontSize:12, color:"var(--ink5)", marginLeft:"auto" }}>
          {filtered.length} bahan
        </span>
      </div>

      {/* Full table */}
      <div className="bo-card" style={{ padding:0, overflowX:"auto" }}>
        {loading ? (
          <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Memuat...</div>
        ) : (
          <table className="bo-table">
            <thead>
              <tr>
                <th>BAHAN</th>
                <th>KATEGORI</th>
                <th>SAT</th>
                <th style={{ textAlign:"right", cursor:"pointer", userSelect:"none" }} onClick={() => toggleSort("qty")}>
                  QTY DIBELI {sortKey==="qty" ? (sortDir==="desc"?"▼":"▲") : ""}
                </th>
                <th style={{ textAlign:"right", cursor:"pointer", userSelect:"none" }} onClick={() => toggleSort("cost")}>
                  TOTAL BELANJA {sortKey==="cost" ? (sortDir==="desc"?"▼":"▲") : ""}
                </th>
                <th style={{ textAlign:"right" }}>HARGA RATA-RATA</th>
                <th style={{ textAlign:"right" }}># PO</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign:"center", color:"var(--ink5)", padding:"40px 0" }}>
                    Tidak ada data
                  </td>
                </tr>
              ) : sortedRows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight:600, fontSize:13 }}>{r.name}</td>
                  <td style={{ fontSize:12, color:"var(--ink4)" }}>{r.category}</td>
                  <td style={{ fontSize:12, color:"var(--ink4)" }}>{r.unit}</td>
                  <td style={{ textAlign:"right" }}>{fmtQty(r.purchasedQty)}</td>
                  <td style={{ textAlign:"right", fontWeight:700 }}>{fmt(r.purchasedCost)}</td>
                  <td style={{ textAlign:"right", color:"var(--ink4)", fontSize:12 }}>{fmt(r.purchasedQty > 0 ? r.purchasedCost / r.purchasedQty : 0)}</td>
                  <td style={{ textAlign:"right", color:"var(--ink4)", fontSize:12 }}>{r.poCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
