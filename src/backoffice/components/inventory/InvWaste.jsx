import { useState, useEffect } from "react"
import { supabase } from "../../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }
const REASONS = ["Expired","Damaged","Overproduction","Spillage","Other"]
const REASON_COLORS = { Expired:"var(--red)", Damaged:"var(--amber)", Overproduction:"#6554C0", Spillage:"var(--brand)", Other:"var(--ink5)" }

export default function InvWaste() {
  const [waste,       setWaste]       = useState([])
  const [ingredients, setIngredients] = useState([])
  const [staff,       setStaff]       = useState([])
  const [modal,       setModal]       = useState(false)
  const [form,        setForm]        = useState({ ingredient_id:"", qty:"", unit:"", reason:"Expired", date:new Date().toISOString().slice(0,10), recorded_by:"", notes:"" })
  const [costPreview, setCostPreview] = useState(0)
  const [saving,      setSaving]      = useState(false)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data:w }, { data:i }, { data:s }] = await Promise.all([
      supabase.from("waste_records").select("*").order("created_at", { ascending:false }),
      supabase.from("ingredients").select("id,name,unit,stock,cost_per_unit"),
      supabase.from("staff").select("id,name"),
    ])
    setWaste(w||[]); setIngredients(i||[]); setStaff(s||[])
    setLoading(false)
  }

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

  async function submitWaste() {
    const ing = ingredients.find(i=>i.id===form.ingredient_id)
    if (!ing || !form.qty) { alert("Select ingredient and quantity"); return }
    setSaving(true)
    const wstId = "WST-"+String(waste.length+1).padStart(3,"0")
    await supabase.from("waste_records").insert({
      id:wstId, date:form.date, ingredient_id:ing.id, ingredient_name:ing.name,
      qty:parseFloat(form.qty), unit:form.unit||ing.unit,
      reason:form.reason, cost:costPreview,
      recorded_by:form.recorded_by||null, notes:form.notes||null
    })
    // Deduct from stock
    await supabase.from("ingredients").update({ stock:Math.max(0,(ing.stock||0)-parseFloat(form.qty)) }).eq("id",ing.id)
    // Log movement
    await supabase.from("stock_movements").insert({
      id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
      type:"Waste", ingredient_id:ing.id, ingredient_name:ing.name,
      qty:-parseFloat(form.qty), unit:form.unit||ing.unit, ref:wstId,
      note:form.reason+(form.notes?" — "+form.notes:""),
      date:form.date,
      time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
    })
    await load()
    setModal(false)
    setForm({ ingredient_id:"", qty:"", unit:"", reason:"Expired", date:new Date().toISOString().slice(0,10), recorded_by:"", notes:"" })
    setCostPreview(0)
    setSaving(false)
  }

  const totalCost = waste.reduce((a,w)=>a+(w.cost||0),0)

  return (
    <div>
      {/* Stats */}
      <div className="bo-metrics" style={{ gridTemplateColumns:"repeat(3,1fr)", marginBottom:16 }}>
        <div className="bo-met red"><div className="bo-met-label">Total Records</div><div className="bo-met-val">{waste.length}</div><div className="bo-met-sub">all time</div></div>
        <div className="bo-met red"><div className="bo-met-label">Total Waste Cost</div><div className="bo-met-val">{fmt(totalCost)}</div><div className="bo-met-sub">value lost</div></div>
        <div className="bo-met amber"><div className="bo-met-label">This Month</div><div className="bo-met-val">{fmt(waste.filter(w=>w.date?.slice(0,7)===new Date().toISOString().slice(0,7)).reduce((a,w)=>a+(w.cost||0),0))}</div></div>
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <span style={{ fontSize:13, color:"var(--ink4)", fontWeight:600 }}>{waste.length} waste records</span>
        <button onClick={()=>setModal(true)} className="bo-btn bo-btn-primary">+ Record Waste</button>
      </div>

      <div className="bo-card" style={{ padding:0, overflow:"hidden" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
          <table className="bo-table">
            <thead><tr><th>Record ID</th><th>Date</th><th>Ingredient</th><th>Quantity</th><th>Reason</th><th>Cost Impact</th><th>Recorded By</th><th>Notes</th></tr></thead>
            <tbody>
              {waste.map(w => (
                <tr key={w.id}>
                  <td style={{ fontFamily:"monospace", fontSize:11, color:"var(--ink5)" }}>{w.id}</td>
                  <td style={{ fontSize:12 }}>{w.date}</td>
                  <td style={{ fontWeight:700 }}>{w.ingredient_name}</td>
                  <td style={{ fontWeight:600, color:"var(--red)" }}>{w.qty} {w.unit}</td>
                  <td><span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10, background:(REASON_COLORS[w.reason]||"var(--ink5)")+"22", color:REASON_COLORS[w.reason]||"var(--ink5)" }}>{w.reason}</span></td>
                  <td style={{ fontWeight:700, color:"var(--red)" }}>−{fmt(w.cost||0)}</td>
                  <td style={{ fontSize:12, color:"var(--ink4)" }}>{w.recorded_by||"—"}</td>
                  <td style={{ fontSize:11, color:"var(--ink5)" }}>{w.notes||"—"}</td>
                </tr>
              ))}
              {waste.length===0 && <tr><td colSpan={8} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No waste records yet</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">Record Waste / Spoilage</div>
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
                <div><label className="bo-label">Reason</label>
                  <select value={form.reason} onChange={e=>updateForm("reason",e.target.value)} className="bo-select">
                    {REASONS.map(r=><option key={r}>{r}</option>)}
                  </select>
                </div>
                <div><label className="bo-label">Date</label><input type="date" value={form.date} onChange={e=>updateForm("date",e.target.value)} className="bo-input" /></div>
              </div>
              {/* Cost preview */}
              <div style={{ padding:"10px 14px", background:"var(--red-lt)", border:"1px solid rgba(222,53,11,0.2)", borderRadius:"var(--r)", marginBottom:14, fontSize:14, fontWeight:800, color:"var(--red)" }}>
                Estimated Cost Impact: −{fmt(costPreview)}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Recorded By</label>
                  <select value={form.recorded_by} onChange={e=>updateForm("recorded_by",e.target.value)} className="bo-select">
                    <option value="">— Select —</option>
                    {staff.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div><label className="bo-label">Notes</label><input value={form.notes} onChange={e=>updateForm("notes",e.target.value)} className="bo-input" placeholder="Optional" /></div>
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setModal(false)} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={submitWaste} disabled={saving||!form.ingredient_id||!form.qty} className="bo-btn bo-btn-primary">{saving?"Saving...":"Record Waste"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
