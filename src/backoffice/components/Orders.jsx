import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import * as XLSX from "xlsx"

const fmt = n => "Rp " + Math.round(n||0).toLocaleString("id-ID")

function sendWA(order) {
  const phone = order.customer_phone || prompt("Enter customer WhatsApp number (e.g. 628123456789):")
  if (!phone) return
  const clean = phone.replace(/\D/g,"").replace(/^0/,"62")
  const total = "Rp " + Math.round(order.total||0).toLocaleString("id-ID")
  const text = "Halo " + (order.customer||"Kak") + "!\n\nTerima kasih sudah makan di PawonLoka!\n\n*Struk Digital*\nNo. Order : " + order.id + "\nMeja      : " + (order.table||"Walk-in") + "\nTotal     : " + total + "\n\nLihat struk lengkap:\nhttps://pawonloka.pages.dev/receipt?id=" + order.id + "\n\nSampai jumpa lagi!"
  window.open("https://wa.me/" + clean + "?text=" + encodeURIComponent(text), "_blank")
}

const STATUS_COLORS = {
  paid:      { bg:"#DCFCE7", color:"#16A34A" },
  open:      { bg:"#FEF9C3", color:"#CA8A04" },
  void:      { bg:"#FEE2E2", color:"#DC2626" },
  voided:    { bg:"#FEE2E2", color:"#DC2626" },
  refunded:  { bg:"#FEE2E2", color:"#DC2626" },
  cancelled: { bg:"#FEE2E2", color:"#DC2626" },
}
const VOID_STATUSES = ["void","voided","refunded","cancelled"]

function todayStr() { return new Date().toISOString().slice(0,10) }

const VOID_REASONS = ["Customer changed mind","Wrong order","Item unavailable","Kitchen error","Other"]

export default function Orders() {
  const [orders,       setOrders]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [dateFrom,     setDateFrom]     = useState(todayStr)
  const [dateTo,       setDateTo]       = useState(todayStr)
  const [selected,     setSelected]     = useState(null)
  const [exporting,    setExporting]    = useState(false)
  const [voidModal,    setVoidModal]    = useState(null)
  const [voidReason,   setVoidReason]   = useState("")
  const [voidNote,     setVoidNote]     = useState("")
  const [voiding,      setVoiding]      = useState(false)
  const [staleOpen,     setStaleOpen]     = useState([])
  const [showStaleModal,setShowStaleModal]= useState(false)
  const [staleLoading,  setStaleLoading]  = useState(false)
  const [bulkVoiding,   setBulkVoiding]   = useState(false)

  async function releaseTable(table, tableArea) {
    if (!table) return
    let q = supabase.from("tables").update({ status: "Available", open_bill_id: null }).eq("name", table)
    if (tableArea) q = q.eq("area", tableArea)
    await q
  }

  async function openStaleCleanup() {
    setShowStaleModal(true)
    setStaleLoading(true)
    const { data } = await supabase.from("orders").select("*")
      .eq("status", "Open")
      .order("date", { ascending: true })
    setStaleOpen(data || [])
    setStaleLoading(false)
  }

  async function bulkVoidStale() {
    if (staleOpen.length === 0) return
    setBulkVoiding(true)
    const ids = staleOpen.map(o => o.id)
    await supabase.from("orders").update({
      status: "void",
      void_reason: "Manual cleanup: unresolved open bill voided via backoffice review",
      voided_by: "Backoffice (bulk cleanup)",
    }).in("id", ids)
    await Promise.all(staleOpen.map(o => releaseTable(o.table, o.table_area)))
    await supabase.from("audit_logs").insert({
      action: "void", module: "orders", user_name: "Backoffice",
      details: JSON.stringify({ bulk: true, count: ids.length, order_ids: ids }),
    }).catch(() => {})
    setBulkVoiding(false)
    setShowStaleModal(false)
    setStaleOpen([])
    await load()
  }

  async function doVoidOrder() {
    if (!voidReason) return
    setVoiding(true)
    const fullReason = voidNote ? voidReason + ": " + voidNote : voidReason
    await supabase.from("orders").update({
      status: "void",
      void_reason: fullReason,
      voided_by: "Backoffice",
    }).eq("id", voidModal.id)
    await releaseTable(voidModal.table, voidModal.table_area)
    supabase.from("audit_logs").insert({
      action: "void",
      module: "orders",
      user_name: "Backoffice",
      details: JSON.stringify({ order_id: voidModal.id, reason: fullReason, amount: voidModal.total }),
    }).catch(() => {})
    await load()
    setSelected(null); setVoidModal(null); setVoidReason(""); setVoidNote("")
    setVoiding(false)
  }

  useEffect(() => { load() }, [dateFrom, dateTo])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from("orders").select("*")
      .gte("created_at", dateFrom + "T00:00:00+08:00")
      .lte("created_at", dateTo   + "T23:59:59+08:00")
      .order("created_at", { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  function setQuick(days) {
    const to   = new Date()
    const from = new Date()
    from.setDate(from.getDate() - (days - 1))
    setDateFrom(from.toISOString().slice(0,10))
    setDateTo(to.toISOString().slice(0,10))
  }

  const filtered = orders.filter(o => {
    const matchStatus = statusFilter === "all" || (statusFilter === "void" ? VOID_STATUSES.includes(o.status?.toLowerCase()) : o.status?.toLowerCase() === statusFilter)
    const matchSearch = !search ||
      o.id?.toLowerCase().includes(search.toLowerCase()) ||
      o.staff?.toLowerCase().includes(search.toLowerCase()) ||
      o.customer?.toLowerCase().includes(search.toLowerCase()) ||
      o.table?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const paidOrders   = filtered.filter(o => o.status?.toLowerCase() === "paid")
  const totalRevenue = paidOrders.reduce((s,o) => s + (o.total||0), 0)
  const totalOrders  = paidOrders.length
  const avgOrder     = totalOrders ? totalRevenue / totalOrders : 0

  function exportExcel() {
    setExporting(true)
    try {
      const rows = filtered.map(o => ({
        "Order ID":    o.id,
        "Date":        o.created_at?.slice(0,10) || "",
        "Time":        o.created_at ? new Date(o.created_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}) : "",
        "Table":       o.table || o.order_type || "",
        "Staff":       o.staff || "",
        "Customer":    o.customer || "",
        "Items":       (o.items||[]).map(i => i.qty + "x " + i.name).join(", "),
        "Subtotal":    o.subtotal || 0,
        "Discount":    o.discount || 0,
        "Tax":         o.tax || 0,
        "Total":       o.total || 0,
        "Payment":     o.payment_method || "",
        "Status":      o.status || "",
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Orders")
      XLSX.writeFile(wb, "orders_" + dateFrom + "_to_" + dateTo + ".xlsx")
    } finally { setExporting(false) }
  }

  return (
    <div style={{ padding:24, maxWidth:1100, margin:"0 auto" }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:900, color:"var(--ink1)", marginBottom:4 }}>Orders History</div>
        <div style={{ fontSize:13, color:"var(--ink4)" }}>All transactions and order details</div>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
        {[
          ["Total Orders", totalOrders, "#0052CC"],
          ["Revenue",      fmt(totalRevenue), "#16A34A"],
          ["Avg Order",    fmt(avgOrder), "#7C3AED"],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background:"#fff", borderRadius:12, padding:"16px 20px", border:"1px solid #E8ECF0" }}>
            <div style={{ fontSize:12, color:"var(--ink4)", fontWeight:600, marginBottom:4 }}>{label}</div>
            <div style={{ fontSize:22, fontWeight:900, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:"14px 16px", marginBottom:16 }}>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:10 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"var(--ink4)", width:60 }}>Date Range</div>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="bo-input" style={{ width:150 }} />
          <span style={{ fontSize:13, color:"var(--ink4)" }}>to</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="bo-input" style={{ width:150 }} />
          <div style={{ display:"flex", gap:6, marginLeft:4 }}>
            {[["Today",1],["7D",7],["30D",30]].map(([label,days]) => (
              <button key={label} onClick={()=>setQuick(days)} className="bo-btn bo-btn-ghost" style={{ padding:"6px 12px", fontSize:12 }}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <input placeholder="Search order, staff, customer, table..." value={search}
            onChange={e=>setSearch(e.target.value)} className="bo-input" style={{ flex:1, minWidth:200 }} />
          <div style={{ display:"flex", gap:6 }}>
            {["all","paid","open","void"].map(s => (
              <button key={s} onClick={()=>setStatusFilter(s)}
                className={"bo-btn " + (statusFilter===s?"bo-btn-primary":"bo-btn-ghost")}
                style={{ textTransform:"capitalize", padding:"6px 14px" }}>{s}</button>
            ))}
          </div>
          <button onClick={load} className="bo-btn bo-btn-ghost">Refresh</button>
          <button onClick={exportExcel} disabled={exporting||filtered.length===0} className="bo-btn bo-btn-ghost" style={{ color:"#16A34A", borderColor:"#16A34A" }}>
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
          <button onClick={openStaleCleanup} className="bo-btn bo-btn-ghost" style={{ color:"#DC2626", borderColor:"#DC2626" }}>
            🧹 Cleanup Open Bills
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"#F8FAFC" }}>
              {["Order ID","Time","Table","Staff","Customer","Items","Total","Payment","Status"].map(h => (
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"var(--ink4)", borderBottom:"1px solid #E8ECF0", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign:"center", padding:40, color:"var(--ink4)" }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign:"center", padding:40, color:"var(--ink4)" }}>No orders found</td></tr>
            ) : filtered.map(o => {
              const sc   = STATUS_COLORS[o.status?.toLowerCase()] || STATUS_COLORS.open
              const time = o.created_at ? new Date(o.created_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}) : "-"
              return (
                <tr key={o.id} onClick={()=>setSelected(o)}
                  style={{ cursor:"pointer", borderBottom:"1px solid #F0F4F8" }}
                  onMouseEnter={e=>e.currentTarget.style.background="#F8FAFC"}
                  onMouseLeave={e=>e.currentTarget.style.background=""}>
                  <td style={{ padding:"10px 14px", fontSize:12, fontWeight:700, color:"#0052CC" }}>{o.id?.slice(-8)}</td>
                  <td style={{ padding:"10px 14px", fontSize:12, whiteSpace:"nowrap" }}>{time}</td>
                  <td style={{ padding:"10px 14px", fontSize:12 }}>{o.table||o.order_type||"-"}</td>
                  <td style={{ padding:"10px 14px", fontSize:12 }}>{o.staff||"-"}</td>
                  <td style={{ padding:"10px 14px", fontSize:12 }}>{o.customer||"-"}</td>
                  <td style={{ padding:"10px 14px", fontSize:12 }}>{(o.items||[]).length} items</td>
                  <td style={{ padding:"10px 14px", fontSize:13, fontWeight:700, whiteSpace:"nowrap" }}>{fmt(o.total)}</td>
                  <td style={{ padding:"10px 14px", fontSize:12 }}>{o.payment_method||"-"}</td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ ...sc, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700 }}>{o.status}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div style={{ padding:"10px 14px", borderTop:"1px solid #E8ECF0", fontSize:12, color:"var(--ink4)", display:"flex", gap:16 }}>
            <span>{filtered.length} orders shown</span>
            <span style={{ color:"#16A34A", fontWeight:700 }}>Paid: {fmt(totalRevenue)}</span>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selected && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setSelected(null)}>
          <div className="bo-modal" style={{ maxWidth:540 }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">Order {selected.id?.slice(-8)}</div>
              <button className="bo-modal-close" onClick={()=>setSelected(null)}>x</button>
            </div>
            <div className="bo-modal-body">
              {/* Info grid */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16, padding:"12px 14px", background:"#F8FAFC", borderRadius:10 }}>
                {[
                  ["Staff",    selected.staff||"-"],
                  ["Table",    selected.table||selected.order_type||"-"],
                  ["Customer", selected.customer||"-"],
                  ["Date",     selected.created_at ? new Date(selected.created_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"}) : "-"],
                  ["Status",   selected.status||"-"],
                  ["Payment",  selected.payment_method||"-"],
                ].map(([k,v])=>(
                  <div key={k} style={{ fontSize:12 }}>
                    <span style={{ color:"var(--ink4)", fontWeight:600 }}>{k}: </span>
                    <span style={{ fontWeight:700 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Items */}
              <div style={{ borderTop:"1px solid #E8ECF0", paddingTop:12, marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--ink4)", marginBottom:8, textTransform:"uppercase" }}>Items</div>
                {(selected.items||[]).map((item,i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #F8FAFC", fontSize:13 }}>
                    <div>
                      <span style={{ fontWeight:600 }}>{item.qty}x {item.name}</span>
                      {item.isBundle && item.bundleItems && (
                        <div style={{ fontSize:11, color:"var(--ink4)" }}>{item.bundleItems.map(b=>b.name).join(", ")}</div>
                      )}
                      {item.modifiers && Object.values(item.modifiers).length > 0 && (
                        <div style={{ fontSize:11, color:"#6366F1" }}>{Object.values(item.modifiers).join(", ")}</div>
                      )}
                      {item.note && <div style={{ fontSize:11, color:"var(--ink4)", fontStyle:"italic" }}>{item.note}</div>}
                    </div>
                    <div style={{ textAlign:'right', whiteSpace:'nowrap' }}>
                      {(item.itemDisc||0)>0&&<div style={{ fontSize:11, color:'#16A34A', fontWeight:600 }}>Diskon -{fmt((item.itemDisc||0)*item.qty)}</div>}
                      <span style={{ fontWeight:700 }}>{fmt((item.price-(item.itemDisc||0))*item.qty)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div style={{ display:"flex", flexDirection:"column", gap:5, padding:"10px 14px", background:"#F8FAFC", borderRadius:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                  <span style={{ color:"var(--ink4)" }}>Subtotal</span>
                  <span>{fmt(selected.subtotal)}</span>
                </div>
                {selected.discount > 0 && (
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#16A34A" }}>
                    <span>{selected.promo||"Discount"}</span><span>-{fmt(selected.discount)}</span>
                  </div>
                )}
                {selected.tax > 0 && (
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                    <span style={{ color:"var(--ink4)" }}>Tax</span><span>{fmt(selected.tax)}</span>
                  </div>
                )}
                {selected.service > 0 && (
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                    <span style={{ color:"var(--ink4)" }}>Service</span><span>{fmt(selected.service)}</span>
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:15, fontWeight:900, borderTop:"1px solid #E8ECF0", paddingTop:8, marginTop:4 }}>
                  <span>Total</span><span style={{ color:"#0052CC" }}>{fmt(selected.total)}</span>
                </div>
                {/* Payment breakdown */}
                {(selected.payments||[]).length > 0 && (
                  <div style={{ borderTop:"1px solid #E8ECF0", paddingTop:8, marginTop:4 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--ink4)", marginBottom:6, textTransform:"uppercase" }}>Payment Breakdown</div>
                    {(selected.payments||[]).map((p,i) => (
                      <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                        <span style={{ color:"var(--ink4)" }}>{p.method}</span>
                        <span style={{ fontWeight:600 }}>{fmt(p.amount)}</span>
                      </div>
                    ))}
                    {selected.change > 0 && (
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#16A34A" }}>
                        <span>Change</span><span>{fmt(selected.change)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setSelected(null)} className="bo-btn bo-btn-ghost">Close</button>
              {selected.status?.toLowerCase() === "paid" && (
                <button onClick={()=>sendWA(selected)} className="bo-btn bo-btn-primary">WA Receipt</button>
              )}
              {["paid","open"].includes(selected.status?.toLowerCase()) && (
                <button onClick={()=>{ setVoidModal(selected); setVoidReason(""); setVoidNote("") }}
                  className="bo-btn bo-btn-danger">Void Order</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Void reason modal */}
      {voidModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setVoidModal(null)}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title" style={{ color:"#DC2626" }}>Void Order</div>
              <button className="bo-modal-close" onClick={()=>setVoidModal(null)}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div style={{ background:"#FEF2F2", borderRadius:8, padding:"10px 12px", marginBottom:14, fontSize:13, color:"#DC2626" }}>
                ⚠ Order <strong>#{voidModal.id?.slice(-6)}</strong> · {fmt(voidModal.total)} akan di-void dan tidak dapat dikembalikan.
              </div>
              <div className="bo-form-row">
                <label className="bo-label">Alasan Void *</label>
                <select value={voidReason} onChange={e=>setVoidReason(e.target.value)} className="bo-select">
                  <option value="">— Pilih alasan —</option>
                  {VOID_REASONS.map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="bo-form-row">
                <label className="bo-label">Catatan tambahan</label>
                <input value={voidNote} onChange={e=>setVoidNote(e.target.value)} className="bo-input" placeholder="Optional..." />
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setVoidModal(null)} className="bo-btn bo-btn-ghost">Batal</button>
              <button onClick={doVoidOrder} disabled={!voidReason||voiding} className="bo-btn bo-btn-danger">
                {voiding?"Memproses...":"Konfirmasi Void"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stale open bills cleanup modal */}
      {showStaleModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&!bulkVoiding&&setShowStaleModal(false)}>
          <div className="bo-modal" style={{ maxWidth:560 }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title" style={{ color:"#DC2626" }}>Cleanup Open Bills</div>
              <button className="bo-modal-close" onClick={()=>setShowStaleModal(false)}>✕</button>
            </div>
            <div className="bo-modal-body">
              {staleLoading ? (
                <div style={{ textAlign:"center", padding:30, color:"var(--ink4)" }}>Memuat...</div>
              ) : staleOpen.length === 0 ? (
                <div style={{ textAlign:"center", padding:30, color:"var(--ink4)" }}>Tidak ada open bill yang tertinggal. 🎉</div>
              ) : (<>
                <div style={{ background:"#FEF2F2", borderRadius:8, padding:"10px 12px", marginBottom:14, fontSize:13, color:"#DC2626" }}>
                  ⚠ {staleOpen.length} order masih berstatus "Open" (termasuk hari ini) — periksa dulu sebelum void, karena tagihan meja yang sedang aktif juga akan muncul di sini. Setelah di-void, tidak akan masuk laporan penjualan dan tidak bisa dikembalikan.
                </div>
                <div style={{ maxHeight:280, overflowY:"auto", border:"1px solid #E8ECF0", borderRadius:8 }}>
                  {staleOpen.map(o => (
                    <div key={o.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 12px", borderBottom:"1px solid #F0F4F8", fontSize:12 }}>
                      <span>{o.date} · {o.table||o.order_type||"-"} · {o.staff||"-"}</span>
                      <span style={{ fontWeight:700 }}>{fmt(o.total)}</span>
                    </div>
                  ))}
                </div>
              </>)}
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setShowStaleModal(false)} className="bo-btn bo-btn-ghost" disabled={bulkVoiding}>Batal</button>
              {staleOpen.length > 0 && (
                <button onClick={bulkVoidStale} disabled={bulkVoiding||staleLoading} className="bo-btn bo-btn-danger">
                  {bulkVoiding ? "Memproses..." : `Void Semua (${staleOpen.length})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
