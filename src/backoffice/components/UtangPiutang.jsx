import { useState, useEffect, useMemo, useCallback } from "react"
import { supabase } from "../../lib/supabase"

const fmt = n => "Rp " + Number(n || 0).toLocaleString("id-ID")
const fmtDate = d => d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—"

const RENOVATION_ITEMS = [
  { name: "Cat - 1 pal", qty: 2, unit_price: 310000, amount: 620000 },
  { name: "Belanjaan pertama | toko bangunan", qty: 1, unit_price: 1628000, amount: 1628000 },
  { name: "Belanjaan kedua | toko bangunan", qty: 1, unit_price: 365000, amount: 365000 },
  { name: "Belanjaan ketiga | toko bangunan", qty: 1, unit_price: 130000, amount: 130000 },
  { name: "Belanjaan keempat | toko bangunan", qty: 1, unit_price: 329000, amount: 329000 },
  { name: "Belanjaan kelima | toko bangunan", qty: 1, unit_price: 828000, amount: 828000 },
  { name: "Belanjaan keenam | toko bangunan", qty: 1, unit_price: 338000, amount: 338000 },
  { name: "Belanjaan ketujuh | toko bangunan", qty: 1, unit_price: 200000, amount: 200000 },
  { name: "Belanjaan kedelapan | toko bangunan", qty: 1, unit_price: 393000, amount: 393000 },
  { name: "Belanjaan kesembilan | toko bangunan", qty: 1, unit_price: 73000, amount: 73000 },
  { name: "Belanjaan kesepuluh | toko bangunan", qty: 1, unit_price: 228000, amount: 228000 },
  { name: "Belanjaan kesebelas | toko bangunan", qty: 1, unit_price: 115000, amount: 115000 },
  { name: "Belanjaan ketigabelas | toko bangunan", qty: 1, unit_price: 934000, amount: 934000 },
  { name: "Belanjaan keempatbelas | toko bangunan", qty: 1, unit_price: 90000, amount: 90000 },
  { name: "Belanjaan kelimabelas | toko bangunan", qty: 1, unit_price: 479000, amount: 479000 },
  { name: "Belanjaan keenambelas | toko bangunan", qty: 1, unit_price: 90000, amount: 90000 },
  { name: "Kayu Kaso (Tulang bilik)", qty: 40, unit_price: 10000, amount: 400000 },
  { name: "Keramik", qty: 2, unit_price: 60000, amount: 120000 },
  { name: "Tukang Harian Cat + Listrik", qty: 4, unit_price: 180000, amount: 720000 },
  { name: "Tukang Harian Cat + Listrik (helper)", qty: 3, unit_price: 100000, amount: 300000 },
  { name: "Tukang Tangga + Sink", qty: 3, unit_price: 150000, amount: 450000 },
  { name: "Bamboo Tangga", qty: 4, unit_price: 15000, amount: 60000 },
  { name: "Perbaiki Dapur belakang + Resto", qty: 1, unit_price: 2000000, amount: 2000000 },
  { name: "Tukang Bambu (Alang2, bilik, meja makan, finishing)", qty: 1, unit_price: 4050000, amount: 4050000 },
  { name: "Renovasi + Kitchen", qty: 1, unit_price: 10000000, amount: 10000000 },
]

const OTHER_STARTUP_ITEMS = [
  { name: "Stok Bahan Baku Awal (Stock Food)", qty: 1, amount: 7000000, cat: "Bahan Baku" },
  { name: "Cleaning Products", qty: 1, amount: 99000, cat: "Supplies" },
  { name: "Food Tasting Daging", qty: 1, amount: 500000, cat: "R&D" },
  { name: "Fixing Showcase", qty: 1, amount: 150000, cat: "Maintenance" },
  { name: "Drink Tasting", qty: 1, amount: 523500, cat: "R&D" },
  { name: "Apron Uniform + Sablon (8 pcs)", qty: 1, amount: 527000, cat: "Uniform" },
  { name: "Topi + Sablon (6 pcs)", qty: 1, amount: 164500, cat: "Uniform" },
  { name: "Nomor Meja", qty: 30, amount: 225000, cat: "Supplies" },
  { name: "Take Away Box / Cup / Plastic", qty: 1, amount: 500000, cat: "Packaging" },
  { name: "Bengkel Motor Operasional", qty: 1, amount: 1100000, cat: "Transport" },
  { name: "MCB 1A Listrik", qty: 1, amount: 85000, cat: "Utilities" },
  { name: "Rental Bulan Juli (Dibayar Claudy)", qty: 1, amount: 4500000, cat: "Sewa Tempat" },
  { name: "Rental Bulan Agustus + 15 hari September (Dibayar Claudy)", qty: 1, amount: 4500000, cat: "Sewa Tempat" },
  { name: "Rental Bulan September (15 hari)", qty: 15, amount: 2250000, cat: "Sewa Tempat" },
  { name: "Rental Bulan Oktober", qty: 1, amount: 4500000, cat: "Sewa Tempat" },
  { name: "APAR 1kg", qty: 1, amount: 400000, cat: "Safety" },
  { name: "Terpal (2 pcs)", qty: 1, amount: 205000, cat: "Supplies" },
  { name: "Tablet POS", qty: 1, amount: 1800000, cat: "Hardware" },
  { name: "CCTV Installation & Fixing", qty: 1, amount: 600000, cat: "Security" },
  { name: "Toren Air", qty: 1, amount: 1800000, cat: "Facility" },
]

export default function UtangPiutang() {
  const [activeTab, setActiveTab] = useState("overview") // overview | assets_capex | debts | receivables | history
  const [records, setRecords] = useState([])
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchCapex, setSearchCapex] = useState("")

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [addType, setAddType] = useState("utang") // utang | piutang | modal
  const [addForm, setAddForm] = useState({
    party_name: "",
    category: "Utang Usaha",
    original_amount: "",
    start_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    notes: ""
  })

  const [showPayModal, setShowPayModal] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [payForm, setPayForm] = useState({
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    payment_method: "Transfer",
    notes: "",
    recorded_by: "Claudy"
  })

  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: subs },
        { data: assetList }
      ] = await Promise.all([
        supabase.from("staff_submissions").select("*").eq("type", "debt_loan").order("submitted_at", { ascending: true }),
        supabase.from("assets").select("*")
      ])

      setRecords(subs || [])
      setAssets(assetList || [])
    } catch (err) {
      console.error("Error loading debt/equity records:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Computed Totals
  const totalPhysicalAssets = useMemo(() => {
    return assets.reduce((sum, a) => sum + Number(a.amount || 0), 0)
  }, [assets])

  const totalRenovation = useMemo(() => {
    return RENOVATION_ITEMS.reduce((sum, it) => sum + it.amount, 0)
  }, [])

  const totalOtherStartup = useMemo(() => {
    return OTHER_STARTUP_ITEMS.reduce((sum, it) => sum + it.amount, 0)
  }, [])

  const grandTotalStartup = 90289028 // Fixed baseline from Excel

  // Debts and Capital calculations
  const modalRecords = useMemo(() => {
    return records.filter(r => r.data?.type === "modal")
  }, [records])

  const utangRecords = useMemo(() => {
    return records.filter(r => r.data?.type === "utang")
  }, [records])

  const piutangRecords = useMemo(() => {
    return records.filter(r => r.data?.type === "piutang")
  }, [records])

  const totalModal = useMemo(() => {
    return modalRecords.reduce((sum, r) => sum + (r.data?.original_amount || 0), 0)
  }, [modalRecords])

  const totalUtangRemaining = useMemo(() => {
    return utangRecords.reduce((sum, r) => sum + (r.data?.remaining_amount || 0), 0)
  }, [utangRecords])

  const totalPiutangRemaining = useMemo(() => {
    return piutangRecords.reduce((sum, r) => sum + (r.data?.remaining_amount || 0), 0)
  }, [piutangRecords])

  const totalRepaidAll = useMemo(() => {
    return records.reduce((sum, r) => sum + (r.data?.paid_amount || 0), 0)
  }, [records])

  // Payment logs
  const paymentLogs = useMemo(() => {
    const list = []
    records.forEach(r => {
      const payments = r.data?.payments || []
      payments.forEach(p => {
        list.push({
          ...p,
          recordId: r.id,
          party_name: r.data?.party_name,
          category: r.data?.category,
          recordType: r.data?.type
        })
      })
    })
    return list.sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  }, [records])

  // Handlers
  async function handleAddRecord() {
    if (!addForm.party_name || !addForm.original_amount) {
      alert("Mohon lengkapi nama pihak dan nominal")
      return
    }

    setSaving(true)
    try {
      const amount = parseFloat(String(addForm.original_amount).replace(/[^\d]/g, "")) || 0
      const newId = (addType === "modal" ? "CAPITAL-" : addType === "utang" ? "DEBT-" : "PIUTANG-") + Date.now()

      const payload = {
        id: newId,
        type: "debt_loan",
        status: "active",
        submitted_by: "Claudy",
        submitted_at: new Date().toISOString(),
        data: {
          type: addType,
          party_name: addForm.party_name,
          category: addForm.category,
          original_amount: amount,
          paid_amount: 0,
          remaining_amount: amount,
          start_date: addForm.start_date || new Date().toISOString().slice(0, 10),
          due_date: addForm.due_date || null,
          notes: addForm.notes || "",
          payments: []
        }
      }

      const { error } = await supabase.from("staff_submissions").insert(payload)
      if (error) throw error

      await loadData()
      setShowAddModal(false)
      setAddForm({
        party_name: "",
        category: "Utang Usaha",
        original_amount: "",
        start_date: new Date().toISOString().slice(0, 10),
        due_date: "",
        notes: ""
      })
    } catch (err) {
      alert("Gagal menambahkan: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePayment() {
    if (!selectedRecord || !payForm.amount) {
      alert("Mohon masukkan nominal pembayaran")
      return
    }

    setSaving(true)
    try {
      const payAmt = parseFloat(String(payForm.amount).replace(/[^\d]/g, "")) || 0
      const curData = selectedRecord.data || {}
      const curPaid = curData.paid_amount || 0
      const curRemaining = curData.remaining_amount !== undefined ? curData.remaining_amount : curData.original_amount
      const newPaid = curPaid + payAmt
      const newRemaining = Math.max(0, (curData.original_amount || 0) - newPaid)

      const newPaymentEntry = {
        id: "PAY-" + Date.now(),
        date: payForm.date || new Date().toISOString().slice(0, 10),
        amount: payAmt,
        payment_method: payForm.payment_method,
        notes: payForm.notes,
        recorded_by: payForm.recorded_by,
        created_at: new Date().toISOString()
      }

      const updatedPayments = [...(curData.payments || []), newPaymentEntry]
      const updatedStatus = newRemaining === 0 ? "paid" : "active"

      const updatedData = {
        ...curData,
        paid_amount: newPaid,
        remaining_amount: newRemaining,
        payments: updatedPayments
      }

      const { error } = await supabase.from("staff_submissions").update({
        data: updatedData,
        status: updatedStatus
      }).eq("id", selectedRecord.id)

      if (error) throw error

      await loadData()
      setShowPayModal(false)
      setSelectedRecord(null)
      setPayForm({
        amount: "",
        date: new Date().toISOString().slice(0, 10),
        payment_method: "Transfer",
        notes: "",
        recorded_by: "Claudy"
      })
    } catch (err) {
      alert("Gagal mencatat pembayaran: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRecord(recId) {
    if (!window.confirm("Hapus catatan ini?")) return
    try {
      await supabase.from("staff_submissions").delete().eq("id", recId)
      await loadData()
    } catch (err) {
      alert("Gagal menghapus: " + err.message)
    }
  }

  return (
    <div>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "var(--ink1)" }}>💳 Utang, Piutang & Modal Awal</div>
          <div style={{ fontSize: 13, color: "var(--ink4)" }}>
            Kelola modal awal pemilik & investor, utang sewa tempat, serta pelacakan cicilan pengembalian modal.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => { setAddType("utang"); setShowAddModal(true) }}
            className="bo-btn bo-btn-sm"
            style={{ background: "#DE350B", color: "#fff", fontWeight: 700 }}
          >
            + Catat Utang Baru
          </button>
          <button
            onClick={() => { setAddType("piutang"); setShowAddModal(true) }}
            className="bo-btn bo-btn-sm"
            style={{ background: "#00875A", color: "#fff", fontWeight: 700 }}
          >
            + Catat Piutang Baru
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: "1px solid var(--surface3)", paddingBottom: 8, overflowX: "auto" }}>
        {[
          ["overview", "📊 Ringkasan & Ekuitas"],
          ["assets_capex", "🏢 Alokasi Modal & Aset"],
          ["debts", "💸 Utang Usaha (" + utangRecords.length + ")"],
          ["modal", "👑 Modal Pemilik & Mitra (" + modalRecords.length + ")"],
          ["receivables", "📥 Piutang Usaha (" + piutangRecords.length + ")"],
          ["history", "📜 Histori Cicilan (" + paymentLogs.length + ")"]
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={"bo-btn bo-btn-sm " + (activeTab === key ? "bo-btn-primary" : "bo-btn-ghost")}
            style={{ whiteSpace: "nowrap" }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div>
          {/* KPI Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
            <div className="bo-card" style={{ padding: "16px 20px", borderLeft: "4px solid #6366F1" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6366F1", textTransform: "uppercase" }}>Total Modal Awal (Equity)</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "var(--ink1)", marginTop: 4 }}>{fmt(grandTotalStartup)}</div>
              <div style={{ fontSize: 11, color: "var(--ink4)", marginTop: 4 }}>Claudy (85,6%) + Mila (14,4%)</div>
            </div>

            <div className="bo-card" style={{ padding: "16px 20px", borderLeft: "4px solid #00B8D9" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#00B8D9", textTransform: "uppercase" }}>Aset Fisik Terdaftar</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "var(--ink1)", marginTop: 4 }}>{fmt(totalPhysicalAssets)}</div>
              <div style={{ fontSize: 11, color: "var(--ink4)", marginTop: 4 }}>{assets.length} item peralatan & resto</div>
            </div>

            <div className="bo-card" style={{ padding: "16px 20px", borderLeft: "4px solid #DE350B" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#DE350B", textTransform: "uppercase" }}>Utang Usaha Belum Lunas</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#DE350B", marginTop: 4 }}>{fmt(totalUtangRemaining)}</div>
              <div style={{ fontSize: 11, color: "var(--ink4)", marginTop: 4 }}>Utang sewa tempat (Roman)</div>
            </div>

            <div className="bo-card" style={{ padding: "16px 20px", borderLeft: "4px solid #00875A" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#00875A", textTransform: "uppercase" }}>Piutang Usaha</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#00875A", marginTop: 4 }}>{fmt(totalPiutangRemaining)}</div>
              <div style={{ fontSize: 11, color: "var(--ink4)", marginTop: 4 }}>Tagihan luar belum tertagih</div>
            </div>
          </div>

          {/* Equity & Debt Share Progress Cards */}
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ink1)", marginBottom: 12 }}>
            👥 Pembagian Modal & Kewajiban
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 24 }}>
            {/* Claudy */}
            <div className="bo-card" style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "var(--ink1)" }}>Claudy (Pemilik Utama)</div>
                  <div style={{ fontSize: 12, color: "var(--ink4)" }}>Modal Pendirian Resto · Porsi: <b>85,60%</b></div>
                </div>
                <span className="bo-badge bo-badge-blue">Owner Equity</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "var(--ink4)" }}>Modal Awal:</span>
                <span style={{ fontWeight: 800 }}>Rp 77.289.028</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "var(--ink4)" }}>Sudah Kembali (Prive):</span>
                <span style={{ fontWeight: 800, color: "#00875A" }}>{fmt(modalRecords.find(r=>r.id==="CAPITAL-CLAUDY")?.data?.paid_amount || 0)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 900, borderTop: "1px solid var(--surface3)", paddingTop: 8, marginTop: 8 }}>
                <span>Sisa Modal Belum Kembali:</span>
                <span style={{ color: "#6366F1" }}>{fmt(modalRecords.find(r=>r.id==="CAPITAL-CLAUDY")?.data?.remaining_amount || 77289028)}</span>
              </div>
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => {
                    const rec = modalRecords.find(r => r.id === "CAPITAL-CLAUDY")
                    if (rec) { setSelectedRecord(rec); setShowPayModal(true) }
                  }}
                  className="bo-btn bo-btn-sm"
                  style={{ width: "100%", background: "#6366F1", color: "#fff", fontWeight: 700 }}
                >
                  💰 Catat Pengembalian Modal / Prive
                </button>
              </div>
            </div>

            {/* Mila */}
            <div className="bo-card" style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "var(--ink1)" }}>Mila (Mitra / Investor)</div>
                  <div style={{ fontSize: 12, color: "var(--ink4)" }}>Investasi Awal Resto · Porsi: <b>14,40%</b></div>
                </div>
                <span className="bo-badge bo-badge-green">Partner Equity</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "var(--ink4)" }}>Modal Awal:</span>
                <span style={{ fontWeight: 800 }}>Rp 13.000.000</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "var(--ink4)" }}>Sudah Dikembalikan:</span>
                <span style={{ fontWeight: 800, color: "#00875A" }}>{fmt(modalRecords.find(r=>r.id==="CAPITAL-MILA")?.data?.paid_amount || 0)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 900, borderTop: "1px solid var(--surface3)", paddingTop: 8, marginTop: 8 }}>
                <span>Sisa Modal Belum Kembali:</span>
                <span style={{ color: "#00875A" }}>{fmt(modalRecords.find(r=>r.id==="CAPITAL-MILA")?.data?.remaining_amount || 13000000)}</span>
              </div>
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => {
                    const rec = modalRecords.find(r => r.id === "CAPITAL-MILA")
                    if (rec) { setSelectedRecord(rec); setShowPayModal(true) }
                  }}
                  className="bo-btn bo-btn-sm"
                  style={{ width: "100%", background: "#00875A", color: "#fff", fontWeight: 700 }}
                >
                  💰 Catat Bagi Hasil / Pengembalian Modal
                </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ALOKASI MODAL & ASET */}
      {activeTab === "assets_capex" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 18 }}>
            <div className="bo-card" style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink4)" }}>1. ASET FISIK & EQUIPMENT</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--ink1)", marginTop: 4 }}>{fmt(totalPhysicalAssets)}</div>
              <div style={{ fontSize: 11, color: "var(--ink4)", marginTop: 4 }}>
                {assets.length} item terdaftar di modul Assets.
              </div>
              <a
                href="/backoffice/assets"
                className="bo-btn bo-btn-ghost bo-btn-sm"
                style={{ marginTop: 10, display: "inline-block", color: "var(--brand)" }}
              >
                Buka Menu Assets →
              </a>
            </div>

            <div className="bo-card" style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink4)" }}>2. BIAYA RENOVASI & SIPIL</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--ink1)", marginTop: 4 }}>{fmt(totalRenovation)}</div>
              <div style={{ fontSize: 11, color: "var(--ink4)", marginTop: 4 }}>
                {RENOVATION_ITEMS.length} transaksi toko bangunan & tukang.
              </div>
            </div>

            <div className="bo-card" style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink4)" }}>3. SEWA, STOK AWAL & OPERASIONAL</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--ink1)", marginTop: 4 }}>{fmt(totalOtherStartup)}</div>
              <div style={{ fontSize: 11, color: "var(--ink4)", marginTop: 4 }}>
                {OTHER_STARTUP_ITEMS.length} transaksi sewa, food tasting, seragam, dll.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ink1)" }}>Rincian Biaya Renovasi Resto</div>
            <input
              type="text"
              value={searchCapex}
              onChange={e => setSearchCapex(e.target.value)}
              placeholder="Cari item..."
              className="bo-input"
              style={{ width: 220 }}
            />
          </div>

          <div className="bo-card" style={{ padding: 0, overflowX: "auto", marginBottom: 20 }}>
            <table className="bo-table">
              <thead>
                <tr>
                  <th>Nama Item / Belanjaan</th>
                  <th style={{ textAlign: "center" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Harga Satuan</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {RENOVATION_ITEMS
                  .filter(it => !searchCapex || it.name.toLowerCase().includes(searchCapex.toLowerCase()))
                  .map((it, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700 }}>{it.name}</td>
                      <td style={{ textAlign: "center" }}>{it.qty}</td>
                      <td style={{ textAlign: "right" }}>{fmt(it.unit_price)}</td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>{fmt(it.amount)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ink1)", marginBottom: 12 }}>Rincian Biaya Sewa, Stok Awal & Operasional Startup</div>
          <div className="bo-card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="bo-table">
              <thead>
                <tr>
                  <th>Nama Biaya / Transaksi</th>
                  <th>Kategori</th>
                  <th style={{ textAlign: "center" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {OTHER_STARTUP_ITEMS
                  .filter(it => !searchCapex || it.name.toLowerCase().includes(searchCapex.toLowerCase()))
                  .map((it, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700 }}>{it.name}</td>
                      <td><span className="bo-badge bo-badge-blue">{it.cat}</span></td>
                      <td style={{ textAlign: "center" }}>{it.qty}</td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>{fmt(it.amount)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: UTANG USAHA */}
      {activeTab === "debts" && (
        <div className="bo-card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="bo-table">
            <thead>
              <tr>
                <th>Pihak / Pemberi Utang</th>
                <th>Kategori</th>
                <th>Tanggal Mulai</th>
                <th style={{ textAlign: "right" }}>Jumlah Awal</th>
                <th style={{ textAlign: "right" }}>Sudah Dibayar</th>
                <th style={{ textAlign: "right" }}>Sisa Utang</th>
                <th style={{ textAlign: "center" }}>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {utangRecords.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 30, color: "var(--ink4)" }}>Belum ada catatan utang</td></tr>
              ) : (
                utangRecords.map(r => {
                  const d = r.data || {}
                  const isPaid = (d.remaining_amount || 0) === 0
                  return (
                    <tr key={r.id}>
                      <td>
                        <div style={{ fontWeight: 800, color: "var(--ink1)" }}>{d.party_name}</div>
                        <div style={{ fontSize: 11, color: "var(--ink4)" }}>{d.notes || "—"}</div>
                      </td>
                      <td><span className="bo-badge bo-badge-amber">{d.category}</span></td>
                      <td>{fmtDate(d.start_date)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{fmt(d.original_amount)}</td>
                      <td style={{ textAlign: "right", color: "#00875A", fontWeight: 700 }}>{fmt(d.paid_amount || 0)}</td>
                      <td style={{ textAlign: "right", fontWeight: 800, color: isPaid ? "var(--ink4)" : "#DE350B" }}>{fmt(d.remaining_amount)}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className={"bo-badge " + (isPaid ? "bo-badge-green" : "bo-badge-red")}>
                          {isPaid ? "Lunas" : "Belum Lunas"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          {!isPaid && (
                            <button
                              onClick={() => { setSelectedRecord(r); setShowPayModal(true) }}
                              className="bo-btn bo-btn-sm"
                              style={{ background: "#DE350B", color: "#fff", fontWeight: 700 }}
                            >
                              Bayar Cicilan
                            </button>
                          )}
                          <button onClick={() => handleDeleteRecord(r.id)} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ color: "var(--red)" }}>
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: MODAL PEMILIK & MITRA */}
      {activeTab === "modal" && (
        <div className="bo-card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="bo-table">
            <thead>
              <tr>
                <th>Nama Pemilik / Mitra</th>
                <th>Porsi Kepemilikan</th>
                <th style={{ textAlign: "right" }}>Modal Disetor</th>
                <th style={{ textAlign: "right" }}>Sudah Kembali (Prive)</th>
                <th style={{ textAlign: "right" }}>Sisa Modal Belum Kembali</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {modalRecords.map(r => {
                const d = r.data || {}
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 800, color: "var(--ink1)" }}>{d.party_name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink4)" }}>{d.notes || "—"}</div>
                    </td>
                    <td><b>{d.share_pct ? d.share_pct + "%" : "—"}</b></td>
                    <td style={{ textAlign: "right", fontWeight: 800 }}>{fmt(d.original_amount)}</td>
                    <td style={{ textAlign: "right", color: "#00875A", fontWeight: 700 }}>{fmt(d.paid_amount || 0)}</td>
                    <td style={{ textAlign: "right", fontWeight: 900, color: "var(--brand)" }}>{fmt(d.remaining_amount)}</td>
                    <td>
                      <button
                        onClick={() => { setSelectedRecord(r); setShowPayModal(true) }}
                        className="bo-btn bo-btn-primary bo-btn-sm"
                        style={{ fontWeight: 700 }}
                      >
                        Catat Pengembalian / Prive
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: PIUTANG USAHA */}
      {activeTab === "receivables" && (
        <div className="bo-card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="bo-table">
            <thead>
              <tr>
                <th>Pihak / Debitur</th>
                <th>Kategori</th>
                <th>Tanggal Mulai</th>
                <th style={{ textAlign: "right" }}>Nominal Piutang</th>
                <th style={{ textAlign: "right" }}>Sudah Diterima</th>
                <th style={{ textAlign: "right" }}>Sisa Piutang</th>
                <th style={{ textAlign: "center" }}>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {piutangRecords.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 30, color: "var(--ink4)" }}>Belum ada catatan piutang</td></tr>
              ) : (
                piutangRecords.map(r => {
                  const d = r.data || {}
                  const isPaid = (d.remaining_amount || 0) === 0
                  return (
                    <tr key={r.id}>
                      <td>
                        <div style={{ fontWeight: 800, color: "var(--ink1)" }}>{d.party_name}</div>
                        <div style={{ fontSize: 11, color: "var(--ink4)" }}>{d.notes || "—"}</div>
                      </td>
                      <td><span className="bo-badge bo-badge-blue">{d.category}</span></td>
                      <td>{fmtDate(d.start_date)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{fmt(d.original_amount)}</td>
                      <td style={{ textAlign: "right", color: "#00875A", fontWeight: 700 }}>{fmt(d.paid_amount || 0)}</td>
                      <td style={{ textAlign: "right", fontWeight: 800, color: isPaid ? "var(--ink4)" : "#00875A" }}>{fmt(d.remaining_amount)}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className={"bo-badge " + (isPaid ? "bo-badge-green" : "bo-badge-amber")}>
                          {isPaid ? "Lunas" : "Belum Lunas"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          {!isPaid && (
                            <button
                              onClick={() => { setSelectedRecord(r); setShowPayModal(true) }}
                              className="bo-btn bo-btn-sm"
                              style={{ background: "#00875A", color: "#fff", fontWeight: 700 }}
                            >
                              Terima Pembayaran
                            </button>
                          )}
                          <button onClick={() => handleDeleteRecord(r.id)} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ color: "var(--red)" }}>
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 6: HISTORI PEMBAYARAN */}
      {activeTab === "history" && (
        <div className="bo-card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="bo-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Pihak Terkait</th>
                <th>Kategori</th>
                <th>Metode Pembayaran</th>
                <th style={{ textAlign: "right" }}>Nominal</th>
                <th>Dicatat Oleh</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {paymentLogs.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 30, color: "var(--ink4)" }}>Belum ada histori pembayaran cicilan</td></tr>
              ) : (
                paymentLogs.map((p, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 700 }}>{fmtDate(p.date)}</td>
                    <td style={{ fontWeight: 800, color: "var(--ink1)" }}>{p.party_name}</td>
                    <td>
                      <span className={"bo-badge " + (p.recordType === "utang" ? "bo-badge-red" : p.recordType === "piutang" ? "bo-badge-green" : "bo-badge-blue")}>
                        {p.category}
                      </span>
                    </td>
                    <td>{p.payment_method}</td>
                    <td style={{ textAlign: "right", fontWeight: 900, color: p.recordType === "piutang" ? "#00875A" : "var(--ink1)" }}>
                      {fmt(p.amount)}
                    </td>
                    <td>{p.recorded_by || "Claudy"}</td>
                    <td style={{ color: "var(--ink4)", fontSize: 12 }}>{p.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: TAMBAH UTANG / PIUTANG / MODAL */}
      {showAddModal && (
        <div className="bo-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="bo-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">
                {addType === "utang" ? "💸 Catat Utang Baru" : addType === "piutang" ? "📥 Catat Piutang Baru" : "👑 Catat Modal / Investasi"}
              </div>
              <button className="bo-modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <div className="bo-modal-body">
              <div style={{ marginBottom: 12 }}>
                <label className="bo-label">Nama Pihak / Peminjam / Investor *</label>
                <input
                  type="text"
                  value={addForm.party_name}
                  onChange={e => setAddForm({ ...addForm, party_name: e.target.value })}
                  placeholder="Contoh: Roman, Supplier Daging, Pelanggan Katering..."
                  className="bo-input"
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="bo-label">Kategori *</label>
                <input
                  type="text"
                  value={addForm.category}
                  onChange={e => setAddForm({ ...addForm, category: e.target.value })}
                  placeholder="Contoh: Utang Sewa Tempat, Utang Bahan Baku, Piutang Katering..."
                  className="bo-input"
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="bo-label">Nominal (Rp) *</label>
                <input
                  type="number"
                  value={addForm.original_amount}
                  onChange={e => setAddForm({ ...addForm, original_amount: e.target.value })}
                  placeholder="0"
                  className="bo-input"
                  style={{ width: "100%", fontSize: 16, fontWeight: 700 }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label className="bo-label">Tanggal Mulai</label>
                  <input
                    type="date"
                    value={addForm.start_date}
                    onChange={e => setAddForm({ ...addForm, start_date: e.target.value })}
                    className="bo-input"
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label className="bo-label">Jatuh Tempo (Opsional)</label>
                  <input
                    type="date"
                    value={addForm.due_date}
                    onChange={e => setAddForm({ ...addForm, due_date: e.target.value })}
                    className="bo-input"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="bo-label">Catatan</label>
                <textarea
                  value={addForm.notes}
                  onChange={e => setAddForm({ ...addForm, notes: e.target.value })}
                  placeholder="Keterangan transaksi, perjanjian cicilan..."
                  className="bo-input"
                  style={{ width: "100%", height: 70 }}
                />
              </div>
            </div>

            <div className="bo-modal-footer">
              <button onClick={() => setShowAddModal(false)} className="bo-btn bo-btn-ghost">Batal</button>
              <button onClick={handleAddRecord} disabled={saving} className="bo-btn bo-btn-primary">
                {saving ? "Menyimpan..." : "Simpan Catatan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CATAT PEMBAYARAN / CICILAN */}
      {showPayModal && selectedRecord && (
        <div className="bo-modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="bo-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">
                💰 Catat Pembayaran / Cicilan ({selectedRecord.data?.party_name})
              </div>
              <button className="bo-modal-close" onClick={() => setShowPayModal(false)}>✕</button>
            </div>

            <div className="bo-modal-body">
              <div style={{ background: "var(--surface2)", padding: "12px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "var(--ink4)" }}>Kategori:</span>
                  <b>{selectedRecord.data?.category}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "var(--ink4)" }}>Sisa Saldo:</span>
                  <b style={{ color: selectedRecord.data?.type === "utang" ? "#DE350B" : "var(--brand)" }}>
                    {fmt(selectedRecord.data?.remaining_amount)}
                  </b>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="bo-label">Nominal Pembayaran (Rp) *</label>
                <input
                  type="number"
                  value={payForm.amount}
                  onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
                  placeholder={String(selectedRecord.data?.remaining_amount || 0)}
                  className="bo-input"
                  style={{ width: "100%", fontSize: 18, fontWeight: 900, color: "var(--brand)" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label className="bo-label">Tanggal Bayar</label>
                  <input
                    type="date"
                    value={payForm.date}
                    onChange={e => setPayForm({ ...payForm, date: e.target.value })}
                    className="bo-input"
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label className="bo-label">Metode Pembayaran</label>
                  <select
                    value={payForm.payment_method}
                    onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })}
                    className="bo-input"
                    style={{ width: "100%" }}
                  >
                    <option value="Transfer">Transfer Bank</option>
                    <option value="Cash">Kas Tunai</option>
                    <option value="QRIS">QRIS</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="bo-label">Catatan Pembayaran</label>
                <input
                  type="text"
                  value={payForm.notes}
                  onChange={e => setPayForm({ ...payForm, notes: e.target.value })}
                  placeholder="Contoh: Cicilan ke-1 bulan September, pelunasan sisa..."
                  className="bo-input"
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            <div className="bo-modal-footer">
              <button onClick={() => setShowPayModal(false)} className="bo-btn bo-btn-ghost">Batal</button>
              <button onClick={handleSavePayment} disabled={saving} className="bo-btn bo-btn-primary">
                {saving ? "Menyimpan..." : "Simpan Pembayaran"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
