import { useState, useEffect, useCallback } from "react"
import DateRangePicker, { buildDateRange } from "../DateRangePicker"

const today = () => new Date().toISOString().slice(0, 10)
import { supabase } from "../../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }

export default function InvStaffConsumption() {
  const [records,     setRecords]     = useState([])
  const [ingredients, setIngredients] = useState([])
  const [staff,       setStaff]       = useState([])

  const [range,        setRange]        = useState("month")
  const [customDate,   setCustomDate]   = useState(today())
  const [customDateTo, setCustomDateTo] = useState(today())
  const [lastUpdated,  setLastUpdated]  = useState(null)

  const [modal,       setModal]       = useState(false)
  const [form,        setForm]        = useState({ ingredient_id:"", qty:"", unit:"", date:new Date().toISOString().slice(0,10), consumed_by:"", notes:"" })
  const [costPreview, setCostPreview] = useState(0)
  const [saving,      setSaving]      = useState(false)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => { load() }, [load])

  const load = useCallback(async () => {
    const { fromStr, toStr } = buildDateRange(range, customDate, customDateTo)
    const fromDate = fromStr.slice(0, 10)
    const toDate   = toStr ? toStr.slice(0, 10) : today()

    setLoading(true)
    const [{ data:r }, { data:i }, { data:s }] = await Promise.all([
      supabase.from("staff_consumption").select("*").gte("date", fromDate).lte("date", toDate).order("created_at", { ascending:false }),
      supabase.from("ingredients").select("id,name,unit,stock,cost_per_unit"),
      supabase.from("staff").select("id,name"),
    ])
    setRecords(r||[]); setIngredients(i||[]); setStaff(s||[])
    setLastUpdated(new Date())
    setLoading(false)
  }, [range, customDate, customDateTo])

  function updateForm(k,v) {
    setForm(f => {
      const updated = {...f,[k]:v}
      if (k==="ingredient_id") {
        const ing = ingredients.find(i=>i.id===v)
        if (ing) { updated.unit=ing.unit; setCostPreview((parseFloat(f.qty)||0)*(ing.cost_per_unit||0)) }
      }
      if (k==="qty") {
        const ing = ingredients.find(i=>i.id===f.ingredient_id)
        setCostPreview((parseFloat(v)||0)*(ing?.cost_per_unit||0))
      }
      return updated
    })
  }

  async function submitConsumption() {
    const ing = ingredients.find(i=>i.id===form.ingredient_id)
    if (!ing || !form.qty) { alert("Select ingredient and quantity"); return }
    setSaving(true)
    try {
      const csmId = "CSM-"+String(records.length+1).padStart(3,"0")
      const qty = parseFloat(form.qty)
      const { error:csmErr } = await supabase.from("staff_consumption").insert({
        id:csmId, date:form.date, ingredient_id:ing.id, ingredient_name:ing.name,
        qty, unit:form.unit||ing.unit,
        cost:costPreview,
        consumed_by:form.consumed_by||null, notes:form.notes||null
      })
      if (csmErr) throw csmErr
      // Fetch fresh stock right before writing rather than trusting the page-load
      // snapshot, so a sale/production that happened while this modal was open isn't
      // silently overwritten.
      const { data:freshIng } = await supabase.from("ingredients").select("stock").eq("id",ing.id).maybeSingle()
      const newStock = Math.max(0, (freshIng?.stock ?? ing.stock ?? 0) - qty)
      const { error:updErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id",ing.id)
      if (updErr) throw updErr
      const { error:movErr } = await supabase.from("stock_movements").insert({
        id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
        type:"Staff Meal", ingredient_id:ing.id, ingredient_name:ing.name,
        qty:-qty, unit:form.unit||ing.unit, ref:csmId,
        note:"Staff meal"+(form.consumed_by?" by "+form.consumed_by:"")+(form.notes?" — "+form.notes:""),
        date:form.date,
        time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
      })
      if (movErr) throw movErr
      await load()
      setModal(false)
      setForm({ ingredient_id:"", qty:"", unit:"", date:new Date().toISOString().slice(0,10), consumed_by:"", notes:"" })
      setCostPreview(0)
    } catch(e) { alert("Error: "+e.message) }
    setSaving(false)
  }

  const totalCost = records.reduce((a,r)=>a+(r.cost||0),0)

  return (
    <div>
      {/* Stats */}
      <DateRangePicker range={range} setRange={setRange} customDate={customDate} setCustomDate={setCustomDate}
        customDateTo={customDateTo} setCustomDateTo={setCustomDateTo}
        loading={loading} lastUpdated={lastUpdated} onRefresh={load} />

      <div className="bo-metrics" style={{ gridTemplateColumns:"repeat(3,1fr)", marginBottom:16 }}>
        <div className="bo-met amber"><div className="bo-met-label">Total Records</div><div className="bo-met-val">{records.length}</div><div className="bo-met-sub">all time</div></div>
        <div className="bo-met amber"><div className="bo-met-label">Total Cost</div><div className="bo-met-val">{fmt(totalCost)}</div><div className="bo-met-sub">value taken</div></div>
        <div className="bo-met amber"><div className="bo-met-label">This Month</div><div className="bo-met-val">{fmt(records.filter(r=>r.date?.slice(0,7)===new Date().toISOString().slice(0,7)).reduce((a,r)=>a+(r.cost||0),0))}</div></div>
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <span style={{ fontSize:13, color:"var(--ink4)", fontWeight:600 }}>{records.length} consumption records</span>
        <button onClick={()=>setModal(true)} className="bo-btn bo-btn-primary">+ Log Consumption</button>
      </div>

      <div className="bo-card" style={{ padding:0, overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
          <table className="bo-table">
            <thead><tr><th>Record ID</th><th>Date</th><th>Ingredient</th><th>Quantity</th><th>Cost Impact</th><th>Consumed By</th><th>Notes</th></tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily:"monospace", fontSize:11, color:"var(--ink5)" }}>{r.id}</td>
                  <td style={{ fontSize:12 }}>{r.date}</td>
                  <td style={{ fontWeight:700 }}>{r.ingredient_name}</td>
                  <td style={{ fontWeight:600, color:"var(--amber)" }}>{r.qty} {r.unit}</td>
                  <td style={{ fontWeight:700, color:"var(--amber)" }}>−{fmt(r.cost||0)}</td>
                  <td style={{ fontSize:12, color:"var(--ink4)" }}>{r.consumed_by||"—"}</td>
                  <td style={{ fontSize:11, color:"var(--ink5)" }}>{r.notes||"—"}</td>
                </tr>
              ))}
              {records.length===0 && <tr><td colSpan={7} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No consumption records yet</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">Log Staff Consumption</div>
              <button className="bo-modal-close" onClick={()=>setModal(false)}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div className="bo-form-row"><label className="bo-label">Ingredient *</label>
                <select value={form.ingredient_id} onChange={e=>updateForm("ingredient_id",e.target.value)} className="bo-select">
                  <option value="">— Select ingredient —</option>
                  {ingredients.map(i=><option key={i.id} value={i.id}>{i.name} (Stock: {i.stock} {i.unit})</option>)}
                </select>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Quantity *</label><input type="number" value={form.qty} onChange={e=>updateForm("qty",e.target.value)} className="bo-input" placeholder="0" /></div>
                <div><label className="bo-label">Unit</label><input value={form.unit} onChange={e=>updateForm("unit",e.target.value)} className="bo-input" placeholder="Unit" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Date</label><input type="date" value={form.date} onChange={e=>updateForm("date",e.target.value)} className="bo-input" /></div>
                <div><label className="bo-label">Consumed By</label>
                  <select value={form.consumed_by} onChange={e=>updateForm("consumed_by",e.target.value)} className="bo-select">
                    <option value="">— Select —</option>
                    {staff.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              {/* Cost preview */}
              <div style={{ padding:"10px 14px", background:"var(--amber-lt)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:"var(--r)", marginBottom:14, fontSize:14, fontWeight:800, color:"var(--amber)" }}>
                Estimated Cost Impact: −{fmt(costPreview)}
              </div>
              <div className="bo-form-row"><label className="bo-label">Notes</label><input value={form.notes} onChange={e=>updateForm("notes",e.target.value)} className="bo-input" placeholder="Optional" /></div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setModal(false)} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={submitConsumption} disabled={saving||!form.ingredient_id||!form.qty} className="bo-btn bo-btn-primary">{saving?"Saving...":"Log Consumption"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
