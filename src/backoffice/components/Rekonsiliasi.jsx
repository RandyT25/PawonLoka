import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "../../lib/supabase"
import DateRangePicker, { buildDateRange } from "./DateRangePicker"
import { explodeOrderPayments } from "../../shared/orderPricing"

const fmt = n => "Rp " + Number(n||0).toLocaleString("id-ID")
const fmtDate = d => d ? new Date(d).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "—"
const fmtDateShort = d => d ? new Date(d).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}) : "—"

const PAY_METHOD_MAP = {
  Cash: "Kas Outlet",
  QRIS: "Bank Transfer Qris",
  Transfer: "Bank Transfer",
  "Debit/Credit": "Bank Transfer Card",
}

function genReconNo(shiftId, method) {
  const code = (shiftId||"").slice(0,6).toUpperCase().replace(/-/g,"")
  const m = method.replace(/[^A-Z]/gi,"").slice(0,3).toUpperCase()
  return `STL/${code}/${m}`
}

export default function Rekonsiliasi() {
  const todayStr = new Date().toISOString().slice(0,10)
  const [records,      setRecords]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [search,       setSearch]       = useState("")
  const [range,        setRange]        = useState("today")
  const [customDate,   setCustomDate]   = useState(todayStr)
  const [customDateTo, setCustomDateTo] = useState(todayStr)
  const [editModal,    setEditModal]    = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [editForm,     setEditForm]     = useState({ status:"reconciled", notes:"", bank_ref:"", reconciled_by:"Claudy" })
  const [toast,        setToast]        = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { fromStr, toStr } = buildDateRange(range, customDate, customDateTo)

    let q = supabase.from("orders").select("*").gte("created_at", fromStr)
    if (toStr) q = q.lte("created_at", toStr)
    const [{ data: orders, error }, { data: shifts }, { data: cashLogs }] = await Promise.all([
      q.order("created_at", { ascending: false }),
      supabase.from("shifts").select("id,date,float_open,cash_sales,created_at").gte("created_at", fromStr),
      supabase.from("cash_logs").select("type,amount,date").gte("date", fromStr.slice(0,10)),
    ])

    if (error) { console.error("Rekonsiliasi query error:", error.message); setLoading(false); return }

    // Load existing reconciliation records for the same period
    const { data: recons } = await supabase
      .from("reconciliations").select("*").gte("created_at", fromStr)
    const reconMap = {}
    ;(recons || []).forEach(r => { reconMap[r.recon_no] = r })

    // Build per-day cash flow data from shifts + cash_logs
    // Expected Cash = float_open + cashSales + topups - expenses + returns
    const cashFlowByDay = {}
    for (const sh of shifts || []) {
      const day = sh.date || sh.created_at?.slice(0,10) || "?"
      if (!cashFlowByDay[day]) cashFlowByDay[day] = { float_open: 0, expenses: 0, topups: 0, returns: 0 }
      cashFlowByDay[day].float_open += (sh.float_open || 0)
    }
    for (const log of cashLogs || []) {
      const day = log.date || "?"
      if (!cashFlowByDay[day]) cashFlowByDay[day] = { float_open: 0, expenses: 0, topups: 0, returns: 0 }
      if (log.type === "expense") cashFlowByDay[day].expenses += (log.amount || 0)
      else if (log.type === "topup") cashFlowByDay[day].topups += (log.amount || 0)
      else if (log.type === "return") cashFlowByDay[day].returns += (log.amount || 0)
    }

    // Group PAID orders by date × payment method
    const groups = {}
    for (const o of orders || []) {
      if (o.status && o.status !== "Paid" && o.status !== "paid") continue
      const day = o.date || o.created_at?.slice(0,10) || "?"
      explodeOrderPayments(o).forEach(({ method, amount }) => {
        const key = day + "|" + method
        if (!groups[key]) groups[key] = { date:day, pay:method, amount:0, count:0, cashier: o.staff||"—" }
        groups[key].amount += amount
        groups[key].count++
      })
    }

    const rows = Object.values(groups).map(g => {
      const recon_no = `STL/${g.date.replace(/-/g,"").slice(2)}/${g.pay.replace(/[^A-Za-z]/g,"").slice(0,3).toUpperCase()}`
      const existing = reconMap[recon_no]
      // Compute expected cash for Cash rows using the full drawer formula
      let expected_cash = null
      if (g.pay === "Cash") {
        const flow = cashFlowByDay[g.date] || { float_open:0, expenses:0, topups:0, returns:0 }
        expected_cash = flow.float_open + g.amount + flow.topups - flow.expenses + flow.returns
      }
      return {
        id:             existing?.id || null,
        recon_no,
        date:           g.date,
        payment_method: PAY_METHOD_MAP[g.pay] || g.pay,
        cashier_name:   g.cashier,
        outlet:         "PawonLoka",
        amount:         g.amount,
        orders_count:   g.count,
        expected_cash,
        status:         existing?.status || "unreconciled",
        reconciled_at:  existing?.reconciled_at || null,
        reconciled_by:  existing?.reconciled_by || null,
        notes:          existing?.notes || "",
        bank_ref:       existing?.bank_ref || "",
      }
    }).sort((a,b) => b.date.localeCompare(a.date))

    setRecords(rows)
    setLoading(false)
  }, [range, customDate, customDateTo])

  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load })
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  async function saveRecon() {
    if (!editModal) return
    setSaving(true)
    setToast(null)

    const payload = {
      recon_no:       editModal.recon_no,
      payment_method: editModal.payment_method,
      cashier_name:   editModal.cashier_name,
      outlet:         editModal.outlet,
      amount:         editModal.amount,
      status:         editForm.status,
      notes:          editForm.notes,
      bank_ref:       editForm.bank_ref,
      reconciled_by:  editForm.reconciled_by,
      reconciled_at:  editForm.status === "reconciled" ? new Date().toISOString() : null,
    }

    let error
    if (editModal.id) {
      ;({ error } = await supabase.from("reconciliations").update(payload).eq("id", editModal.id))
    } else {
      ;({ error } = await supabase.from("reconciliations").insert(payload))
    }

    setSaving(false)
    if (error) {
      console.error("saveRecon error:", error)
      setToast({ type:"error", message: "Gagal menyimpan: " + (error.message || "unknown error") })
      return
    }

    setEditModal(null)
    setToast({ type:"success", message: "Rekonsiliasi berhasil disimpan" })
    loadRef.current()
  }

  const STAFF_LIST = ["Claudy","Nita","Aisyah","Mahes","Meldy","Oji","Yudi","Alin"]

  const filtered = records.filter(r => {
    const matchStatus = statusFilter === "all" || r.status === statusFilter
    const matchSearch = !search ||
      r.recon_no.toLowerCase().includes(search.toLowerCase()) ||
      r.cashier_name.toLowerCase().includes(search.toLowerCase()) ||
      r.payment_method.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const totalAll    = records.reduce((a,r)=>a+r.amount,0)
  const totalRecon  = records.filter(r=>r.status==="reconciled").reduce((a,r)=>a+r.amount,0)
  const totalUnrecon= records.filter(r=>r.status==="unreconciled").reduce((a,r)=>a+r.amount,0)

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:8 }}>
        <div style={{ fontSize:18, fontWeight:900, color:"var(--ink1)", marginBottom:12 }}>Rekonsiliasi Penerimaan Penjualan</div>
        <DateRangePicker
          range={range} setRange={setRange}
          customDate={customDate} setCustomDate={setCustomDate}
          customDateTo={customDateTo} setCustomDateTo={setCustomDateTo}
          loading={loading}
        />
      </div>

      {/* KPI cards */}
      <div className="bo-rekon-kpi">
        {[
          ["Total Penerimaan", fmt(totalAll), "#0052CC", records.length+" transaksi"],
          ["Terekonsiliasi",   fmt(totalRecon), "#00875A", records.filter(r=>r.status==="reconciled").length+" transaksi"],
          ["Belum Rekonsiliasi", fmt(totalUnrecon), "#DE350B", records.filter(r=>r.status==="unreconciled").length+" transaksi"],
        ].map(([l,v,c,sub])=>(
          <div key={l} style={{ background:"#fff", borderRadius:12, padding:"14px 16px", border:"1px solid #E8ECF0", borderTop:`3px solid ${c}` }}>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--ink4)", marginBottom:4 }}>{l}</div>
            <div style={{ fontSize:18, fontWeight:900, color:c }}>{v}</div>
            <div style={{ fontSize:11, color:"var(--ink5)", marginTop:2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} className="bo-input"
          placeholder="Cari ..." style={{ width:200 }} />
        <div style={{ display:"flex", gap:4 }}>
          {[["all","Semua"],["reconciled","Terekonsiliasi"],["unreconciled","Belum Terekonsiliasi"]].map(([v,l])=>(
            <button key={v} onClick={()=>setStatusFilter(v)}
              className={"bo-btn bo-btn-sm "+(statusFilter===v?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bo-card" style={{ padding:0, overflowX:"auto" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
          <table className="bo-table">
            <thead>
              <tr>
                <th>NO REKONSILIASI</th>
                <th>TANGGAL REKONSILIASI</th>
                <th>TUTUP KASIR</th>
                <th>METODE BAYAR</th>
                <th>KASIR</th>
                <th>OUTLET</th>
                <th>JUMLAH</th>
                <th title="Modal + Penjualan Kas + Topup - Pengeluaran + Retur">EKSPEKTASI KAS</th>
                <th title="Ekspektasi - Aktual (hanya Kas)">SELISIH</th>
                <th>STATUS</th>
                <th style={{ width:40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r,i)=>{
                const variance = r.expected_cash != null ? r.expected_cash - r.amount : null
                return (
                <tr key={i}>
                  <td style={{ fontFamily:"monospace", fontSize:12, fontWeight:700 }}>{r.recon_no}</td>
                  <td style={{ fontSize:12 }}>{r.reconciled_at ? fmtDate(r.reconciled_at) : "—"}</td>
                  <td style={{ fontSize:12 }}>{r.date || "—"}</td>
                  <td style={{ fontSize:13, fontWeight:600 }}>{r.payment_method}</td>
                  <td style={{ fontSize:13 }}>{r.cashier_name}</td>
                  <td style={{ fontSize:12 }}>{r.outlet}</td>
                  <td style={{ fontSize:13, fontWeight:700 }}>{fmt(r.amount)}</td>
                  <td style={{ fontSize:13, fontWeight:700, color:"#0052CC" }}>
                    {r.expected_cash != null ? fmt(r.expected_cash) : "—"}
                  </td>
                  <td style={{ fontSize:13, fontWeight:700, color: variance == null ? "var(--ink5)" : variance < 0 ? "#DE350B" : "#00875A" }}>
                    {variance == null ? "—" : (variance >= 0 ? "+" : "") + fmt(variance)}
                  </td>
                  <td>
                    <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:10, whiteSpace:"nowrap",
                      background: r.status==="reconciled" ? "#E3FCEF" : "#FFEBE6",
                      color: r.status==="reconciled" ? "#00875A" : "#DE350B" }}>
                      {r.status==="reconciled" ? "Terekonsiliasi" : "Belum Terekonsiliasi"}
                    </span>
                  </td>
                  <td>
                    <button onClick={()=>{ setEditForm({ status:r.status, notes:r.notes||"", bank_ref:r.bank_ref||"", reconciled_by:r.reconciled_by||"Claudy" }); setEditModal(r) }}
                      style={{ background:"none", border:"none", cursor:"pointer", color:"var(--brand)", fontSize:16, padding:"4px 8px" }}>
                      ✏️
                    </button>
                  </td>
                </tr>
              )})}
              {filtered.length===0 && (
                <tr><td colSpan={11} style={{ textAlign:"center", color:"var(--ink5)", padding:"40px 0" }}>
                  {loading ? "Loading..." : "Tidak ada data rekonsiliasi"}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)",
          background: toast.type === "success" ? "#00875A" : "#DE350B",
          color:"#fff", borderRadius:10, padding:"12px 22px",
          fontSize:13, fontWeight:600, whiteSpace:"nowrap",
          boxShadow:"0 4px 20px rgba(0,0,0,0.25)", zIndex:99999,
          animation:"fadeInUp 0.2s ease",
        }}>
          {toast.type === "success" ? "✓ " : "⚠ "}{toast.message}
        </div>
      )}
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>

      {/* Edit Modal */}
      {editModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setEditModal(null)}>
          <div className="bo-modal" style={{ maxWidth:500 }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">Rekonsiliasi</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>{editModal.recon_no}</div>
              </div>
              <button className="bo-modal-close" onClick={()=>setEditModal(null)}>x</button>
            </div>
            <div className="bo-modal-body">
              {/* Info */}
              <div style={{ background:"#F8FAFC", borderRadius:10, padding:"12px 14px", marginBottom:14, display:"grid", gridTemplateColumns:"120px 1fr", gap:"6px 12px", fontSize:13 }}>
                <span style={{ color:"var(--ink4)", fontWeight:600 }}>Tutup Kasir</span><span>{editModal.date || "—"}</span>
                <span style={{ color:"var(--ink4)", fontWeight:600 }}>Metode Bayar</span><span style={{ fontWeight:700 }}>{editModal.payment_method}</span>
                <span style={{ color:"var(--ink4)", fontWeight:600 }}>Kasir</span><span>{editModal.cashier_name}</span>
                <span style={{ color:"var(--ink4)", fontWeight:600 }}>Penjualan Kas</span><span style={{ fontWeight:900, color:"var(--brand)", fontSize:15 }}>{fmt(editModal.amount)}</span>
                {editModal.expected_cash != null && (<>
                  <span style={{ color:"var(--ink4)", fontWeight:600 }}>Ekspektasi Kas</span>
                  <span style={{ fontWeight:700, color:"#0052CC" }}>{fmt(editModal.expected_cash)}
                    <span style={{ fontSize:11, color:"var(--ink5)", fontWeight:400, marginLeft:6 }}>= Modal + Penjualan + Topup − Pengeluaran + Retur</span>
                  </span>
                  <span style={{ color:"var(--ink4)", fontWeight:600 }}>Selisih</span>
                  <span style={{ fontWeight:900, fontSize:14, color: (editModal.expected_cash - editModal.amount) < 0 ? "#DE350B" : "#00875A" }}>
                    {(editModal.expected_cash - editModal.amount) >= 0 ? "+" : ""}{fmt(editModal.expected_cash - editModal.amount)}
                    {(editModal.expected_cash - editModal.amount) < 0 && <span style={{ fontSize:11, marginLeft:6, fontWeight:600 }}>⚠ KAS KURANG</span>}
                  </span>
                </>)}
              </div>

              <div style={{ marginBottom:12 }}>
                <label className="bo-label">Status</label>
                <div style={{ display:"flex", gap:8 }}>
                  {[["reconciled","Terekonsiliasi"],["unreconciled","Belum Terekonsiliasi"]].map(([v,l])=>(
                    <label key={v} onClick={()=>setEditForm(f=>({...f,status:v}))}
                      style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:8, cursor:"pointer", fontSize:13,
                        border:`1.5px solid ${editForm.status===v?"var(--brand)":"#DFE1E6"}`,
                        background: editForm.status===v ? "var(--brand-lt)" : "#fff" }}>
                      <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${editForm.status===v?"var(--brand)":"#DFE1E6"}`,
                        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        {editForm.status===v && <div style={{ width:8, height:8, borderRadius:"50%", background:"var(--brand)" }} />}
                      </div>
                      {l}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:12 }}>
                <label className="bo-label">Direkonsiliasi Oleh</label>
                <select className="bo-select" value={editForm.reconciled_by} onChange={e=>setEditForm(f=>({...f,reconciled_by:e.target.value}))}>
                  {STAFF_LIST.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>

              <div style={{ marginBottom:12 }}>
                <label className="bo-label">Referensi Bank</label>
                <input className="bo-input" value={editForm.bank_ref}
                  onChange={e=>setEditForm(f=>({...f,bank_ref:e.target.value}))}
                  placeholder="No. referensi mutasi bank" />
              </div>

              <div>
                <label className="bo-label">Catatan</label>
                <textarea className="bo-input" rows={2} value={editForm.notes}
                  onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))}
                  placeholder="Catatan rekonsiliasi..." />
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setEditModal(null)} className="bo-btn bo-btn-ghost">Batal</button>
              <button onClick={saveRecon} disabled={saving} className="bo-btn bo-btn-primary">
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
