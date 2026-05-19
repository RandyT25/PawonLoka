import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n) { return "Rp " + Number(n || 0).toLocaleString("id-ID") }

const DUMMY_ORDERS = (() => {
  const today = new Date().toISOString().slice(0, 10)
  const yest  = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  return [
    { id:"d1",  code:"#1001", created_at:`${today}T08:14:00`, total:57750,  pay:"Cash",  staff:"Budi", table_name:"Table 2",  customer_id:"c1", cogs:14000, items_snapshot:[{name:"Nasi Goreng Telur",qty:2,price:20000},{name:"Teh Manis",qty:2,price:8000}] },
    { id:"d2",  code:"#1002", created_at:`${today}T08:38:00`, total:59290,  pay:"QRIS",  staff:"Budi", table_name:"Walk-in",   customer_id:"c2", cogs:15000, items_snapshot:[{name:"Ayam Bakar",qty:1,price:28000},{name:"Americano",qty:1,price:25000}] },
    { id:"d3",  code:"#1003", created_at:`${today}T09:05:00`, total:57750,  pay:"GoPay", staff:"Raka", table_name:"Table 4",   customer_id:"c3", cogs:12000, items_snapshot:[{name:"Matcha Latte",qty:2,price:25000}] },
    { id:"d4",  code:"#1004", created_at:`${today}T09:44:00`, total:57750,  pay:"Card",  staff:"Budi", table_name:"Table 1",   customer_id:null,  cogs:16000, items_snapshot:[{name:"Sate Kambing",qty:1,price:38000},{name:"Es Jeruk",qty:1,price:12000}] },
    { id:"d5",  code:"#1005", created_at:`${today}T10:20:00`, total:28875,  pay:"Cash",  staff:"Raka", table_name:"Walk-in",   customer_id:"c4", cogs:7000,  items_snapshot:[{name:"Bakmi Goreng",qty:1,price:25000}] },
    { id:"d6",  code:"#1006", created_at:`${today}T10:45:00`, total:57750,  pay:"Cash",  staff:"Budi", table_name:"Table 3",   customer_id:null,  cogs:13000, items_snapshot:[{name:"Latte",qty:2,price:25000}] },
    { id:"d7",  code:"#1007", created_at:`${today}T11:10:00`, total:49588,  pay:"QRIS",  staff:"Raka", table_name:"Table 5",   customer_id:"c2", cogs:11000, items_snapshot:[{name:"Nasi Goreng Spesial",qty:1,price:25000},{name:"Jus Alpukat",qty:1,price:18000}] },
    { id:"d8",  code:"#1008", created_at:`${today}T11:35:00`, total:50820,  pay:"OVO",   staff:"Budi", table_name:"Table 2",   customer_id:null,  cogs:9000,  items_snapshot:[{name:"Gado Gado",qty:2,price:22000}] },
    { id:"d9",  code:"#1009", created_at:`${today}T12:05:00`, total:96712,  pay:"Card",  staff:"Raka", table_name:"VIP Room",  customer_id:"c5", cogs:21000, items_snapshot:[{name:"Cappuccino",qty:3,price:28000}] },
    { id:"d10", code:"#1010", created_at:`${today}T12:30:00`, total:73140,  pay:"Cash",  staff:"Budi", table_name:"Table 1",   customer_id:null,  cogs:15000, items_snapshot:[{name:"Soto Ayam",qty:2,price:20000},{name:"Teh Tarik",qty:2,price:12000}] },
    { id:"d11", code:"#1011", created_at:`${today}T13:00:00`, total:25300,  pay:"GoPay", staff:"Raka", table_name:"Walk-in",   customer_id:"c3", cogs:8000,  items_snapshot:[{name:"Bakso Malang",qty:1,price:22000}] },
    { id:"d12", code:"#1012", created_at:`${today}T13:25:00`, total:67650,  pay:"Cash",  staff:"Budi", table_name:"Table 3",   customer_id:null,  cogs:14000, items_snapshot:[{name:"Es Kopi Susu",qty:2,price:22000},{name:"Mendoan",qty:1,price:15000}] },
    { id:"d13", code:"#1013", created_at:`${today}T14:00:00`, total:41400,  pay:"QRIS",  staff:"Raka", table_name:"Outdoor 1", customer_id:null,  cogs:7500,  items_snapshot:[{name:"Pisang Goreng",qty:3,price:12000}] },
    { id:"d14", code:"#1014", created_at:`${today}T14:30:00`, total:80500,  pay:"Card",  staff:"Budi", table_name:"Table 4",   customer_id:"c4", cogs:22000, items_snapshot:[{name:"Nasi Goreng Seafood",qty:2,price:35000}] },
    { id:"d15", code:"#1015", created_at:`${today}T15:10:00`, total:49588,  pay:"OVO",   staff:"Raka", table_name:"Walk-in",   customer_id:null,  cogs:12000, items_snapshot:[{name:"Latte",qty:1,price:25000},{name:"Croissant",qty:1,price:18000}] },
    { id:"y1",  code:"#0901", created_at:`${yest}T09:00:00`,  total:23000,  pay:"Cash",  staff:"Budi", table_name:"Table 1",   customer_id:null,  cogs:5500,  items_snapshot:[{name:"Nasi Goreng Telur",qty:1,price:20000}] },
    { id:"y2",  code:"#0902", created_at:`${yest}T10:00:00`,  total:57750,  pay:"QRIS",  staff:"Raka", table_name:"Table 2",   customer_id:"c2", cogs:13800, items_snapshot:[{name:"Latte",qty:2,price:25000}] },
    { id:"y3",  code:"#0903", created_at:`${yest}T12:00:00`,  total:32200,  pay:"GoPay", staff:"Budi", table_name:"Walk-in",   customer_id:null,  cogs:9200,  items_snapshot:[{name:"Ayam Bakar",qty:1,price:28000}] },
    { id:"y4",  code:"#0904", created_at:`${yest}T14:00:00`,  total:75900,  pay:"Cash",  staff:"Raka", table_name:"Table 5",   customer_id:"c5", cogs:19800, items_snapshot:[{name:"Es Kopi Susu",qty:3,price:22000}] },
    { id:"y5",  code:"#0905", created_at:`${yest}T15:30:00`,  total:57750,  pay:"Card",  staff:"Budi", table_name:"Table 3",   customer_id:null,  cogs:14400, items_snapshot:[{name:"Bakmi Goreng",qty:2,price:25000}] },
  ]
})()

const PAY_COLORS = { Cash:"var(--green)", QRIS:"var(--brand)", Card:"#1565C0", GoPay:"#00ADE0", OVO:"#4527A0", Other:"var(--ink4)" }

export default function Dashboard() {
  const [range,    setRange]    = useState("today")
  const [loading,  setLoading]  = useState(true)
  const [useDummy, setUseDummy] = useState(false)
  const [stats,    setStats]    = useState({ sales:0, orders:0, customers:0, avgOrder:0, grossProfit:0, prevSales:0 })
  const [payments, setPayments] = useState([])
  const [topItems, setTopItems] = useState([])
  const [hourData, setHourData] = useState([])
  const [recent,   setRecent]   = useState([])

  useEffect(() => { load() }, [range, useDummy])

  async function load() {
    setLoading(true)
    let orders = []

    if (useDummy) {
      orders = DUMMY_ORDERS
    } else {
      // fetch orders only — no join to avoid 400
      const now  = new Date()
      let from   = new Date()
      if (range === "today") { from.setHours(0,0,0,0) }
      if (range === "week")  { from.setDate(now.getDate() - now.getDay()); from.setHours(0,0,0,0) }
      if (range === "month") { from.setDate(1); from.setHours(0,0,0,0) }
      from = new Date(from.getTime() - 8 * 60 * 60 * 1000) // UTC+8 Bali

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("status", "Paid")
        .gte("created_at", from.toISOString())
        .order("created_at", { ascending: false })

      if (error) { console.error("Dashboard load error:", error); setLoading(false); return }
      orders = data || []
    }

    // filter by range for dummy data
    const today      = new Date().toISOString().slice(0, 10)
    const yest       = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const weekStart  = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0,10) })()
    const monthStart = new Date().toISOString().slice(0, 7) + "-01"

    const filterDate = (o) => {
      const d = o.created_at.slice(0, 10)
      if (range === "today") return d === today
      if (range === "week")  return d >= weekStart
      if (range === "month") return d >= monthStart
      return true
    }

    const periodOrders = useDummy ? orders.filter(filterDate) : orders
    const prevOrders   = useDummy ? orders.filter(o => o.created_at.slice(0,10) === yest) : []

    const totalSales = periodOrders.reduce((s, o) => s + (o.total || 0), 0)
    const totalCogs  = periodOrders.reduce((s, o) => s + (o.cogs  || 0), 0)
    const prevSales  = prevOrders.reduce((s, o) => s + (o.total   || 0), 0)
    const avgOrder   = periodOrders.length ? Math.round(totalSales / periodOrders.length) : 0
    const custSet    = new Set(periodOrders.filter(o => o.customer_id).map(o => o.customer_id))

    // Payment breakdown
    const payMap = {}
    periodOrders.forEach(o => {
      const m = o.pay || "Other"
      payMap[m] = (payMap[m] || 0) + (o.total || 0)
    })
    const payArr = Object.entries(payMap)
      .map(([method, amount]) => ({ method, amount, pct: totalSales ? Math.round(amount / totalSales * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount)

    // Top items — from items_snapshot (stored JSON) or order_items array
    const itemMap = {}
    periodOrders.forEach(o => {
      const items = o.items_snapshot || o.order_items || []
      const parsed = typeof items === "string" ? JSON.parse(items) : items
      ;(parsed || []).forEach(i => {
        if (!itemMap[i.name]) itemMap[i.name] = { name:i.name, qty:0, revenue:0 }
        itemMap[i.name].qty     += (i.qty || 1)
        itemMap[i.name].revenue += (i.price || 0) * (i.qty || 1)
      })
    })
    const topArr = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 8)
    const maxQty = topArr[0]?.qty || 1

    // Sales by hour
    const hMap = {}
    for (let h = 7; h <= 21; h++) hMap[h] = 0
    periodOrders.forEach(o => {
      const h = new Date(o.created_at).getHours()
      if (h >= 7 && h <= 21) hMap[h] = (hMap[h] || 0) + (o.total || 0)
    })
    const hourArr  = Object.entries(hMap).map(([h, v]) => ({ hour: h + ":00", value: v }))
    const maxHour  = Math.max(...hourArr.map(h => h.value), 1)

    setStats({ sales:totalSales, orders:periodOrders.length, customers:custSet.size, avgOrder, grossProfit:totalSales - totalCogs, prevSales })
    setPayments(payArr)
    setTopItems(topArr.map(t => ({ ...t, maxQty })))
    setHourData(hourArr.map(h => ({ ...h, maxHour })))
    setRecent(periodOrders.slice(0, 8))
    setLoading(false)
  }

  const trend = stats.prevSales > 0
    ? Math.round((stats.sales - stats.prevSales) / stats.prevSales * 100)
    : null

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {[["today","Today"],["week","This Week"],["month","This Month"]].map(([v, l]) => (
          <button key={v} onClick={() => setRange(v)}
            className={"bo-btn bo-btn-sm " + (range === v ? "bo-btn-primary" : "bo-btn-ghost")}>
            {l}
          </button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          {loading && <span style={{ fontSize:12, color:"var(--ink5)" }}>Loading…</span>}
          <button
            className={"bo-btn bo-btn-sm " + (useDummy ? "bo-btn-primary" : "bo-btn-ghost")}
            onClick={() => setUseDummy(d => !d)}>
            {useDummy ? "🎲 Demo ON" : "🎲 Demo"}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="bo-metrics">
        <div className="bo-met blue">
          <div className="bo-met-label">Total Sales</div>
          <div className="bo-met-val">{fmt(stats.sales)}</div>
          <div className="bo-met-sub">
            {range === "today" && trend !== null
              ? <span style={{ color: trend >= 0 ? "var(--green)" : "var(--red)", fontWeight:700 }}>
                  {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% vs yesterday
                </span>
              : <span>{stats.orders} orders</span>
            }
          </div>
        </div>
        <div className="bo-met green">
          <div className="bo-met-label">Gross Profit</div>
          <div className="bo-met-val">{fmt(stats.grossProfit)}</div>
          <div className="bo-met-sub">Margin {stats.sales > 0 ? Math.round(stats.grossProfit / stats.sales * 100) : 0}%</div>
        </div>
        <div className="bo-met amber">
          <div className="bo-met-label">Avg Order</div>
          <div className="bo-met-val">{fmt(stats.avgOrder)}</div>
          <div className="bo-met-sub">Per transaction</div>
        </div>
        <div className="bo-met blue">
          <div className="bo-met-label">Orders</div>
          <div className="bo-met-val">{stats.orders}</div>
          <div className="bo-met-sub">{stats.customers} with account</div>
        </div>
      </div>

      {/* Sales by Hour */}
      <div className="bo-card" style={{ marginBottom:16 }}>
        <div className="bo-card-title">
          Sales by Hour
          {!useDummy && hourData.every(h => h.value === 0) &&
            <span style={{ fontSize:11, color:"var(--ink5)", fontWeight:400, marginLeft:8 }}>— no data yet</span>}
        </div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:80 }}>
          {hourData.map(h => {
            const pct    = h.maxHour > 0 ? Math.max(4, Math.round(h.value / h.maxHour * 100)) : 4
            const active = h.value > 0
            return (
              <div key={h.hour} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                <div title={fmt(h.value)} style={{
                  width:"100%", height: pct * 0.76 + "%", minHeight:4,
                  borderRadius:"3px 3px 0 0",
                  background: active ? "var(--brand)" : "var(--surface2)",
                  transition:"height 0.3s"
                }} />
                <span style={{ fontSize:9, color:"var(--ink5)", whiteSpace:"nowrap" }}>{h.hour.replace(":00","")}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Payment + Top Items */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <div className="bo-card" style={{ marginBottom:0 }}>
          <div className="bo-card-title">Payment Methods</div>
          {payments.length === 0
            ? <div style={{ color:"var(--ink5)", fontSize:13, padding:"12px 0" }}>No data for this period</div>
            : payments.map(p => (
              <div key={p.method} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:"var(--ink)", display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background: PAY_COLORS[p.method] || "var(--ink4)", display:"inline-block" }} />
                    {p.method}
                  </span>
                  <span style={{ fontSize:12, fontWeight:700, color:"var(--ink3)" }}>{fmt(p.amount)}</span>
                </div>
                <div style={{ height:5, background:"var(--surface2)", borderRadius:3, overflow:"hidden" }}>
                  <div style={{ height:"100%", width: p.pct + "%", background: PAY_COLORS[p.method] || "var(--ink4)", borderRadius:3, transition:"width 0.4s" }} />
                </div>
                <div style={{ fontSize:10, color:"var(--ink5)", marginTop:2 }}>{p.pct}% of sales</div>
              </div>
            ))
          }
        </div>

        <div className="bo-card" style={{ marginBottom:0 }}>
          <div className="bo-card-title">Top Items <span style={{ fontSize:11, color:"var(--ink5)", fontWeight:400 }}>by qty sold</span></div>
          {topItems.length === 0
            ? <div style={{ color:"var(--ink5)", fontSize:13, padding:"12px 0" }}>No data for this period</div>
            : topItems.map((item, i) => (
              <div key={item.name} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{
                  width:22, height:22, borderRadius:"50%",
                  background: i < 3 ? "var(--brand)" : "var(--surface2)",
                  color: i < 3 ? "#fff" : "var(--ink4)",
                  fontSize:10, fontWeight:800,
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0
                }}>{i + 1}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:"var(--ink)", marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</div>
                  <div style={{ height:4, background:"var(--surface2)", borderRadius:2, overflow:"hidden" }}>
                    <div style={{ height:"100%", width: Math.round(item.qty / item.maxQty * 100) + "%", background:"var(--brand)", borderRadius:2 }} />
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"var(--brand)" }}>{item.qty}x</div>
                  <div style={{ fontSize:10, color:"var(--ink5)" }}>{fmt(item.revenue)}</div>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* P&L Summary */}
      <div className="bo-card" style={{ marginBottom:16 }}>
        <div className="bo-card-title">P&amp;L Summary</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:0 }}>
          {[
            { label:"Gross Revenue", val: fmt(stats.sales),       color:"var(--ink)" },
            { label:"Est. COGS",     val: fmt(stats.sales - stats.grossProfit), color:"var(--red)" },
            { label:"Gross Profit",  val: fmt(stats.grossProfit), color: stats.grossProfit >= 0 ? "var(--green)" : "var(--red)" },
          ].map((r, i) => (
            <div key={r.label} style={{ padding:"14px 20px", borderRight: i < 2 ? "1px solid var(--surface3)" : "none", textAlign:"center" }}>
              <div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>{r.label}</div>
              <div style={{ fontSize:20, fontWeight:800, color: r.color, letterSpacing:"-0.5px" }}>{r.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bo-card">
        <div className="bo-card-title">
          Recent Orders
          <span style={{ fontSize:11, color:"var(--ink5)", fontWeight:400, marginLeft:8 }}>{stats.orders} total this period</span>
        </div>
        <table className="bo-table">
          <thead>
            <tr><th>Order</th><th>Table</th><th>Staff</th><th>Payment</th><th>Total</th><th>Time</th></tr>
          </thead>
          <tbody>
            {recent.length === 0
              ? <tr><td colSpan={6} style={{ textAlign:"center", color:"var(--ink5)", padding:"28px 0" }}>
                  No orders yet — click 🎲 Demo to preview
                </td></tr>
              : recent.map(o => {
                  const payBadge = { Cash:"bo-badge-green", QRIS:"bo-badge-blue", Card:"bo-badge-blue", GoPay:"bo-badge-blue", OVO:"bo-badge-amber" }
                  const timeStr  = new Date(o.created_at).toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit" })
                  return (
                    <tr key={o.id}>
                      <td style={{ fontWeight:600 }}>{o.code || "#" + String(o.id).slice(-6)}</td>
                      <td>{o.table_name || o.table || "Walk-in"}</td>
                      <td style={{ color:"var(--ink3)" }}>{o.staff || "-"}</td>
                      <td><span className={"bo-badge " + (payBadge[o.pay] || "bo-badge-amber")}>{o.pay || "-"}</span></td>
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
