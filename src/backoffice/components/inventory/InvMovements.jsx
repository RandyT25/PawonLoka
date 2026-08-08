import { useState, useEffect, useCallback } from "react"
import { supabase } from "../../../lib/supabase"
import DateRangePicker, { buildDateRange } from "../DateRangePicker"

const TYPE_COLORS = { Sale:"var(--brand)", Purchase:"var(--green)", Waste:"var(--red)", "Staff Meal":"#F59E0B", Production:"#6554C0", Adjustment:"var(--amber)" }
const today = () => new Date().toISOString().slice(0, 10)

export default function InvMovements() {
  const [movements,   setMovements]   = useState([])
  const [ingredients, setIngredients] = useState([])
  const [filter,      setFilter]      = useState("all")
  const [modal,       setModal]       = useState(false)
  const [form,        setForm]        = useState({ ingredient_id:"", qty:"", unit:"", reason:"" })
  const [saving,      setSaving]      = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [showSummary, setShowSummary] = useState(true)

  const [range,        setRange]        = useState("month")
  const [customDate,   setCustomDate]   = useState(today())
  const [customDateTo, setCustomDateTo] = useState(today())
  const [lastUpdated,  setLastUpdated]  = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { fromStr, toStr } = buildDateRange(range, customDate, customDateTo)
    const fromDate = fromStr.slice(0, 10)
    const toDate   = toStr ? toStr.slice(0, 10) : today()

    const [{ data:m }, { data:i }] = await Promise.all([
      supabase.from("stock_movements").select("*")
        .gte("date", fromDate).lte("date", toDate)
        .order("date", { ascending:false }).order("time", { ascending:false }).limit(1000),
      supabase.from("ingredients").select("id,name,unit,stock"),
    ])
    setMovements(m||[])
    setIngredients(i||[])
    setLastUpdated(new Date())
    setLoading(false)
  }, [range, customDate, customDateTo])

  useEffect(() => { load() }, [load])

  const types = ["all","Sale","Purchase","Waste","Staff Meal","Production","Adjustment"]
  const filtered = filter === "all" ? movements : movements.filter(m => m.type === filter)

  // Consumption summary: group Sale movements by ingredient
  const saleMoves = movements.filter(m => m.type === "Sale")
  const consumptionMap = {}
  saleMoves.forEach(m => {
    const key = m.ingredient_name || m.ingredient_id
    if (!consumptionMap[key]) consumptionMap[key] = { name:key, unit:m.unit, total:0 }
    consumptionMap[key].total += Math.abs(m.qty || 0)
  })
  const consumption = Object.values(consumptionMap).sort((a, b) => b.total - a.total)

  async function submitAdjustment() {
    const ing = ingredients.find(i => i.id === form.ingredient_id)
    if (!ing || !form.qty || !form.reason) { alert("Fill all fields"); return }
    setSaving(true)
    try {
      const qty = parseFloat(form.qty)
      // Fetch fresh stock right before writing rather than trusting the page-load
      // snapshot, so a sale/production that happened while this modal was open isn't
      // silently overwritten.
      const { data:freshIng } = await supabase.from("ingredients").select("stock").eq("id",ing.id).maybeSingle()
      const newStock = Math.max(0, (freshIng?.stock ?? ing.stock ?? 0) + qty)
      const { error:updErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id",ing.id)
      if (updErr) throw updErr
      const { error:movErr } = await supabase.from("stock_movements").insert({
        id:"MOV-"+Date.now(), type:"Adjustment",
        ingredient_id:ing.id, ingredient_name:ing.name,
        qty, unit:form.unit||ing.unit, ref:"MANUAL", note:form.reason,
        date:new Date().toISOString().slice(0,10),
        time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
      })
      if (movErr) throw movErr
      await load()
      setModal(false)
      setForm({ ingredient_id:"", qty:"", unit:"", reason:"" })
    } catch(e) { alert("Error: "+e.message) }
    setSaving(false)
  }

  return (
    <div>
      <DateRangePicker range={range} setRange={setRange} customDate={customDate} setCustomDate={setCustomDate}
        customDateTo={customDateTo} setCustomDateTo={setCustomDateTo}
        loading={loading} lastUpdated={lastUpdated} onRefresh={load} />

      {/* Consumption Summary */}
      {consumption.length > 0 && (
        <div className="bo-card" style={{ marginBottom:16, padding:"14px 16px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom: showSummary ? 12 : 0, cursor:"pointer" }}
               onClick={() => setShowSummary(s => !s)}>
            <span style={{ fontSize:13, fontWeight:700 }}>📦 Ringkasan Konsumsi Bahan (dari penjualan)</span>
            <span style={{ marginLeft:"auto", fontSize:12, color:"var(--ink5)" }}>{showSummary ? "▲ Sembunyikan" : "▼ Tampilkan"}</span>
          </div>
          {showSummary && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:8 }}>
              {consumption.map(c => (
                <div key={c.name} style={{ background:"var(--surface2)", borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"var(--ink4)", marginBottom:4, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.name}</div>
                  <div style={{ fontSize:18, fontWeight:900, color:"var(--brand)" }}>
                    {c.total % 1 === 0 ? c.total.toLocaleString("id-ID") : c.total.toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2})}
                    <span style={{ fontSize:11, fontWeight:600, color:"var(--ink5)", marginLeft:4 }}>{c.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Type filter + add button */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {types.map(t => {
            const cnt = t === "all" ? movements.length : movements.filter(m => m.type === t).length
            return <button key={t} onClick={() => setFilter(t)} className={"bo-btn bo-btn-sm "+(filter===t?"bo-btn-primary":"bo-btn-ghost")}>{t} ({cnt})</button>
          })}
        </div>
        <button onClick={() => setModal(true)} className="bo-btn bo-btn-primary" style={{ marginLeft:"auto" }}>+ Manual Adjustment</button>
      </div>

      <div className="bo-card" style={{ padding:0, overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
          <table className="bo-table">
            <thead><tr><th>ID</th><th>Date</th><th>Time</th><th>Type</th><th>Ingredient</th><th>Quantity</th><th>Reference</th><th>Note</th></tr></thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id}>
                  <td style={{ fontFamily:"monospace", fontSize:10, color:"var(--ink5)" }}>{m.id}</td>
                  <td style={{ fontSize:12 }}>{m.date}</td>
                  <td style={{ fontSize:12, color:"var(--ink5)" }}>{m.time||"—"}</td>
                  <td><span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10, background:(TYPE_COLORS[m.type]||"var(--ink5)")+"22", color:TYPE_COLORS[m.type]||"var(--ink5)" }}>{m.type}</span></td>
                  <td style={{ fontWeight:600 }}>{m.ingredient_name}</td>
                  <td style={{ fontWeight:700, color:m.qty<0?"var(--red)":"var(--green)" }}>{m.qty>0?"+":""}{m.qty} {m.unit}</td>
                  <td style={{ fontFamily:"monospace", fontSize:11, color:"var(--ink5)" }}>{m.ref||"—"}</td>
                  <td style={{ fontSize:11, color:"var(--ink4)" }}>{m.note||"—"}</td>
                </tr>
              ))}
              {filtered.length===0 && <tr><td colSpan={8} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>Tidak ada data pada periode ini</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">Manual Stock Adjustment</div>
              <button className="bo-modal-close" onClick={()=>setModal(false)}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div className="bo-form-row"><label className="bo-label">Ingredient *</label>
                <select value={form.ingredient_id} onChange={e=>{
                  const ing=ingredients.find(i=>i.id===e.target.value)
                  setForm(f=>({...f,ingredient_id:e.target.value,unit:ing?.unit||""}))
                }} className="bo-select">
                  <option value="">— Select ingredient —</option>
                  {ingredients.map(i=><option key={i.id} value={i.id}>{i.name} — Current: {i.stock} {i.unit}</option>)}
                </select>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Adjustment Qty * <span style={{ fontSize:10, color:"var(--ink5)" }}>(use − for decrease)</span></label><input type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} className="bo-input" placeholder="e.g. -5 or +10" /></div>
                <div><label className="bo-label">Unit</label><input value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} className="bo-input" /></div>
              </div>
              <div className="bo-form-row"><label className="bo-label">Reason *</label><input value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} className="bo-input" placeholder="e.g. Counting error, damaged batch..." /></div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setModal(false)} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={submitAdjustment} disabled={saving||!form.ingredient_id||!form.qty||!form.reason} className="bo-btn bo-btn-primary">{saving?"Saving...":"Record Adjustment"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
