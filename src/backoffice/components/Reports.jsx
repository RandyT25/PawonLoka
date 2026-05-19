
import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }

export default function Reports() {
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [from, setFrom]       = useState(new Date().toISOString().slice(0,10))
  const [to, setTo]           = useState(new Date().toISOString().slice(0,10))

  useEffect(() => { load() }, [from, to])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("status","Paid")
      .gte("created_at", from + "T00:00:00+08:00")
      .lte("created_at", to + "T23:59:59+08:00")
      .order("created_at", { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  const totalSales  = orders.reduce((s,o) => s+(o.total||0), 0)
  const totalOrders = orders.length
  const avgOrder    = totalOrders ? Math.round(totalSales/totalOrders) : 0

  const byPayment = orders.reduce((acc, o) => {
    const m = o.pay || "Other"
    acc[m] = (acc[m]||0) + (o.total||0)
    return acc
  }, {})

  const byDate = orders.reduce((acc, o) => {
    const d = o.created_at?.slice(0,10) || "?"
    if (!acc[d]) acc[d] = { date:d, orders:0, sales:0 }
    acc[d].orders++
    acc[d].sales += o.total || 0
    return acc
  }, {})

  function getRows() {
    return orders.map(o => ({
      Date:    o.created_at?.slice(0,10),
      Time:    o.time || "",
      "Order ID": o.code || o.id,
      Table:   o.table || "Walk-in",
      Cashier: o.staff || "-",
      Payment: o.pay || "-",
      Total:   o.total || 0,
    }))
  }

  function exportExcel() {
    const rows = getRows()
    const summary = [
      { Label: "Period", Value: from + " to " + to },
      { Label: "Total Sales", Value: totalSales },
      { Label: "Total Orders", Value: totalOrders },
      { Label: "Avg Order", Value: avgOrder },
    ]
    const wb  = XLSX.utils.book_new()
    const ws1 = XLSX.utils.json_to_sheet(rows)
    const ws2 = XLSX.utils.json_to_sheet(summary)
    XLSX.utils.book_append_sheet(wb, ws1, "Orders")
    XLSX.utils.book_append_sheet(wb, ws2, "Summary")
    XLSX.writeFile(wb, "pawonloka-report-" + from + "-to-" + to + ".xlsx")
  }

  function exportPDF() {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.setFont("helvetica","bold")
    doc.text("PawonLoka - Sales Report", 14, 18)
    doc.setFontSize(10)
    doc.setFont("helvetica","normal")
    doc.text("Period: " + from + " to " + to, 14, 26)
    doc.text("Total Sales: " + fmt(totalSales) + "  |  Orders: " + totalOrders + "  |  Avg: " + fmt(avgOrder), 14, 32)

    autoTable(doc, {
      startY: 38,
      head: [["Date","Order ID","Table","Cashier","Payment","Total"]],
      body: orders.map(o => [
        o.created_at?.slice(0,10),
        o.code || o.id?.slice(-8),
        o.table || "Walk-in",
        o.staff || "-",
        o.pay || "-",
        fmt(o.total),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 102, 255] },
      alternateRowStyles: { fillColor: [244, 245, 247] },
    })

    doc.save("pawonloka-report-" + from + "-to-" + to + ".pdf")
  }

  return (
    <div>
      <div style={{ display:"flex", gap:10, marginBottom:20, alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <label style={{ fontSize:12, fontWeight:600, color:"var(--ink4)" }}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="bo-input" style={{ width:160 }} />
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <label style={{ fontSize:12, fontWeight:600, color:"var(--ink4)" }}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="bo-input" style={{ width:160 }} />
        </div>
        {[["Today",0],["7 days",7],["30 days",30]].map(([l,d]) => (
          <button key={l} onClick={() => {
            const t = new Date()
            const f = new Date()
            f.setDate(t.getDate() - d)
            setTo(t.toISOString().slice(0,10))
            setFrom(f.toISOString().slice(0,10))
          }} className="bo-btn bo-btn-ghost">{l}</button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <button onClick={exportExcel} className="bo-btn bo-btn-ghost">Export Excel</button>
          <button onClick={exportPDF} className="bo-btn bo-btn-primary">Export PDF</button>
        </div>
      </div>

      <div className="bo-metrics">
        <div className="bo-met blue">
          <div className="bo-met-label">Total Sales</div>
          <div className="bo-met-val">{fmt(totalSales)}</div>
          <div className="bo-met-sub">{totalOrders} orders</div>
        </div>
        <div className="bo-met green">
          <div className="bo-met-label">Orders</div>
          <div className="bo-met-val">{totalOrders}</div>
        </div>
        <div className="bo-met amber">
          <div className="bo-met-label">Avg Order</div>
          <div className="bo-met-val">{fmt(avgOrder)}</div>
        </div>
        <div className="bo-met blue">
          <div className="bo-met-label">Cash</div>
          <div className="bo-met-val">{fmt(byPayment["Cash"]||0)}</div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
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
                <div style={{ fontSize:13, fontWeight:600 }}>{new Date(d.date).toLocaleDateString("id-ID",{weekday:"short",day:"numeric",month:"short"})}</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>{d.orders} orders</div>
              </div>
              <div style={{ fontSize:13, fontWeight:700 }}>{fmt(d.sales)}</div>
            </div>
          ))}
          {Object.keys(byDate).length === 0 && <div style={{ color:"var(--ink5)", fontSize:13 }}>No data</div>}
        </div>
      </div>

      <div className="bo-card" style={{ padding:0, overflow:"hidden" }}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--surface3)", fontWeight:700 }}>All Orders</div>
        {loading ? (
          <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div>
        ) : (
          <table className="bo-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Table</th>
                <th>Cashier</th>
                <th>Payment</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id}>
                  <td style={{ fontWeight:600, fontFamily:"monospace", fontSize:12 }}>{o.code||o.id?.slice(-10)}</td>
                  <td style={{ color:"var(--ink4)", fontSize:12 }}>{o.created_at?.slice(0,10)} {o.time||""}</td>
                  <td>{o.table||"Walk-in"}</td>
                  <td>{o.staff||"-"}</td>
                  <td><span className="bo-badge bo-badge-blue">{o.pay||"-"}</span></td>
                  <td style={{ fontWeight:700 }}>{fmt(o.total)}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No orders in this period</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
