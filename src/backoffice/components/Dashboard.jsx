import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "../../lib/supabase"
import DateRangePicker, { buildDateRange } from "./DateRangePicker"
import { exportPDF, exportExcel, formatPeriodLabel, filenameSlug, fmtIDR } from "./exportUtils"
import { isFoodCategory } from "../lib/ingredientCategories"
import { explodeOrderPayments } from "../../shared/orderPricing"

const fmt = n => "Rp " + Number(n || 0).toLocaleString("id-ID")

function statusBadge(s) {
  if (!s || s === "Paid"    || s === "paid")     return { label:"Lunas",     bg:"#D1FAE5", color:"#065F46" }
  if (s === "Open"          || s === "open")      return { label:"Open Bill", bg:"#FEF3C7", color:"#92400E" }
  if (s === "Voided"        || s === "voided")    return { label:"Void",      bg:"#F1F5F9", color:"#64748B" }
  if (s === "Refunded"      || s === "refunded")  return { label:"Refund",    bg:"#EDE9FE", color:"#5B21B6" }
  return { label: s, bg:"#F1F5F9", color:"#64748B" }
}

export default function Dashboard({ onNavChange }) {
  const todayStr  = new Date().toISOString().slice(0, 10)
  const [range,      setRange]      = useState("today")
  const [customDate,   setCustomDate]   = useState(todayStr)
  const [customDateTo, setCustomDateTo] = useState(todayStr)
  const [loading,    setLoading]    = useState(true)
  const [err,        setErr]        = useState(null)
  const [stats,      setStats]      = useState({ sales:0, unpaidSales:0, paidOrders:0, openOrders:0, avgOrder:0, grossProfit:0, prevSales:0, totalProductsSold:0, projection:0, mtdSales:0 })
  const [hourData,   setHourData]   = useState([])
  const [payments,   setPayments]   = useState([])
  const [topProds,   setTopProds]   = useState([])
  const [recent,     setRecent]     = useState([])
  const [selected,   setSelected]   = useState(null)
  const [lastUpdated,setLastUpdated]= useState(null)
  const [lowStockCount, setLowStockCount] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    const { fromStr, toStr } = buildDateRange(range, customDate, customDateTo)
    let q = supabase.from("orders").select("*").gte("created_at", fromStr)
    if (toStr) q = q.lte("created_at", toStr)
    const { data, error } = await q.order("created_at", { ascending: false })
    if (error) { console.error(error); setErr(error.message); setLoading(false); return }
    const orders = data || []

    const paid   = orders.filter(o => !o.status || o.status === "Paid"  || o.status === "paid")
    const open   = orders.filter(o =>  o.status === "Open"  || o.status === "open")
    const totalSales  = paid.reduce((s, o) => s + (o.total || 0), 0)
    const unpaidSales = open.reduce((s, o) => s + (o.total || 0), 0)
    const totalCogs   = paid.reduce((s, o) => s + (o.cogs  || 0), 0)
    const avgOrder    = paid.length ? Math.round(totalSales / paid.length) : 0
    const totalProd   = paid.reduce((s, o) => {
      const items = typeof o.items === "string" ? JSON.parse(o.items || "[]") : (o.items || o.items_snapshot || [])
      return s + (items || []).reduce((ss, i) => ss + (i.qty || 1), 0)
    }, 0)

    // Hourly sales (7–21)
    const hMap = {}
    for (let h = 7; h <= 21; h++) hMap[h] = 0
    paid.forEach(o => {
      const h = new Date(o.created_at).getHours()
      if (h >= 7 && h <= 21) hMap[h] = (hMap[h] || 0) + (o.total || 0)
    })
    const maxHour = Math.max(...Object.values(hMap), 1)
    const hourArr = Object.entries(hMap).map(([h, v]) => ({ hour: h + ":00", value: v, maxHour }))

    // Month projection (only meaningful for "today" range)
    const day  = new Date().getDate()
    const days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
    const proj = day > 0 ? Math.round(totalSales / day * days) : 0

    // Payment method breakdown
    const pm = {}
    paid.forEach(o => { explodeOrderPayments(o).forEach(({ method, amount }) => { pm[method] = (pm[method]||0) + amount }) })
    const payArr = Object.entries(pm).map(([method,amount]) => ({ method, amount, pct: totalSales ? Math.round(amount/totalSales*100) : 0 })).sort((a,b) => b.amount-a.amount)

    // Top 5 products by qty
    const im = {}
    paid.forEach(o => {
      const its = typeof o.items==="string" ? JSON.parse(o.items||"[]") : (o.items||o.items_snapshot||[])
      ;(its||[]).forEach(i => { if(!im[i.name]) im[i.name]={name:i.name,qty:0}; im[i.name].qty+=(i.qty||1) })
    })
    const topArr = Object.values(im).sort((a,b)=>b.qty-a.qty).slice(0,5)
    const maxQty = topArr[0]?.qty||1

    setStats({ sales:totalSales, unpaidSales, paidOrders:paid.length, openOrders:open.length, avgOrder, grossProfit:totalSales - totalCogs, totalProductsSold:totalProd, projection:proj, mtdSales:totalSales })
    setHourData(hourArr)
    setPayments(payArr)
    setTopProds(topArr.map(t=>({...t,max:maxQty})))
    setRecent(orders.slice(0, 20))
    setLastUpdated(new Date())
    setLoading(false)
  }, [range, customDate, customDateTo])

  // loadRef — always points to latest load(), prevents stale closure in interval/realtime
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load })

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel("dashboard_rt")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"orders" }, () => loadRef.current())
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"orders" }, () => loadRef.current())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // 10-second polling + immediate reload on tab focus (guaranteed refresh regardless of realtime)
  useEffect(() => {
    const poll = setInterval(() => { if (!document.hidden) loadRef.current() }, 10000)
    const onVisible = () => { if (!document.hidden) loadRef.current() }
    document.addEventListener("visibilitychange", onVisible)
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", onVisible) }
  }, [])

  useEffect(() => {
    supabase.from("ingredients").select("id,stock,min_stock,category")
      .then(({ data }) => {
        if (!data) return
        const low = data.filter(i => isFoodCategory(i.category) && ((i.stock <= 0) || (i.min_stock > 0 && i.stock <= i.min_stock)))
        setLowStockCount(low.length)
      })
  }, [])

  const margin = stats.sales > 0 ? Math.round(stats.grossProfit / stats.sales * 100) : 0
  const periodLabel = formatPeriodLabel(range, customDate, customDateTo)
  const slug = filenameSlug(range, customDate, customDateTo)

  function handleExportExcel() {
    exportExcel({
      title: "Dashboard Penjualan", periodLabel, filterLabel: null,
      filename: "pawonloka-dashboard-" + slug + ".xlsx",
      sheets: [
        {
          name: "Ringkasan",
          columns: ["Metrik", "Nilai"],
          colWidths: [28, 24],
          rows: [
            ["Total Keseluruhan",  fmtIDR(stats.sales + stats.unpaidSales)],
            ["Sudah Dibayar",      fmtIDR(stats.sales)],
            ["Belum Dibayar",      fmtIDR(stats.unpaidSales)],
            ["Transaksi Lunas",    stats.paidOrders],
            ["Open Bills",         stats.openOrders],
            ["Avg per Order",      fmtIDR(stats.avgOrder)],
            ["Gross Profit",       fmtIDR(stats.grossProfit)],
            ["Margin",             margin + "%"],
            ["Produk Terjual",     stats.totalProductsSold],
            ["Proyeksi Bulan Ini", fmtIDR(stats.projection)],
          ],
        },
        {
          name: "Pembayaran",
          columns: ["Metode","Jumlah","Persen"],
          colWidths: [20,22,12],
          rows: payments.map(p => [p.method, fmtIDR(p.amount), p.pct + "%"]),
        },
        {
          name: "Top Produk",
          columns: ["Produk","Qty Terjual"],
          colWidths: [28,16],
          rows: topProds.map(t => [t.name, t.qty]),
        },
        {
          name: "Transaksi",
          columns: ["Order","Status","Meja","Staff","Pembayaran","Total","Waktu"],
          colWidths: [16,12,12,14,14,20,14],
          rows: recent.map(o => [
            o.code || "#" + String(o.id).slice(-6),
            o.status || "Paid",
            o.table_name || o.table || "Walk-in",
            o.staff || "—",
            o.pay || "—",
            fmtIDR(o.total),
            new Date(o.created_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}),
          ]),
        },
      ],
    })
  }

  function handleExportPdf() {
    exportPDF({
      title: "Dashboard Penjualan", periodLabel, filterLabel: null,
      filename: "pawonloka-dashboard-" + slug + ".pdf",
      tables: [
        {
          label: "Ringkasan",
          head: ["Metrik","Nilai"],
          body: [
            ["Total Keseluruhan",  fmtIDR(stats.sales + stats.unpaidSales)],
            ["Sudah Dibayar",      fmtIDR(stats.sales)],
            ["Belum Dibayar",      fmtIDR(stats.unpaidSales)],
            ["Transaksi Lunas",    stats.paidOrders],
            ["Avg per Order",      fmtIDR(stats.avgOrder)],
            ["Gross Profit",       fmtIDR(stats.grossProfit)],
            ["Margin",             margin + "%"],
          ],
        },
        ...(payments.length > 0 ? [{
          label: "Metode Pembayaran",
          head: ["Metode","Jumlah","Persen"],
          body: payments.map(p => [p.method, fmtIDR(p.amount), p.pct + "%"]),
        }] : []),
        ...(topProds.length > 0 ? [{
          label: "Top Produk",
          head: ["Produk","Qty"],
          body: topProds.map(t => [t.name, t.qty + "×"]),
        }] : []),
        {
          label: "Transaksi Terbaru",
          head: ["Order","Status","Meja","Staff","Pembayaran","Total","Waktu"],
          body: recent.map(o => [
            o.code || "#" + String(o.id).slice(-6),
            o.status || "Paid",
            o.table_name || o.table || "Walk-in",
            o.staff || "—",
            o.pay || "—",
            fmtIDR(o.total),
            new Date(o.created_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}),
          ]),
        },
      ],
    })
  }

  return (
    <div>
      <DateRangePicker range={range} setRange={setRange} customDate={customDate} setCustomDate={setCustomDate} customDateTo={customDateTo} setCustomDateTo={setCustomDateTo} loading={loading} lastUpdated={lastUpdated} onRefresh={() => loadRef.current()}>
        <button onClick={handleExportExcel} className="bo-btn bo-btn-ghost bo-btn-sm">↓ Excel</button>
        <button onClick={handleExportPdf}   className="bo-btn bo-btn-ghost bo-btn-sm">↓ PDF</button>
      </DateRangePicker>

      {err && <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8, padding:"10px 14px", marginBottom:16, color:"#DC2626", fontSize:13 }}>⚠ Gagal memuat data: {err}</div>}

      {lowStockCount > 0 && (
        <div style={{ background:"#FFFBEB", border:"1px solid #FCD34D", borderRadius:10, padding:"10px 14px", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:13, fontWeight:600, color:"#92400E" }}>⚠️ <strong>{lowStockCount} bahan</strong> stok di bawah minimum</span>
          {onNavChange && <button onClick={()=>onNavChange("inv-overview")} style={{ fontSize:12, fontWeight:700, color:"#B45309", background:"none", border:"none", cursor:"pointer", padding:0 }}>Lihat →</button>}
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────── */}
      <div style={{ background:"linear-gradient(135deg,#0A1628,#0052CC)", borderRadius:16, padding:"22px 24px", color:"#fff", marginBottom:12 }}>
        {/* 3-column grid fills the full width */}
        <div className="bo-dash-hero-grid" style={{ gap:"0 20px", marginBottom:16 }}>
          {/* Col 1 — Grand Total */}
          <div>
            <div style={{ fontSize:10, fontWeight:700, opacity:0.5, textTransform:"uppercase", letterSpacing:"0.6px", marginBottom:6 }}>Total Keseluruhan</div>
            <div style={{ fontSize:30, fontWeight:900, letterSpacing:"-1px", lineHeight:1 }}>{fmt(stats.sales + stats.unpaidSales)}</div>
            <div style={{ fontSize:11, opacity:0.4, marginTop:5 }}>sudah + belum dibayar</div>
          </div>
          {/* Divider */}
          <div style={{ background:"rgba(255,255,255,0.15)" }}/>
          {/* Col 2 — Sudah Dibayar */}
          <div>
            <div style={{ fontSize:10, fontWeight:700, opacity:0.5, textTransform:"uppercase", letterSpacing:"0.6px", marginBottom:6 }}>Sudah Dibayar</div>
            <div style={{ fontSize:26, fontWeight:900, letterSpacing:"-0.5px", lineHeight:1 }}>{fmt(stats.sales)}</div>
            <div style={{ fontSize:11, opacity:0.4, marginTop:5 }}>{stats.paidOrders} transaksi lunas</div>
          </div>
          {/* Divider */}
          <div style={{ background:"rgba(255,255,255,0.15)" }}/>
          {/* Col 3 — Belum Dibayar */}
          <div>
            <div style={{ fontSize:10, fontWeight:700, opacity:0.5, textTransform:"uppercase", letterSpacing:"0.6px", marginBottom:6 }}>Belum Dibayar</div>
            <div style={{ fontSize:26, fontWeight:900, letterSpacing:"-0.5px", lineHeight:1, color: stats.unpaidSales > 0 ? "#FCD34D" : "rgba(255,255,255,0.3)" }}>{fmt(stats.unpaidSales)}</div>
            <div style={{ fontSize:11, opacity:0.4, marginTop:5 }}>{stats.openOrders} open bill</div>
          </div>
        </div>
        {/* Meta bar */}
        <div style={{ display:"flex", gap:20, flexWrap:"wrap", fontSize:11, borderTop:"1px solid rgba(255,255,255,0.12)", paddingTop:12 }}>
          <span style={{ opacity:0.6 }}>Avg/Transaksi <strong style={{ opacity:1 }}>{fmt(stats.avgOrder)}</strong></span>
          <span style={{ opacity:0.6 }}>Gross Profit <strong style={{ opacity:1, color: stats.grossProfit >= 0 ? "#86EFAC" : "#FCA5A5" }}>{fmt(stats.grossProfit)}</strong> <span style={{ opacity:0.5 }}>({margin}%)</span></span>
          <span style={{ opacity:0.6 }}>Proyeksi Bulan Ini <strong style={{ opacity:1 }}>{fmt(stats.projection)}</strong></span>
          <span style={{ opacity:0.6 }}>Produk Terjual <strong style={{ opacity:1 }}>{stats.totalProductsSold}</strong></span>
        </div>
      </div>

      {/* ── KPI cards ────────────────────────────────── */}
      <div className="bo-dash-kpi" style={{ gap:10, marginBottom:12 }}>
        {[
          { label:"Transaksi Lunas", value:stats.paidOrders,        sub:"orders lunas",  color:"#0052CC", accent:"#0052CC" },
          { label:"Rata-rata/Order", value:fmt(stats.avgOrder),     sub:"per transaksi", color:"var(--ink1)", accent:"#00875A" },
          { label:"Produk Terjual",  value:stats.totalProductsSold, sub:"total items",   color:"#6554C0", accent:"#6554C0" },
          { label:"Open Bills",      value:stats.openOrders,        sub:"belum dibayar", color: stats.openOrders > 0 ? "#FF8B00" : "var(--ink4)", accent: stats.openOrders > 0 ? "#FF8B00" : "var(--surface3)" },
        ].map(k => (
          <div key={k.label} style={{ background:"#fff", borderRadius:12, padding:"14px 16px", border:"1px solid var(--surface3)", borderTop:`3px solid ${k.accent}` }}>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--ink4)", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>{k.label}</div>
            <div style={{ fontSize:20, fontWeight:900, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:10, color:"var(--ink5)", marginTop:4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Sales by Hour ─────────────────────────────── */}
      <div className="bo-card" style={{ marginBottom:12 }}>
        <div className="bo-card-title">
          Sales by Hour
          {hourData.every(h => h.value === 0) && <span style={{ fontSize:11, color:"var(--ink5)", fontWeight:400, marginLeft:8 }}>— no data yet</span>}
        </div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:100 }}>
          {hourData.map(h => {
            const barH = h.maxHour > 0 ? Math.max(4, Math.round(h.value / h.maxHour * 84)) : 4
            const active = h.value > 0
            return (
              <div key={h.hour} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                <div title={active ? fmt(h.value) : ""} style={{
                  width:"100%", height: barH + "px",
                  borderRadius:"3px 3px 0 0",
                  background: active ? "var(--brand)" : "var(--surface2)",
                  transition:"height 0.4s ease",
                }} />
                <span style={{ fontSize:9, color:"var(--ink5)", whiteSpace:"nowrap" }}>{h.hour.replace(":00","")}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Recent Transactions ───────────────────────── */}
      <div className="bo-card">
        <div className="bo-card-title">
          Transaksi Terbaru
          <span style={{ fontSize:11, color:"var(--ink5)", fontWeight:400, marginLeft:8 }}>
            {stats.paidOrders} lunas · {stats.openOrders} open · lihat semua di halaman Orders
          </span>
        </div>
        {selected && (
          <div style={{ background:"var(--surface)", borderRadius:12, padding:14, marginBottom:12, fontSize:13 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <div style={{ fontWeight:800 }}>{selected.code || "#" + String(selected.id).slice(-6)}</div>
              <button onClick={() => setSelected(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:"var(--ink4)" }}>✕</button>
            </div>
            {(() => {
              const items = selected.items_snapshot || selected.items || []
              const parsed = typeof items === "string" ? JSON.parse(items) : items
              return (parsed || []).map((i, idx) => (
                <div key={idx} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px solid var(--surface3)" }}>
                  <span>{i.qty}× {i.name}</span>
                  <span style={{ fontWeight:600 }}>{fmt((i.price || 0) * (i.qty || 1))}</span>
                </div>
              ))
            })()}
            <div style={{ display:"flex", justifyContent:"space-between", fontWeight:800, marginTop:8 }}>
              <span>Total</span><span>{fmt(selected.total)}</span>
            </div>
          </div>
        )}
        <table className="bo-table">
          <thead>
            <tr><th>Order</th><th>Status</th><th>Meja</th><th>Staff</th><th>Pembayaran</th><th>Total</th><th>Waktu</th></tr>
          </thead>
          <tbody>
            {recent.length === 0
              ? <tr><td colSpan={7} style={{ textAlign:"center", color:"var(--ink5)", padding:"28px 0" }}>Belum ada transaksi hari ini</td></tr>
              : recent.map(o => {
                  const badge   = statusBadge(o.status)
                  const isPaid  = !o.status || o.status === "Paid" || o.status === "paid"
                  const timeStr = new Date(o.created_at).toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit" })
                  return (
                    <tr key={o.id} onClick={() => setSelected(selected?.id === o.id ? null : o)}
                      style={{ cursor:"pointer" }} className="bo-table-row-hover">
                      <td style={{ fontWeight:700, color:"var(--brand)" }}>{o.code || "#" + String(o.id).slice(-6)}</td>
                      <td><span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:10, background:badge.bg, color:badge.color }}>{badge.label}</span></td>
                      <td>{o.table_name || o.table || "Walk-in"}</td>
                      <td style={{ color:"var(--ink3)" }}>{o.staff || "—"}</td>
                      <td><span className={"bo-badge " + (isPaid ? "bo-badge-green" : "bo-badge-gray")}>{isPaid ? (o.pay || "—") : "—"}</span></td>
                      <td style={{ fontWeight:700 }}>{fmt(o.total)}</td>
                      <td style={{ color:"var(--ink5)" }}>{o.time || timeStr}</td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}
