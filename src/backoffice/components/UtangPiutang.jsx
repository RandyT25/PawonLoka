import { useState, useEffect, useMemo, useCallback } from "react"
import { supabase } from "../../lib/supabase"

const fmt = n => "Rp " + Number(n || 0).toLocaleString("id-ID")
const fmtDate = d => d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—"

// 1. RENOVASI & SIPIL (25 Transaksi, Total: Rp 24.940.000)
const RENOVATION_ITEMS = [
  { name: "Cat - 1 pal", qty: 2, unit_price: 310000, amount: 620000, cat: "Cat & Dinding" },
  { name: "Belanjaan pertama | toko bangunan", qty: 1, unit_price: 1628000, amount: 1628000, cat: "Toko Bangunan" },
  { name: "Belanjaan kedua | toko bangunan", qty: 1, unit_price: 365000, amount: 365000, cat: "Toko Bangunan" },
  { name: "Belanjaan ketiga | toko bangunan", qty: 1, unit_price: 130000, amount: 130000, cat: "Toko Bangunan" },
  { name: "Belanjaan keempat | toko bangunan", qty: 1, unit_price: 329000, amount: 329000, cat: "Toko Bangunan" },
  { name: "Belanjaan kelima | toko bangunan", qty: 1, unit_price: 828000, amount: 828000, cat: "Toko Bangunan" },
  { name: "Belanjaan keenam | toko bangunan", qty: 1, unit_price: 338000, amount: 338000, cat: "Toko Bangunan" },
  { name: "Belanjaan ketujuh | toko bangunan", qty: 1, unit_price: 200000, amount: 200000, cat: "Toko Bangunan" },
  { name: "Belanjaan kedelapan | toko bangunan", qty: 1, unit_price: 393000, amount: 393000, cat: "Toko Bangunan" },
  { name: "Belanjaan kesembilan | toko bangunan", qty: 1, unit_price: 73000, amount: 73000, cat: "Toko Bangunan" },
  { name: "Belanjaan kesepuluh | toko bangunan", qty: 1, unit_price: 228000, amount: 228000, cat: "Toko Bangunan" },
  { name: "Belanjaan kesebelas | toko bangunan", qty: 1, unit_price: 115000, amount: 115000, cat: "Toko Bangunan" },
  { name: "Belanjaan ketigabelas | toko bangunan", qty: 1, unit_price: 934000, amount: 934000, cat: "Toko Bangunan" },
  { name: "Belanjaan keempatbelas | toko bangunan", qty: 1, unit_price: 90000, amount: 90000, cat: "Toko Bangunan" },
  { name: "Belanjaan kelimabelas | toko bangunan", qty: 1, unit_price: 479000, amount: 479000, cat: "Toko Bangunan" },
  { name: "Belanjaan keenambelas | toko bangunan", qty: 1, unit_price: 90000, amount: 90000, cat: "Toko Bangunan" },
  { name: "Kayu Kaso (Tulang bilik)", qty: 40, unit_price: 10000, amount: 400000, cat: "Struktur Kayu" },
  { name: "Keramik", qty: 2, unit_price: 60000, amount: 120000, cat: "Lantai & Dinding" },
  { name: "Tukang Harian Cat + Listrik", qty: 4, unit_price: 180000, amount: 720000, cat: "Jasa Tukang" },
  { name: "Tukang Harian Cat + Listrik (helper)", qty: 3, unit_price: 100000, amount: 300000, cat: "Jasa Tukang" },
  { name: "Tukang Tangga + Sink", qty: 3, unit_price: 150000, amount: 450000, cat: "Jasa Tukang" },
  { name: "Bamboo Tangga", qty: 4, unit_price: 15000, amount: 60000, cat: "Bambu" },
  { name: "Perbaiki Dapur belakang + Resto", qty: 1, unit_price: 2000000, amount: 2000000, cat: "Dapur & Area Resto" },
  { name: "Tukang Bambu (Alang2 atap depan, bilik tembok, meja makan kayu pagar, finishing)", qty: 1, unit_price: 4050000, amount: 4050000, cat: "Jasa Tukang Bambu" },
  { name: "Renovasi + Kitchen", qty: 1, unit_price: 10000000, amount: 10000000, cat: "Kontraktor Kitchen" },
]

// 2. SEWA, STOK AWAL & OPERASIONAL STARTUP (20 Transaksi, Total: Rp 31.429.000)
const OTHER_STARTUP_ITEMS = [
  { name: "Stok Bahan Baku Awal (Stock Food)", qty: 1, unit_price: 7000000, amount: 7000000, cat: "Bahan Baku" },
  { name: "Cleaning Products", qty: 1, unit_price: 99000, amount: 99000, cat: "Supplies" },
  { name: "Taste Food Daging (R&D)", qty: 1, unit_price: 500000, amount: 500000, cat: "R&D" },
  { name: "Fixing Showcase", qty: 1, unit_price: 150000, amount: 150000, cat: "Maintenance" },
  { name: "Taste Drink (R&D)", qty: 1, unit_price: 523500, amount: 523500, cat: "R&D" },
  { name: "Apron Uniform + Sablon (8 pcs)", qty: 1, unit_price: 527000, amount: 527000, cat: "Seragam" },
  { name: "Topi + Sablon (6 pcs)", qty: 1, unit_price: 164500, amount: 164500, cat: "Seragam" },
  { name: "Nomor Meja", qty: 30, unit_price: 7500, amount: 225000, cat: "Supplies" },
  { name: "Take Away Box / Cup / Plastic", qty: 1, unit_price: 500000, amount: 500000, cat: "Packaging" },
  { name: "Bengkel Motor Operasional", qty: 1, unit_price: 1100000, amount: 1100000, cat: "Transport" },
  { name: "MCB 1A Listrik", qty: 1, unit_price: 85000, amount: 85000, cat: "Utilities" },
  { name: "Rental Bulan Juli (Dibayar Claudy)", qty: 1, unit_price: 4500000, amount: 4500000, cat: "Sewa Tempat" },
  { name: "Rental Bulan Agustus + 15 hari September (Dibayar Claudy)", qty: 1, unit_price: 4500000, amount: 4500000, cat: "Sewa Tempat" },
  { name: "Rental Bulan September (15 hari)", qty: 15, unit_price: 150000, amount: 2250000, cat: "Sewa Tempat" },
  { name: "Rental Bulan Oktober", qty: 1, unit_price: 4500000, amount: 4500000, cat: "Sewa Tempat" },
  { name: "APAR 1kg (Pemadam Api)", qty: 1, unit_price: 400000, amount: 400000, cat: "Safety" },
  { name: "Terpal (2 pcs)", qty: 1, unit_price: 205000, amount: 205000, cat: "Supplies" },
  { name: "Tablet POS Kasir", qty: 1, unit_price: 1800000, amount: 1800000, cat: "Hardware" },
  { name: "CCTV Installation & Fixing", qty: 1, unit_price: 600000, amount: 600000, cat: "Security" },
  { name: "Toren Air", qty: 1, unit_price: 1800000, amount: 1800000, cat: "Fasilitas" },
]

// 3. EQUIPMENT & ALAT RESTO (Total: Rp 33.920.028)
const EQUIPMENT_ITEMS = [
  { name: "Blender Phillips", qty: 1, unit_price: 650000, amount: 650000, cat: "Appliances" },
  { name: "Mitochiba Chopper", qty: 1, unit_price: 600000, amount: 600000, cat: "Appliances" },
  { name: "Atap Alang2 Saung (1,5m x 70) 1 pack 10 lembar + ongkir", qty: 4, unit_price: 78500, amount: 414000, cat: "Decor" },
  { name: "Bilik Bamboo tembok (2,5m x 2m) 1 pack 5 lembar + ongkir", qty: 2, unit_price: 162000, amount: 424000, cat: "Decor" },
  { name: "Hiasan Dinding Anyaman - Tembok Kanan (1/3)", qty: 3, unit_price: 40000, amount: 120000, cat: "Decor" },
  { name: "Hiasan Dinding Anyaman - Tembok Kanan (2/3)", qty: 2, unit_price: 32000, amount: 64000, cat: "Decor" },
  { name: "Hiasan Dinding Anyaman - Tembok kiri (3/3)", qty: 1, unit_price: 55000, amount: 55000, cat: "Decor" },
  { name: "Alat Manggang Sate 1m", qty: 1, unit_price: 426000, amount: 426000, cat: "Kitchen Equipment" },
  { name: "Kipas Bambu / Kipas Sate", qty: 1, unit_price: 6000, amount: 6000, cat: "Kitchen Equipment" },
  { name: "Krisbow Sikat Kawat Besi 4 Baris", qty: 1, unit_price: 33000, amount: 33000, cat: "Cleaning" },
  { name: "Sanex Kipas Meja Mini 6 Inch", qty: 1, unit_price: 100000, amount: 100000, cat: "Electronics" },
  { name: "Mangkok Tongseng/Tengkleng", qty: 36, unit_price: 4100, amount: 147600, cat: "Tableware" },
  { name: "Mangkok Ronde", qty: 12, unit_price: 3150, amount: 37800, cat: "Tableware" },
  { name: "Piring kotak", qty: 12, unit_price: 7150, amount: 85800, cat: "Tableware" },
  { name: "Piring Bulat", qty: 12, unit_price: 7000, amount: 84000, cat: "Tableware" },
  { name: "Glass", qty: 110, unit_price: 11000, amount: 1210000, cat: "Tableware" },
  { name: "Cangkir", qty: 12, unit_price: 10000, amount: 120000, cat: "Tableware" },
  { name: "Cangkir Kaca (38/lusin)", qty: 2, unit_price: 38000, amount: 76000, cat: "Tableware" },
  { name: "Sendok + Garpu", qty: 120, unit_price: 700, amount: 84000, cat: "Tableware" },
  { name: "Sendok Ronde 12pcs", qty: 1, unit_price: 47800, amount: 47800, cat: "Tableware" },
  { name: "Cutting Board (3pcs)", qty: 1, unit_price: 120000, amount: 120000, cat: "Kitchen Equipment" },
  { name: "Equipment Bar (Glass ukur, saring thai tea, bar spoon)", qty: 1, unit_price: 110000, amount: 110000, cat: "Bar Equipment" },
  { name: "Botol Kecap + Toples", qty: 1, unit_price: 51000, amount: 51000, cat: "Tableware" },
  { name: "Sikat Kawat Lantai", qty: 1, unit_price: 64000, amount: 64000, cat: "Cleaning" },
  { name: "Ice cream scoop", qty: 1, unit_price: 41000, amount: 41000, cat: "Bar Equipment" },
  { name: "Wajan tongseng/tengkleng", qty: 1, unit_price: 98000, amount: 98000, cat: "Kitchen Equipment" },
  { name: "Panci Soup 40cm", qty: 1, unit_price: 28500, amount: 285000, cat: "Kitchen Equipment" },
  { name: "Panci Soup 30cm", qty: 1, unit_price: 195000, amount: 195000, cat: "Kitchen Equipment" },
  { name: "Lampu Resto", qty: 18, unit_price: 10000, amount: 180000, cat: "Lighting" },
  { name: "Lampu area atas (cable 10m x 2 + lampu)", qty: 1, unit_price: 376000, amount: 376000, cat: "Lighting" },
  { name: "Lampu Pohon", qty: 1, unit_price: 58000, amount: 58000, cat: "Lighting" },
  { name: "Tikar Lampit Rotan Saburina 70cm x 120cm", qty: 5, unit_price: 90000, amount: 450000, cat: "Furniture" },
  { name: "Beans Bag", qty: 8, unit_price: 170000, amount: 1360000, cat: "Furniture" },
  { name: "Kursi Bar", qty: 10, unit_price: 72355, amount: 723550, cat: "Furniture" },
  { name: "Jepitan roti bakar (2 pcs)", qty: 1, unit_price: 84000, amount: 84000, cat: "Kitchen Equipment" },
  { name: "Anglo Roti", qty: 1, unit_price: 205000, amount: 205000, cat: "Kitchen Equipment" },
  { name: "Ice Cooler", qty: 1, unit_price: 575000, amount: 575000, cat: "Kitchen Equipment" },
  { name: "Pisau Set", qty: 1, unit_price: 125000, amount: 125000, cat: "Kitchen Equipment" },
  { name: "Tali Tambang (20m)", qty: 1, unit_price: 225000, amount: 225000, cat: "Hardware" },
  { name: "Jerigen 1L", qty: 20, unit_price: 2500, amount: 50000, cat: "Supplies" },
  { name: "Tempat Donat (Tulang)", qty: 2, unit_price: 38000, amount: 76000, cat: "Tableware" },
  { name: "Teko Lion Star 4.1 L", qty: 1, unit_price: 40000, amount: 40000, cat: "Tableware" },
  { name: "Bottle Squeeze Saus (8: 650ml & 2: 800ml)", qty: 1, unit_price: 100000, amount: 100000, cat: "Tableware" },
  { name: "Irus Gagang Kayu", qty: 2, unit_price: 28000, amount: 56000, cat: "Kitchen Equipment" },
  { name: "Panci Kecil/Kanebo, Screw Hook, Btl Kecap", qty: 1, unit_price: 81500, amount: 81500, cat: "Kitchen Equipment" },
  { name: "Nomor Meja", qty: 20, unit_price: 7500, amount: 150000, cat: "Supplies" },
  { name: "Rak", qty: 1, unit_price: 392178, amount: 392178, cat: "Furniture" },
  { name: "Tirai Bamboo (4pcs)", qty: 1, unit_price: 1500000, amount: 1500000, cat: "Decor" },
  { name: "Projector", qty: 1, unit_price: 553000, amount: 553000, cat: "Electronics" },
  { name: "Mic", qty: 1, unit_price: 175000, amount: 175000, cat: "Electronics" },
  { name: "Layar Projector", qty: 1, unit_price: 96000, amount: 96000, cat: "Electronics" },
  { name: "Spatula Tepanyaki", qty: 1, unit_price: 25000, amount: 25000, cat: "Kitchen Equipment" },
  { name: "Wajan Roti", qty: 1, unit_price: 60500, amount: 60500, cat: "Kitchen Equipment" },
  { name: "Sodet Panjang", qty: 1, unit_price: 64000, amount: 64000, cat: "Kitchen Equipment" },
  { name: "Yuumi Lemari Plastik Susun Besar", qty: 1, unit_price: 400000, amount: 400000, cat: "Furniture" },
  { name: "Jepitan gorengan stainless premium merah", qty: 1, unit_price: 10000, amount: 10000, cat: "Kitchen Equipment" },
  { name: "Spatula Silikon Scraper Tahan Panas besar", qty: 1, unit_price: 13000, amount: 13000, cat: "Kitchen Equipment" },
  { name: "Gelas Sloki 40 ml", qty: 50, unit_price: 2500, amount: 125000, cat: "Tableware" },
  { name: "Bill Holder (3 pcs)", qty: 1, unit_price: 240000, amount: 240000, cat: "POS" },
  { name: "Bottle Kale 1L", qty: 6, unit_price: 4300, amount: 25800, cat: "Tableware" },
  { name: "Sembelih daging 25 cm", qty: 1, unit_price: 115000, amount: 115000, cat: "Kitchen Equipment" },
  { name: "Bel", qty: 1, unit_price: 20000, amount: 20000, cat: "Kitchen Equipment" },
  { name: "UPUPIN Vacum Sealer", qty: 1, unit_price: 125000, amount: 125000, cat: "Kitchen Equipment" },
  { name: "Tungku Kompor (Set)", qty: 1, unit_price: 35500, amount: 35500, cat: "Kitchen Equipment" },
  { name: "Tempat Sambal (18pcs), tusuk gigi (2pcs) & merica (3pcs)", qty: 1, unit_price: 56000, amount: 56000, cat: "Tableware" },
  { name: "Tempat sambal (12pcs) + Sendok Bebek (12pcs)", qty: 1, unit_price: 81000, amount: 81000, cat: "Tableware" },
  { name: "Kontainer (4pcs)", qty: 1, unit_price: 100000, amount: 100000, cat: "Kitchen Equipment" },
  { name: "Lemari", qty: 1, unit_price: 399000, amount: 399000, cat: "Furniture" },
  { name: "Isian Beansbag", qty: 1, unit_price: 129000, amount: 129000, cat: "Furniture" },
  { name: "Exhaust fan", qty: 1, unit_price: 211500, amount: 211500, cat: "Kitchen Equipment" },
  { name: "Panci Kentang", qty: 1, unit_price: 132000, amount: 132000, cat: "Kitchen Equipment" },
  { name: "Tatakan Kompor", qty: 1, unit_price: 12000, amount: 12000, cat: "Kitchen Equipment" },
  { name: "Pan Steak", qty: 1, unit_price: 107500, amount: 107500, cat: "Kitchen Equipment" },
  { name: "Sign Toilet", qty: 1, unit_price: 25000, amount: 25000, cat: "Decor" },
  { name: "Rak Bumbu", qty: 1, unit_price: 159000, amount: 159000, cat: "Kitchen Equipment" },
  { name: "Saringan nampan", qty: 1, unit_price: 43500, amount: 43500, cat: "Kitchen Equipment" },
  { name: "Timbangan", qty: 1, unit_price: 157000, amount: 157000, cat: "Kitchen Equipment" },
  { name: "Kompor Bar", qty: 1, unit_price: 295000, amount: 295000, cat: "Bar Equipment" },
  { name: "Panci Goreng (2 pcs)", qty: 1, unit_price: 125000, amount: 125000, cat: "Kitchen Equipment" },
  { name: "Tempat sponge", qty: 1, unit_price: 30000, amount: 30000, cat: "Cleaning" },
  { name: "Dispenser 20L (2pcs)", qty: 1, unit_price: 260000, amount: 260000, cat: "Bar Equipment" },
  { name: "Tikar Plastik", qty: 1, unit_price: 172000, amount: 172000, cat: "Furniture" },
  { name: "Kipas angin", qty: 1, unit_price: 1177000, amount: 1177000, cat: "Electronics" },
  { name: "Piring Bambu (60 pcs)", qty: 1, unit_price: 185000, amount: 185000, cat: "Tableware" },
  { name: "Garpu/Pisau Steak (12 pcs)", qty: 1, unit_price: 192500, amount: 192500, cat: "Tableware" },
  { name: "Gas Regulator (2pcs)", qty: 1, unit_price: 230500, amount: 230500, cat: "Kitchen Equipment" },
  { name: "Gas Melon", qty: 4, unit_price: 200000, amount: 800000, cat: "Kitchen Equipment" },
  { name: "Piring Dimsum (12 pcs)", qty: 1, unit_price: 78000, amount: 78000, cat: "Tableware" },
  { name: "Setrika", qty: 1, unit_price: 100000, amount: 100000, cat: "Appliances" },
  { name: "Wajan Goreng", qty: 1, unit_price: 62500, amount: 62500, cat: "Kitchen Equipment" },
  { name: "1 Set Nampan Saringan", qty: 2, unit_price: 50000, amount: 100000, cat: "Kitchen Equipment" },
  { name: "Alang2 (10 Lembar)", qty: 2, unit_price: 86000, amount: 172000, cat: "Decor" },
  { name: "Meja Lesehan", qty: 1, unit_price: 114000, amount: 114000, cat: "Furniture" },
  { name: "Pemotong Bawang", qty: 1, unit_price: 49000, amount: 49000, cat: "Kitchen Equipment" },
  { name: "Bantal Lesehan", qty: 4, unit_price: 198000, amount: 792000, cat: "Furniture" },
  { name: "Kitchen Timer", qty: 1, unit_price: 60000, amount: 60000, cat: "Kitchen Equipment" },
  { name: "Termos Nasi", qty: 1, unit_price: 242000, amount: 242000, cat: "Kitchen Equipment" },
  { name: "Android TV Box", qty: 1, unit_price: 254000, amount: 254000, cat: "Electronics" },
  { name: "Tikar Lesehan (6 pcs)", qty: 1, unit_price: 500000, amount: 500000, cat: "Furniture" },
  { name: "Talenan Bulat", qty: 1, unit_price: 50000, amount: 50000, cat: "Kitchen Equipment" },
  { name: "Bracket TV", qty: 1, unit_price: 408000, amount: 408000, cat: "Electronics" },
  { name: "Blackboard", qty: 1, unit_price: 82000, amount: 82000, cat: "Decor" },
  { name: "Tali Goni (15m)", qty: 1, unit_price: 215000, amount: 215000, cat: "Decor" },
  { name: "Lampu Natal LED", qty: 1, unit_price: 15500, amount: 15500, cat: "Decor" },
  { name: "Kostum Natal", qty: 1, unit_price: 92000, amount: 92000, cat: "Decor" },
  { name: "Pohon + Dekorasi Natal", qty: 1, unit_price: 650000, amount: 650000, cat: "Decor" },
  { name: "Karpet Pohon Natal", qty: 1, unit_price: 85500, amount: 85500, cat: "Decor" },
  { name: "Topi Santa (12 pcs) + Jenggot", qty: 1, unit_price: 68000, amount: 68000, cat: "Decor" },
  { name: "Chopper Philips Blender", qty: 1, unit_price: 101000, amount: 101000, cat: "Appliances" },
  { name: "Gelas Ukur", qty: 4, unit_price: 64000, amount: 256000, cat: "Bar Equipment" },
  { name: "Door Bell", qty: 1, unit_price: 60000, amount: 60000, cat: "Hardware" },
  { name: "Printer + Roll", qty: 1, unit_price: 186000, amount: 186000, cat: "POS" },
  { name: "Beans Bag (6 pcs - Mila)", qty: 1, unit_price: 984000, amount: 984000, cat: "Furniture" },
  { name: "Meja 3pcs", qty: 1, unit_price: 650000, amount: 650000, cat: "Furniture" },
  { name: "Matras", qty: 1, unit_price: 670000, amount: 670000, cat: "Furniture" },
  { name: "Showcase", qty: 1, unit_price: 4055000, amount: 4055000, cat: "Kitchen Equipment" },
  { name: "Freezer", qty: 1, unit_price: 3050000, amount: 3050000, cat: "Kitchen Equipment" },
]

export default function UtangPiutang() {
  const [activeTab, setActiveTab] = useState("overview") // overview | assets_capex | debts | modal | receivables | history
  const [records, setRecords] = useState([])
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Capex tab sub-filters
  const [capexCategory, setCapexCategory] = useState("all") // all | renov | equip | other
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
  const totalRenovation = useMemo(() => RENOVATION_ITEMS.reduce((sum, it) => sum + it.amount, 0), [])
  const totalEquipment = useMemo(() => EQUIPMENT_ITEMS.reduce((sum, it) => sum + it.amount, 0), [])
  const totalOtherStartup = useMemo(() => OTHER_STARTUP_ITEMS.reduce((sum, it) => sum + it.amount, 0), [])
  const grandTotalStartup = 90289028 // Fixed baseline from Excel (Rp 24.940.000 + Rp 33.920.028 + Rp 31.429.000)

  // Debts and Capital calculations
  const modalRecords = useMemo(() => records.filter(r => r.data?.type === "modal"), [records])
  const utangRecords = useMemo(() => records.filter(r => r.data?.type === "utang"), [records])
  const piutangRecords = useMemo(() => records.filter(r => r.data?.type === "piutang"), [records])

  const totalUtangRemaining = useMemo(() => utangRecords.reduce((sum, r) => sum + (r.data?.remaining_amount || 0), 0), [utangRecords])
  const totalPiutangRemaining = useMemo(() => piutangRecords.reduce((sum, r) => sum + (r.data?.remaining_amount || 0), 0), [piutangRecords])

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

  // Filtered Capex Items
  const filteredCapexItems = useMemo(() => {
    let list = []
    if (capexCategory === "all" || capexCategory === "renov") {
      list.push(...RENOVATION_ITEMS.map(it => ({ ...it, section: "Renovasi & Sipil", badgeColor: "bo-badge-amber" })))
    }
    if (capexCategory === "all" || capexCategory === "equip") {
      list.push(...EQUIPMENT_ITEMS.map(it => ({ ...it, section: "Equipment & Alat Resto", badgeColor: "bo-badge-blue" })))
    }
    if (capexCategory === "all" || capexCategory === "other") {
      list.push(...OTHER_STARTUP_ITEMS.map(it => ({ ...it, section: "Sewa, Stok & Operasional", badgeColor: "bo-badge-green" })))
    }
    if (searchCapex) {
      const q = searchCapex.toLowerCase()
      list = list.filter(it => it.name.toLowerCase().includes(q) || it.cat.toLowerCase().includes(q) || it.section.toLowerCase().includes(q))
    }
    return list
  }, [capexCategory, searchCapex])

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
            Buku besar modal awal pendirian resto, rincian belanja startup (renovasi, equipment & operasional), serta pencatatan utang & piutang.
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
          ["assets_capex", "🏢 Rincian Belanja Startup (Rp 90,2jt)"],
          ["modal", "👑 Modal Pemilik & Mitra (" + modalRecords.length + ")"],
          ["debts", "💸 Utang Usaha (" + utangRecords.length + ")"],
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
              <div style={{ fontSize: 11, fontWeight: 700, color: "#00B8D9", textTransform: "uppercase" }}>Realisasi Belanja Startup</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#00875A", marginTop: 4 }}>{fmt(grandTotalStartup)}</div>
              <div style={{ fontSize: 11, color: "var(--ink4)", marginTop: 4 }}>100% dialokasikan ke Renovasi & Aset</div>
            </div>

            <div className="bo-card" style={{ padding: "16px 20px", borderLeft: "4px solid #DE350B" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#DE350B", textTransform: "uppercase" }}>Utang Usaha Belum Lunas</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: totalUtangRemaining > 0 ? "#DE350B" : "var(--ink4)", marginTop: 4 }}>{fmt(totalUtangRemaining)}</div>
              <div style={{ fontSize: 11, color: "var(--ink4)", marginTop: 4 }}>{utangRecords.length} catatan utang aktif</div>
            </div>

            <div className="bo-card" style={{ padding: "16px 20px", borderLeft: "4px solid #00875A" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#00875A", textTransform: "uppercase" }}>Piutang Usaha</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#00875A", marginTop: 4 }}>{fmt(totalPiutangRemaining)}</div>
              <div style={{ fontSize: 11, color: "var(--ink4)", marginTop: 4 }}>Tagihan katering / kasbon tertunda</div>
            </div>
          </div>

          {/* Equity Breakdown */}
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ink1)", marginBottom: 12 }}>
            👥 Pembagian Modal Disetor Pemilik & Mitra
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 20 }}>
            {/* Claudy */}
            <div className="bo-card" style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "var(--ink1)" }}>Claudy (Pemilik Utama)</div>
                  <div style={{ fontSize: 12, color: "var(--ink4)" }}>Modal Pendirian Resto · Porsi Kepemilikan: <b>85,60%</b></div>
                </div>
                <span className="bo-badge bo-badge-blue">Owner Equity</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "var(--ink4)" }}>Modal Awal Disetor:</span>
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
                  <div style={{ fontSize: 12, color: "var(--ink4)" }}>Investasi Awal Resto · Porsi Kepemilikan: <b>14,40%</b></div>
                </div>
                <span className="bo-badge bo-badge-green">Partner Equity</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "var(--ink4)" }}>Modal Awal Disetor:</span>
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

          {/* LEGEND / PANDUAN PENJELASAN */}
          <div className="bo-card" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", padding: "16px 20px" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              💡 <span>Panduan & Penjelasan Buku Modal:</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, fontSize: 12.5, color: "#334155", lineHeight: 1.5 }}>
              <div>
                <b>1. Modal Awal Disetor (Equity):</b>
                <div>Uang tunai pribadi yang Claudy & Mila keluarkan saat merintis PawonLoka (Total Rp 90.289.028). Uang ini <b>sudah 100% dibelanjakan</b> untuk pembangunan resto, peralatan & sewa tempat.</div>
              </div>
              <div>
                <b>2. Kenapa Nominal Ini Tetap Tercatat?:</b>
                <div>Ini adalah bukti pembukuan sah rasio kepemilikan bisnis (Claudy 85,6% : Mila 14,4%) dan pelacak ROI *(Return on Investment)* agar tidak terjadi selisih paham di kemudian hari.</div>
              </div>
              <div>
                <b>3. Fungsi Tombol "Catat Pengembalian Modal / Prive":</b>
                <div>Hanya digunakan jika di masa depan resto membagikan laba bersih *(dividen/prive)* kembali ke kantong pribadi Claudy atau Mila, sehingga terlacak kapan modal awal tersebut lunas kembali.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ALOKASI MODAL & RINCIAN BELANJA STARTUP */}
      {activeTab === "assets_capex" && (
        <div>
          {/* 3 Main Pillar Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 18 }}>
            <div
              className={"bo-card " + (capexCategory === "renov" ? "bo-card-selected" : "")}
              onClick={() => setCapexCategory(capexCategory === "renov" ? "all" : "renov")}
              style={{ padding: "16px 20px", cursor: "pointer", borderLeft: "4px solid #F59E0B", background: capexCategory === "renov" ? "#FFFBEB" : "#fff" }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, color: "#B45309", textTransform: "uppercase" }}>1. BIAYA RENOVASI & SIPIL</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--ink1)", marginTop: 4 }}>{fmt(totalRenovation)}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink4)", marginTop: 4 }}>
                25 transaksi toko bangunan, tukang & dapur.
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#B45309", marginTop: 8 }}>
                {capexCategory === "renov" ? "✓ Sedang Difilter" : "Klik untuk filter baris →"}
              </div>
            </div>

            <div
              className={"bo-card " + (capexCategory === "equip" ? "bo-card-selected" : "")}
              onClick={() => setCapexCategory(capexCategory === "equip" ? "all" : "equip")}
              style={{ padding: "16px 20px", cursor: "pointer", borderLeft: "4px solid #0284C7", background: capexCategory === "equip" ? "#F0F9FF" : "#fff" }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, color: "#0369A1", textTransform: "uppercase" }}>2. EQUIPMENT & ALAT RESTO</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--ink1)", marginTop: 4 }}>{fmt(totalEquipment)}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink4)", marginTop: 4 }}>
                104 item alat dapur, tableware, showcase, dll.
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0369A1", marginTop: 8 }}>
                {capexCategory === "equip" ? "✓ Sedang Difilter" : "Klik untuk filter baris →"}
              </div>
            </div>

            <div
              className={"bo-card " + (capexCategory === "other" ? "bo-card-selected" : "")}
              onClick={() => setCapexCategory(capexCategory === "other" ? "all" : "other")}
              style={{ padding: "16px 20px", cursor: "pointer", borderLeft: "4px solid #00875A", background: capexCategory === "other" ? "#F0FDF4" : "#fff" }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, color: "#15803D", textTransform: "uppercase" }}>3. SEWA, STOK & OPERASIONAL</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--ink1)", marginTop: 4 }}>{fmt(totalOtherStartup)}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink4)", marginTop: 4 }}>
                20 transaksi sewa, food tasting, seragam, dll.
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#15803D", marginTop: 8 }}>
                {capexCategory === "other" ? "✓ Sedang Difilter" : "Klik untuk filter baris →"}
              </div>
            </div>
          </div>

          {/* Action Bar & Search */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                onClick={() => setCapexCategory("all")}
                className={"bo-btn bo-btn-sm " + (capexCategory === "all" ? "bo-btn-primary" : "bo-btn-ghost")}
              >
                Semua Item ({filteredCapexItems.length})
              </button>
              <button
                onClick={() => setCapexCategory("renov")}
                className={"bo-btn bo-btn-sm " + (capexCategory === "renov" ? "bo-btn-primary" : "bo-btn-ghost")}
              >
                Renovasi ({RENOVATION_ITEMS.length})
              </button>
              <button
                onClick={() => setCapexCategory("equip")}
                className={"bo-btn bo-btn-sm " + (capexCategory === "equip" ? "bo-btn-primary" : "bo-btn-ghost")}
              >
                Equipment ({EQUIPMENT_ITEMS.length})
              </button>
              <button
                onClick={() => setCapexCategory("other")}
                className={"bo-btn bo-btn-sm " + (capexCategory === "other" ? "bo-btn-primary" : "bo-btn-ghost")}
              >
                Sewa & Operasional ({OTHER_STARTUP_ITEMS.length})
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={searchCapex}
                onChange={e => setSearchCapex(e.target.value)}
                placeholder="Cari item (misal: cat, showcase, sewa)..."
                className="bo-input"
                style={{ width: 240 }}
              />
              <a href="/backoffice/assets" className="bo-btn bo-btn-sm bo-btn-ghost" style={{ color: "var(--brand)", whiteSpace: "nowrap" }}>
                Buka Menu Assets ↗
              </a>
            </div>
          </div>

          {/* Table */}
          <div className="bo-card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="bo-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: "center" }}>#</th>
                  <th>Nama Item / Belanjaan</th>
                  <th>Kelompok</th>
                  <th>Kategori</th>
                  <th style={{ textAlign: "center" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Harga Satuan</th>
                  <th style={{ textAlign: "right" }}>Total (Rp)</th>
                </tr>
              </thead>
              <tbody>
                {filteredCapexItems.map((it, idx) => (
                  <tr key={idx}>
                    <td style={{ textAlign: "center", color: "var(--ink5)", fontSize: 12 }}>{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 700, color: "var(--ink1)" }}>{it.name}</div>
                    </td>
                    <td>
                      <span className={"bo-badge " + it.badgeColor}>{it.section}</span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--ink4)" }}>{it.cat}</td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{it.qty}</td>
                    <td style={{ textAlign: "right", color: "var(--ink4)" }}>
                      {it.unit_price ? fmt(it.unit_price) : "—"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: "var(--ink1)" }}>
                      {fmt(it.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--surface2)", fontWeight: 900 }}>
                  <td colSpan={6} style={{ textAlign: "right", paddingRight: 16 }}>TOTAL YANG TAMPIL:</td>
                  <td style={{ textAlign: "right", fontSize: 14, color: "var(--brand)" }}>
                    {fmt(filteredCapexItems.reduce((s, x) => s + x.amount, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: MODAL PEMILIK & MITRA */}
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

      {/* TAB 4: UTANG USAHA */}
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
                  placeholder="Contoh: Supplier Daging, Pelanggan Katering..."
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
                  placeholder="Contoh: Utang Bahan Baku, Piutang Katering, Kasbon..."
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
                  placeholder="Contoh: Pembagian dividen bulan September, pelunasan sisa..."
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
