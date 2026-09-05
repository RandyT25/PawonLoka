import { useState, useEffect, useMemo, useCallback } from "react"
import { supabase } from "../../../lib/supabase"
import { qr } from "../../../lib/quickRead"

const fmt = n => "Rp " + Number(n || 0).toLocaleString("id-ID")
const fmtNum = n => Number(n || 0).toLocaleString("id-ID")

const DEFAULT_CRITICAL_ITEMS = [
  'ING-1780245811602', // Ayam Bumbu Kuning (sub) (Ayam Ungkep)
  'ING-007',           // Ayam Taliwang (sub)
  'ING-1781766220889', // Sop Ayam (sub)
  'ING-183',           // Telor
  'ING-154',           // Sate Kambing (sub)
  'ING-155',           // Sate Ayam (sub)
  'ING-170',           // Sop Iga Kambing (sub)
  'ING-200',           // Tulang Iga Kambing
  'ING-201',           // Tulang Kambing
  'ING-046'            // Daging Kambing
]

export default function InvDailyRecon() {
  const [submissions, setSubmissions] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [trackedItemIds, setTrackedItemIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewDetail, setViewDetail] = useState(null)
  const [showManageModal, setShowManageModal] = useState(false)
  const [searchIng, setSearchIng] = useState("")
  const [savingSettings, setSavingSettings] = useState(false)
  const [filterPeriod, setFilterPeriod] = useState("month") // today | week | month | all
  const [customFrom, setCustomFrom] = useState(new Date().toISOString().slice(0, 10))
  const [customTo, setCustomTo] = useState(new Date().toISOString().slice(0, 10))
  const [processingId, setProcessingId] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: subs },
        { data: ings },
        { data: settings }
      ] = await Promise.all([
        supabase.from("staff_submissions").select("*").eq("type", "daily_recon").order("submitted_at", { ascending: false }),
        supabase.from("ingredients").select("id, name, unit, stock, cost_per_unit, category").order("name"),
        supabase.from("app_settings").select("pos_behaviour").eq("id", "main").single()
      ])

      setSubmissions(subs || [])
      setIngredients(ings || [])
      
      const currentTracked = settings?.pos_behaviour?.daily_stock_items?.length
        ? settings.pos_behaviour.daily_stock_items
        : DEFAULT_CRITICAL_ITEMS
      setTrackedItemIds(currentTracked)
    } catch (err) {
      console.error("Error loading daily recon data:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filter submissions by selected period
  const filteredSubmissions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return submissions.filter(sub => {
      const subDate = sub.data?.date || (sub.submitted_at || "").slice(0, 10)
      if (filterPeriod === "today") return subDate === today
      if (filterPeriod === "week") {
        const d = new Date()
        d.setDate(d.getDate() - 7)
        return subDate >= d.toISOString().slice(0, 10)
      }
      if (filterPeriod === "month") {
        const d = new Date()
        d.setDate(1)
        return subDate >= d.toISOString().slice(0, 10)
      }
      if (filterPeriod === "custom") {
        return subDate >= customFrom && subDate <= customTo
      }
      return true
    })
  }, [submissions, filterPeriod, customFrom, customTo])

  // Calculate KPIs
  const kpis = useMemo(() => {
    let totalLoss = 0
    let totalSurplus = 0
    const itemDiscrepancies = {}

    filteredSubmissions.forEach(sub => {
      const items = sub.data?.items || []
      items.forEach(item => {
        const diffQty = item.diff_qty || 0
        const unitCost = item.cost_per_unit || 0
        if (diffQty < 0) {
          const val = Math.abs(diffQty) * unitCost
          totalLoss += val
          itemDiscrepancies[item.name] = (itemDiscrepancies[item.name] || 0) + val
        } else if (diffQty > 0) {
          totalSurplus += diffQty * unitCost
        }
      })
    })

    const topLeaked = Object.entries(itemDiscrepancies)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)

    return {
      daysCounted: filteredSubmissions.length,
      totalLoss,
      totalSurplus,
      topLeaked
    }
  }, [filteredSubmissions])

  // Save Tracked Items in Settings
  async function handleToggleTracked(ingId) {
    const isCurrentlyTracked = trackedItemIds.includes(ingId)
    const nextList = isCurrentlyTracked
      ? trackedItemIds.filter(id => id !== ingId)
      : [...trackedItemIds, ingId]

    setTrackedItemIds(nextList)
    setSavingSettings(true)
    try {
      const { data: cur } = await supabase.from("app_settings").select("pos_behaviour").eq("id", "main").single()
      const updated = { ...(cur?.pos_behaviour || {}), daily_stock_items: nextList }
      await supabase.from("app_settings").update({ pos_behaviour: updated }).eq("id", "main")
    } catch (err) {
      alert("Gagal memperbarui pengaturan: " + err.message)
    } finally {
      setSavingSettings(false)
    }
  }

  // Approve & optionally sync stock
  async function handleApprove(sub, syncStock = false) {
    if (!window.confirm(syncStock ? "Setujui rekonsiliasi dan perbarui stok live sesuai fisik kasir?" : "Tandai rekonsiliasi ini sebagai disetujui?")) return
    setProcessingId(sub.id)
    try {
      if (syncStock) {
        const items = sub.data?.items || []
        for (const it of items) {
          if (it.actual_qty !== undefined && it.diff_qty !== 0) {
            await supabase.from("ingredients").update({ stock: it.actual_qty }).eq("id", it.ingredient_id)
            await supabase.from("stock_movements").insert({
              id: "MOV-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
              type: "Adjustment",
              ingredient_id: it.ingredient_id,
              ingredient_name: it.name,
              qty: it.diff_qty,
              unit: it.unit,
              ref: sub.id,
              note: "Daily Recon Sync by " + (sub.submitted_by || "Kasir"),
              date: sub.data?.date || new Date().toISOString().slice(0, 10),
              time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
            })
          }
        }
      }

      await supabase.from("staff_submissions").update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: "Owner"
      }).eq("id", sub.id)

      await loadData()
    } catch (err) {
      alert("Gagal menyetujui: " + err.message)
    } finally {
      setProcessingId(null)
    }
  }

  // Delete submission
  async function handleDelete(subId) {
    if (!window.confirm("Hapus laporan rekonsiliasi ini?")) return
    setProcessingId(subId)
    try {
      await supabase.from("staff_submissions").delete().eq("id", subId)
      await loadData()
      if (viewDetail?.id === subId) setViewDetail(null)
    } catch (err) {
      alert("Gagal menghapus: " + err.message)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div>
      {/* Top Header & Manage Items Button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "var(--ink1)" }}>📦 Rekonsiliasi Stok Harian (Critical Items)</div>
          <div style={{ fontSize: 13, color: "var(--ink4)" }}>
            Pantau sisa fisik ayam, sate, telur, dan daging harian untuk melacak selisih porsi & kebocoran profit.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowManageModal(true)}
            className="bo-btn bo-btn-sm"
            style={{ background: "#6366F1", color: "#fff", display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}
          >
            ⚙️ Kelola Bahan Harian ({trackedItemIds.length})
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className="bo-card" style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink4)", textTransform: "uppercase" }}>Hari Diaudit</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "var(--ink1)", marginTop: 4 }}>
            {kpis.daysCounted} <span style={{ fontSize: 14, fontWeight: 500 }}>laporan</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink5)", marginTop: 4 }}>Periode terpilih</div>
        </div>

        <div className="bo-card" style={{ padding: "16px 20px", borderLeft: "4px solid #DE350B" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#DE350B", textTransform: "uppercase" }}>Total Nilai Hilang / Minus</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#DE350B", marginTop: 4 }}>
            {fmt(kpis.totalLoss)}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink5)", marginTop: 4 }}>Kerugian porsi / bahan hilang</div>
        </div>

        <div className="bo-card" style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink4)", textTransform: "uppercase" }}>Top Bahan Selisih</div>
          {kpis.topLeaked.length > 0 ? (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {kpis.topLeaked.map(([name, val]) => (
                <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: "var(--ink2)" }}>{name}</span>
                  <span style={{ fontWeight: 700, color: "#DE350B" }}>-{fmt(val)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#00875A", marginTop: 8, fontWeight: 600 }}>✓ Tidak ada selisih minus</div>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {[
          ["today", "Hari Ini"],
          ["week", "7 Hari Terakhir"],
          ["month", "Bulan Ini"],
          ["all", "Semua Data"],
          ["custom", "Custom Tanggal"]
        ].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilterPeriod(val)}
            className={"bo-btn bo-btn-sm " + (filterPeriod === val ? "bo-btn-primary" : "bo-btn-ghost")}
          >
            {label}
          </button>
        ))}

        {filterPeriod === "custom" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="bo-input" style={{ padding: "4px 8px", fontSize: 12 }} />
            <span>—</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="bo-input" style={{ padding: "4px 8px", fontSize: 12 }} />
          </div>
        )}
      </div>

      {/* Submissions Table */}
      <div className="bo-card" style={{ padding: 0, overflowX: "auto" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink4)" }}>Memuat laporan stok harian...</div>
        ) : filteredSubmissions.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink5)" }}>
            Belum ada rekonsiliasi stok harian untuk periode ini.
          </div>
        ) : (
          <table className="bo-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Kasir / Staff</th>
                <th>Jumlah Bahan</th>
                <th>Total Selisih (Qty)</th>
                <th>Estimasi Kerugian (Rp)</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubmissions.map(sub => {
                const items = sub.data?.items || []
                const totalMinusQty = items.reduce((acc, it) => acc + (it.diff_qty < 0 ? Math.abs(it.diff_qty) : 0), 0)
                const totalLossVal = sub.data?.total_variance_value || items.reduce((acc, it) => acc + (it.diff_qty < 0 ? Math.abs(it.diff_qty) * (it.cost_per_unit || 0) : 0), 0)
                const hasDiscrepancy = items.some(it => it.diff_qty !== 0)

                return (
                  <tr key={sub.id}>
                    <td style={{ fontWeight: 700 }}>{sub.data?.date || (sub.submitted_at || "").slice(0, 10)}</td>
                    <td>{sub.submitted_by || sub.data?.staff_name || "Kasir"}</td>
                    <td>{items.length} item</td>
                    <td>
                      {!hasDiscrepancy ? (
                        <span style={{ color: "#00875A", fontWeight: 700 }}>✓ Semua Cocok</span>
                      ) : (
                        <span style={{ color: totalMinusQty > 0 ? "#DE350B" : "#F59E0B", fontWeight: 700 }}>
                          {totalMinusQty > 0 ? `-${totalMinusQty} porsi/satuan` : "+Surplus"}
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 800, color: totalLossVal > 0 ? "#DE350B" : "var(--ink1)" }}>
                      {totalLossVal > 0 ? `-${fmt(totalLossVal)}` : "Rp 0"}
                    </td>
                    <td>
                      <span className={"bo-badge " + (sub.status === "approved" ? "bo-badge-green" : "bo-badge-amber")}>
                        {sub.status === "approved" ? "Disetujui" : "Pending"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setViewDetail(sub)} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ color: "var(--brand)" }}>
                          Lihat Detail
                        </button>
                        {sub.status !== "approved" && (
                          <button
                            onClick={() => handleApprove(sub, false)}
                            disabled={processingId === sub.id}
                            className="bo-btn bo-btn-ghost bo-btn-sm"
                            style={{ color: "#00875A" }}
                          >
                            Setujui
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(sub.id)}
                          disabled={processingId === sub.id}
                          className="bo-btn bo-btn-ghost bo-btn-sm"
                          style={{ color: "var(--red)" }}
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* DETAIL MODAL */}
      {viewDetail && (
        <div className="bo-modal-overlay" onClick={() => setViewDetail(null)}>
          <div className="bo-modal" style={{ maxWidth: 840 }} onClick={e => e.stopPropagation()}>
            <div className="bo-modal-header">
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  📋 Rincian Stok Harian ({viewDetail.data?.date || viewDetail.submitted_at?.slice(0, 10)})
                </div>
                <div style={{ fontSize: 12, color: "var(--ink4)" }}>
                  Kasir: <b>{viewDetail.submitted_by || "Kasir"}</b> · Waktu: {new Date(viewDetail.submitted_at).toLocaleString("id-ID")}
                </div>
              </div>
              <button className="bo-modal-close" onClick={() => setViewDetail(null)}>✕</button>
            </div>

            <div className="bo-modal-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
              {viewDetail.data?.notes && (
                <div style={{ background: "#FEF3C7", padding: "10px 14px", borderRadius: 8, fontSize: 12.5, color: "#92400E", marginBottom: 14 }}>
                  <b>Catatan Kasir:</b> {viewDetail.data.notes}
                </div>
              )}

              <table className="bo-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Bahan</th>
                    <th style={{ textAlign: "center" }}>Awal</th>
                    <th style={{ textAlign: "center" }}>+Masuk</th>
                    <th style={{ textAlign: "center" }}>-Terjual</th>
                    <th style={{ textAlign: "center" }}>-Waste/Adj</th>
                    <th style={{ textAlign: "center", background: "#F1F5F9" }}>Sisa Teori</th>
                    <th style={{ textAlign: "center", background: "#EFF6FF" }}>Sisa Fisik</th>
                    <th style={{ textAlign: "center" }}>Selisih</th>
                    <th style={{ textAlign: "right" }}>Nilai Selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewDetail.data?.items || []).map((it, idx) => {
                    const diffVal = it.diff_value || (it.diff_qty < 0 ? Math.abs(it.diff_qty) * (it.cost_per_unit || 0) : 0)
                    return (
                      <tr key={idx}>
                        <td>
                          <div style={{ fontWeight: 700, color: "var(--ink1)" }}>{it.name}</div>
                          <div style={{ fontSize: 11, color: "var(--ink5)" }}>Satuan: {it.unit}</div>
                        </td>
                        <td style={{ textAlign: "center" }}>{it.opening_stock ?? "—"}</td>
                        <td style={{ textAlign: "center", color: it.added_qty > 0 ? "#00875A" : "var(--ink5)" }}>
                          {it.added_qty > 0 ? `+${it.added_qty}` : "0"}
                        </td>
                        <td style={{ textAlign: "center", color: it.sold_qty > 0 ? "#DE350B" : "var(--ink5)", fontWeight: 600 }}>
                          {it.sold_qty > 0 ? `-${it.sold_qty}` : "0"}
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 700, background: "#F8FAFC" }}>
                          {it.expected_qty} {it.unit}
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 800, color: "#0284C7", background: "#F0F9FF" }}>
                          {it.actual_qty} {it.unit}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {it.diff_qty === 0 ? (
                            <span style={{ color: "#00875A", fontWeight: 700 }}>✓ Cocok</span>
                          ) : it.diff_qty < 0 ? (
                            <span style={{ color: "#DE350B", fontWeight: 800 }}>{it.diff_qty} {it.unit}</span>
                          ) : (
                            <span style={{ color: "#F59E0B", fontWeight: 800 }}>+{it.diff_qty} {it.unit}</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 800, color: diffVal > 0 ? "#DE350B" : "var(--ink4)" }}>
                          {diffVal > 0 ? `-${fmt(diffVal)}` : "Rp 0"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="bo-modal-footer" style={{ display: "flex", justifyContent: "space-between" }}>
              <button onClick={() => setViewDetail(null)} className="bo-btn bo-btn-ghost">Tutup</button>
              {viewDetail.status !== "approved" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleApprove(viewDetail, false)}
                    className="bo-btn bo-btn-ghost"
                    style={{ color: "#00875A" }}
                  >
                    Setujui Saja
                  </button>
                  <button
                    onClick={() => handleApprove(viewDetail, true)}
                    className="bo-btn bo-btn-primary"
                  >
                    Setujui & Perbarui Stok Live
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MANAGE TRACKED ITEMS MODAL */}
      {showManageModal && (
        <div className="bo-modal-overlay" onClick={() => setShowManageModal(false)}>
          <div className="bo-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="bo-modal-header">
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>⚙️ Kelola Bahan Rekonsiliasi Harian</div>
                <div style={{ fontSize: 12, color: "var(--ink4)" }}>
                  Centang bahan yang wajib dihitung kasir setiap hari di POS.
                </div>
              </div>
              <button className="bo-modal-close" onClick={() => setShowManageModal(false)}>✕</button>
            </div>

            <div className="bo-modal-body" style={{ maxHeight: "65vh", overflowY: "auto" }}>
              <div style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  value={searchIng}
                  onChange={e => setSearchIng(e.target.value)}
                  placeholder="Cari bahan (misal: Sate, Ayam, Daging, Minyak)..."
                  className="bo-input"
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {ingredients
                  .filter(i => !searchIng || i.name.toLowerCase().includes(searchIng.toLowerCase()))
                  .map(ing => {
                    const isTracked = trackedItemIds.includes(ing.id)
                    return (
                      <div
                        key={ing.id}
                        onClick={() => handleToggleTracked(ing.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderRadius: 8,
                          border: `1.5px solid ${isTracked ? "var(--brand)" : "var(--surface2)"}`,
                          background: isTracked ? "var(--brand-lt)" : "var(--surface)",
                          cursor: "pointer"
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: isTracked ? "var(--brand)" : "var(--ink1)", fontSize: 13.5 }}>
                            {ing.name}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink4)" }}>
                            Satuan: {ing.unit} · Stok Live: {ing.stock} {ing.unit} · Harga Modal: {fmt(ing.cost_per_unit)}
                          </div>
                        </div>

                        <div>
                          <input
                            type="checkbox"
                            checked={isTracked}
                            onChange={() => {}} // handled by div onClick
                            style={{ width: 18, height: 18, cursor: "pointer" }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>

            <div className="bo-modal-footer">
              <button onClick={() => setShowManageModal(false)} className="bo-btn bo-btn-primary">
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
