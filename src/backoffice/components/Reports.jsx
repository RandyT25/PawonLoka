import { useState, useEffect, useCallback, useMemo } from "react"
import { supabase } from "../../lib/supabase"
import MultiItemSelect from "./MultiItemSelect"
import { exportPDF, exportExcel, fmtIDR } from "./exportUtils"
import { explodeOrderPayments } from "../../shared/orderPricing"

const fmt = n => "Rp " + Number(n||0).toLocaleString("id-ID")

export default function Reports() {
  const [orders,     setOrders]     = useState([])
  const [itemFilter, setItemFilter] = useState(new Set())
  const [loading,    setLoading]    = useState(true)
  const [err,        setErr]        = useState(null)
  const [from,       setFrom]       = useState(new Date().toISOString().slice(0,10))
  const [to,         setTo]         = useState(new Date().toISOString().slice(0,10))

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("status","Paid")
      .gte("created_at", from + "T00:00:00+08:00")
      .lte("created_at", to   + "T23:59:59+08:00")
      .order("created_at", { ascending: false })
    if (error) { console.error("Reports load error:", error); setErr(error.message) }
    setOrders(data || [])
    setLoading(false)
  }, [from, to])

  useEffect(() => { load() }, [load])

  // Auto-refresh when new orders land or existing ones are updated
  useEffect(() => {
    const channel = supabase.channel("reports_realtime")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"orders" }, () => load())
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"orders" }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  const allItemNames = useMemo(() => {
    const names = new Set()
    orders.forEach(o => {
      const its = typeof o.items === "string" ? JSON.parse(o.items || "[]") : (o.items || [])
      ;(its || []).forEach(i => { if (i.name) names.add(i.name) })
    })
    return [...names].sort()
  }, [orders])

  const displayOrders = useMemo(() => {
    if (itemFilter.size === 0) return orders
    return orders.filter(o => {
      const its = typeof o.items === "string" ? JSON.parse(o.items || "[]") : (o.items || [])
      return (its || []).some(i => itemFilter.has(i.name))
    })
  }, [orders, itemFilter])

  const totalSales  = displayOrders.reduce((s,o) => s+(o.total||0), 0)
  const totalOrders = displayOrders.length
  const totalCogs   = displayOrders.reduce((s,o) => s+(o.cogs||0), 0)
  const grossProfit = totalSales - totalCogs
  const avgOrder    = totalOrders ? Math.round(totalSales/totalOrders) : 0

  const byPayment = displayOrders.reduce((acc,o) => {
    explodeOrderPayments(o).forEach(({ method, amount }) => { acc[method] = (acc[method]||0) + amount })
    return acc
  }, {})

  const byDate = displayOrders.reduce((acc,o) => {
    const d = o.created_at?.slice(0,10) || "?"
    if (!acc[d]) acc[d] = { date:d, orders:0, sales:0, cogs:0 }
    acc[d].orders++
    acc[d].sales += o.total || 0
    acc[d].cogs  += o.cogs  || 0
    return acc
  }, {})

  function tableName(o) { return o.table_name || o.table || "Walk-in" }

  const periodLabel = from === to ? from : from + " — " + to
  const filterLabel = itemFilter.size > 0 ? [...itemFilter].join(", ") : null
  const slug = from + (to !== from ? "_" + to : "")

  function handleExportExcel() {
    exportExcel({
      title: "Laporan & Export", periodLabel, filterLabel,
      filename: "pawonloka-report-" + slug + ".xlsx",
      sheets: [
        {
          name: "Semua Order",
          columns: ["Tanggal","Waktu","Order ID","Meja","Kasir","Pembayaran","Total","COGS","Gross Profit"],
          colWidths: [14,10,18,12,14,14,20,18,18],
          rows: displayOrders.map(o => [
            o.created_at?.slice(0,10),
            o.time || new Date(o.created_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}),
            o.code || o.id,
            tableName(o),
            o.staff || "—",
            o.pay || "—",
            fmtIDR(o.total),
            fmtIDR(o.cogs||0),
            fmtIDR((o.total||0)-(o.cogs||0)),
          ]),
        },
        {
          name: "Ringkasan",
          columns: ["Metrik","Nilai"],
          colWidths: [24,22],
          rows: [
            ["Total Sales",  fmtIDR(totalSales)],
            ["Total COGS",   fmtIDR(totalCogs)],
            ["Gross Profit", fmtIDR(grossProfit)],
            ["Total Orders", totalOrders],
            ["Avg Order",    fmtIDR(avgOrder)],
          ],
        },
      ],
    })
  }

  function handleExportPdf() {
    exportPDF({
      title: "Laporan & Export", periodLabel, filterLabel,
      filename: "pawonloka-report-" + slug + ".pdf",
      tables: [
        {
          label: "Ringkasan",
          head: ["Metrik","Nilai"],
          body: [
            ["Total Sales",  fmtIDR(totalSales)],
            ["Total COGS",   fmtIDR(totalCogs)],
            ["Gross Profit", fmtIDR(grossProfit)],
            ["Total Orders", totalOrders],
            ["Avg Order",    fmtIDR(avgOrder)],
          ],
        },
        {
          label: "Semua Order",
          head: ["Tanggal","Order ID","Meja","Kasir","Pembayaran","Total","COGS"],
          body: displayOrders.map(o => [
            o.created_at?.slice(0,10),
            o.code || String(o.id).slice(-8),
            tableName(o),
            o.staff || "—",
            o.pay || "—",
            fmtIDR(o.total),
            fmtIDR(o.cogs||0),
          ]),
        },
      ],
    })
  }

  return (
    <div>
      {/* Date filter toolbar */}
      <div className="bo-reports-toolbar">
        {/* Date inputs */}
        <div className="bo-reports-dates">
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <label style={{ fontSize:12, fontWeight:600, color:"var(--ink4)", whiteSpace:"nowrap" }}>From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="bo-input" style={{ flex:1, minWidth:0 }} />
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <label style={{ fontSize:12, fontWeight:600, color:"var(--ink4)", whiteSpace:"nowrap" }}>To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="bo-input" style={{ flex:1, minWidth:0 }} />
          </div>
        </div>
        {/* Quick filters + export */}
        <div className="bo-reports-actions">
          <div className="bo-reports-quick">
            {[["Today",0],["7 days",7],["30 days",30]].map(([l,d]) => (
              <button key={l} onClick={() => {
                const t = new Date(), f = new Date()
                f.setDate(t.getDate() - d)
                setTo(t.toISOString().slice(0,10))
                setFrom(f.toISOString().slice(0,10))
              }} className="bo-btn bo-btn-ghost bo-btn-sm">{l}</button>
            ))}
          </div>
          <div style={{ display:"flex", gap:8, marginLeft:"auto", alignItems:"center" }}>
            <MultiItemSelect options={allItemNames} selected={itemFilter} onChange={setItemFilter} />
            <button onClick={handleExportExcel} className="bo-btn bo-btn-ghost bo-btn-sm">↓ Excel</button>
            <button onClick={handleExportPdf}   className="bo-btn bo-btn-ghost bo-btn-sm">↓ PDF</button>
          </div>
        </div>
      </div>

      {err && <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8, padding:"10px 14px", marginBottom:16, color:"#DC2626", fontSize:13 }}>⚠ Gagal memuat data: {err}</div>}

      {/* KPI Cards */}
      <div className="bo-metrics">
        <div className="bo-met blue">
          <div className="bo-met-label">Total Sales</div>
          <div className="bo-met-val">{fmt(totalSales)}</div>
          <div className="bo-met-sub">{totalOrders} orders</div>
        </div>
        <div className="bo-met green">
          <div className="bo-met-label">Gross Profit</div>
          <div className="bo-met-val">{fmt(grossProfit)}</div>
          <div className="bo-met-sub">Margin {totalSales ? Math.round(grossProfit/totalSales*100) : 0}%</div>
        </div>
        <div className="bo-met amber">
          <div className="bo-met-label">Avg Order</div>
          <div className="bo-met-val">{fmt(avgOrder)}</div>
        </div>
        <div className="bo-met blue">
          <div className="bo-met-label">Est. COGS</div>
          <div className="bo-met-val">{fmt(totalCogs)}</div>
        </div>
      </div>

      {/* Payment Breakdown + Daily Summary */}
      <div className="bo-report-2col">
        <div className="bo-card">
          <div className="bo-card-title">Payment Breakdown</div>
          {Object.entries(byPayment).sort((a,b)=>b[1]-a[1]).map(([method,amt]) => (
            <div key={method} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--surface2)" }}>
              <span style={{ fontSize:13, fontWeight:600 }}>{method}</span>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{fmt(amt)}</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>{totalSales ? Math.round(amt/totalSales*100) : 0}%</div>
              </div>
            </div>
          ))}
          {Object.keys(byPayment).length === 0 && <div style={{ color:"var(--ink5)", fontSize:13 }}>No data</div>}
        </div>

        <div className="bo-card">
          <div className="bo-card-title">Daily Summary</div>
          {Object.values(byDate).sort((a,b)=>b.date.localeCompare(a.date)).map(d => (
            <div key={d.date} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--surface2)" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600 }}>
                  {new Date(d.date).toLocaleDateString("id-ID",{weekday:"short",day:"numeric",month:"short"})}
                </div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>{d.orders} orders · GP {fmt(d.sales-d.cogs)}</div>
              </div>
              <div style={{ fontSize:13, fontWeight:700 }}>{fmt(d.sales)}</div>
            </div>
          ))}
          {Object.keys(byDate).length === 0 && <div style={{ color:"var(--ink5)", fontSize:13 }}>No data</div>}
        </div>
      </div>

      {/* Orders table */}
      <div className="bo-card" style={{ padding:0, overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--surface3)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontWeight:700 }}>All Orders</span>
          <span style={{ fontSize:12, color:"var(--ink5)" }}>{totalOrders} records{itemFilter.size > 0 ? ` · filter: ${[...itemFilter].join(", ")}` : ""}</span>
        </div>
        {loading
          ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div>
          : <table className="bo-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date & Time</th>
                  <th>Table</th>
                  <th>Cashier</th>
                  <th>Payment</th>
                  <th>COGS</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {displayOrders.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight:600, fontFamily:"monospace", fontSize:12 }}>{o.code || o.id?.slice(-10)}</td>
                    <td style={{ color:"var(--ink4)", fontSize:12 }}>
                      {o.created_at?.slice(0,10)}{" "}
                      {o.time || new Date(o.created_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}
                    </td>
                    <td>{tableName(o)}</td>
                    <td>{o.staff || "-"}</td>
                    <td><span className="bo-badge bo-badge-blue">{o.pay || "-"}</span></td>
                    <td style={{ color:"var(--red)", fontSize:12 }}>{fmt(o.cogs||0)}</td>
                    <td style={{ fontWeight:700 }}>{fmt(o.total)}</td>
                  </tr>
                ))}
                {displayOrders.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No orders in this period</td></tr>
                )}
              </tbody>
            </table>
        }
      </div>
    </div>
  )
}
