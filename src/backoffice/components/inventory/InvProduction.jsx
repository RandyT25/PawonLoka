import { useState, useEffect } from "react"
import { supabase } from "../../../lib/supabase"
import { toBaseUnit } from "../../../shared/unitConversion"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }

export default function InvProduction() {
  const [batches,       setBatches]       = useState([])
  const [ingredients,   setIngredients]   = useState([])
  const [subRecipes,    setSubRecipes]    = useState([])
  const [subRecipeIngs, setSubRecipeIngs] = useState([])
  const [staff,         setStaff]         = useState([])
  const [modal,         setModal]         = useState(false)
  const [viewModal,     setViewModal]     = useState(null)
  const [useRecipe,     setUseRecipe]     = useState(true)
  const [recipeId,      setRecipeId]      = useState("")
  const [form,          setForm]          = useState({ item_id:"", batch_qty:"", unit:"", date:new Date().toISOString().slice(0,10), produced_by:"", notes:"" })
  const [usedItems,     setUsedItems]     = useState([{ ingredient_id:"", qty:"", unit:"" }])
  const [saving,        setSaving]        = useState(false)
  const [loading,       setLoading]       = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data:b }, { data:i }, { data:s }, { data:sr }, { data:sri }] = await Promise.all([
      supabase.from("production_batches").select("*").order("created_at", { ascending:false }),
      supabase.from("ingredients").select("id,name,unit,stock,cost_per_unit,category,conversions"),
      supabase.from("staff").select("id,name"),
      supabase.from("sub_recipes").select("*").order("name"),
      supabase.from("sub_recipe_ingredients").select("*"),
    ])
    setBatches(b||[]); setIngredients(i||[]); setStaff(s||[])
    setSubRecipes(sr||[]); setSubRecipeIngs(sri||[])
    setLoading(false)
  }

  function selectRecipe(id) {
    setRecipeId(id)
    if (!id) { setForm(f=>({...f,item_id:"",unit:""})); return }
    const sub = subRecipes.find(s=>s.id===id)
    if (sub) {
      const ing = ingredients.find(i=>i.id===sub.ingredient_id)
      setForm(f=>({...f, item_id:sub.ingredient_id||"", unit:sub.yield_unit||sub.unit||ing?.unit||"" }))
    }
  }

  const semiFinished = ingredients.filter(i => i.category === "Semi-finished" || i.name?.toLowerCase().includes("(sub)"))

  function addUsedItem()      { setUsedItems(u=>[...u,{ingredient_id:"",qty:"",unit:""}]) }
  function removeUsedItem(i)  { setUsedItems(u=>u.filter((_,idx)=>idx!==i)) }
  function updateUsedItem(i,k,v){ setUsedItems(u=>u.map((x,idx)=>{
    if(idx!==i) return x
    const up={...x,[k]:v}
    if(k==="ingredient_id"){ const ing=ingredients.find(ing=>ing.id===v); if(ing) up.unit=ing.unit }
    return up
  })) }

  async function submitBatch() {
    const item = ingredients.find(i=>i.id===form.item_id)
    if (!item || !form.batch_qty) { alert("Pilih item dan jumlah batch"); return }
    const batchQty = parseFloat(form.batch_qty)

    let ingredients_used
    if (useRecipe && recipeId) {
      const sub = subRecipes.find(s => s.id === recipeId)
      const typicalYield = parseFloat(sub?.yield_qty) || 0
      // Guard against fat-finger entries (e.g. extra zeros) — normal batches can legitimately
      // run up to ~20x a recipe's single yield, so only flag truly extreme outliers.
      if (typicalYield > 0 && (batchQty > typicalYield * 50 || batchQty < typicalYield * 0.02)) {
        const ok = confirm(
          `Batch ini ${batchQty} ${form.unit || sub.yield_unit}, tapi resep ini biasanya menghasilkan ` +
          `${typicalYield} ${sub.yield_unit} per batch. Ini terlihat seperti salah ketik (misal kelebihan angka 0). Lanjutkan?`
        )
        if (!ok) return
      }
      const lines = subRecipeIngs.filter(l => l.sub_recipe_id === recipeId)
      if (!lines.length) { alert("Resep tidak memiliki bahan. Tambahkan bahan di Recipe Editor."); return }
      ingredients_used = lines.map(l => {
        const ing = ingredients.find(i=>i.id===l.ingredient_id)
        return { ingredient_id:l.ingredient_id, name:ing?.name||"", qty:Math.round(l.qty*batchQty*100)/100, unit:l.unit||ing?.unit||"" }
      })
    } else {
      const validItems = usedItems.filter(i=>i.ingredient_id&&parseFloat(i.qty)>0)
      if (!validItems.length) { alert("Tambahkan bahan yang digunakan"); return }
      ingredients_used = validItems.map(u=>{
        const ing = ingredients.find(i=>i.id===u.ingredient_id)
        return { ingredient_id:u.ingredient_id, name:ing?.name||"", qty:parseFloat(u.qty), unit:u.unit||ing?.unit||"" }
      })
    }

    setSaving(true)
    const batchId = "PRD-"+String(batches.length+1).padStart(3,"0")
    await supabase.from("production_batches").insert({
      id:batchId, item_id:form.item_id, item_name:item.name,
      batch_qty:parseFloat(form.batch_qty), unit:form.unit||item.unit,
      date:form.date, produced_by:form.produced_by, notes:form.notes||null,
      ingredients_used, status:"Completed"
    })
    // Deduct used ingredients stock + log
    for (const u of ingredients_used) {
      const ing = ingredients.find(i=>i.id===u.ingredient_id)
      if (!ing) continue
      const qtyBase = toBaseUnit(ing, parseFloat(u.qty)||0, u.unit)
      await supabase.from("ingredients").update({ stock:Math.max(0,(ing.stock||0)-qtyBase) }).eq("id",ing.id)
      await supabase.from("stock_movements").insert({
        id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
        type:"Production", ingredient_id:ing.id, ingredient_name:ing.name,
        qty:-qtyBase, unit:ing.unit, ref:batchId,
        note:"Used in production: "+item.name,
        date:form.date,
        time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
      })
    }
    // Add to semi-finished stock + log (yield may be entered in a different unit than the item's base unit)
    const yieldBase = toBaseUnit(item, parseFloat(form.batch_qty)||0, form.unit||item.unit)
    await supabase.from("ingredients").update({ stock:(item.stock||0)+yieldBase }).eq("id",item.id)
    await supabase.from("stock_movements").insert({
      id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
      type:"Production", ingredient_id:item.id, ingredient_name:item.name,
      qty:yieldBase, unit:item.unit, ref:batchId,
      note:"Produced batch",
      date:form.date,
      time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
    })
    await load()
    setModal(false)
    setRecipeId(""); setUseRecipe(true)
    setForm({ item_id:"", batch_qty:"", unit:"", date:new Date().toISOString().slice(0,10), produced_by:"", notes:"" })
    setUsedItems([{ ingredient_id:"", qty:"", unit:"" }])
    setSaving(false)
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <span style={{ fontSize:13, color:"var(--ink4)", fontWeight:600 }}>{batches.length} production batches</span>
        <button onClick={()=>setModal(true)} className="bo-btn bo-btn-primary">+ New Production Batch</button>
      </div>

      <div className="bo-card" style={{ padding:0, overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
          <table className="bo-table">
            <thead><tr><th>Batch ID</th><th>Date</th><th>Item Produced</th><th>Quantity</th><th>Produced By</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id}>
                  <td style={{ fontWeight:700, fontFamily:"monospace", fontSize:12 }}>{b.id}</td>
                  <td style={{ fontSize:12 }}>{b.date}</td>
                  <td style={{ fontWeight:700, color:"#6554C0" }}>{b.item_name}</td>
                  <td style={{ fontWeight:700, color:"var(--green)" }}>{b.batch_qty} {b.unit}</td>
                  <td style={{ fontSize:12 }}>{b.produced_by||"—"}</td>
                  <td><span className="bo-badge bo-badge-green">Completed</span></td>
                  <td><button onClick={()=>setViewModal(b)} className="bo-btn bo-btn-ghost bo-btn-sm">View</button></td>
                </tr>
              ))}
              {batches.length===0 && <tr><td colSpan={7} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No production batches yet</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* New Batch Modal */}
      {modal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="bo-modal" style={{ maxWidth:600, maxHeight:"92vh" }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">New Production Batch</div>
              <button className="bo-modal-close" onClick={()=>setModal(false)}>✕</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto" }}>

              {/* Mode toggle */}
              <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                <button onClick={()=>setUseRecipe(true)}  className={"bo-btn bo-btn-sm "+(useRecipe?"bo-btn-primary":"bo-btn-ghost")}>📋 Gunakan Resep</button>
                <button onClick={()=>setUseRecipe(false)} className={"bo-btn bo-btn-sm "+(!useRecipe?"bo-btn-primary":"bo-btn-ghost")}>✏️ Manual</button>
              </div>

              {useRecipe ? (
                <>
                  {/* Recipe mode */}
                  <div className="bo-form-row">
                    <label className="bo-label">Pilih Resep *</label>
                    <select value={recipeId} onChange={e=>selectRecipe(e.target.value)} className="bo-select">
                      <option value="">— Pilih resep —</option>
                      {subRecipes.map(r=><option key={r.id} value={r.id}>{r.name} ({r.yield_qty} {r.yield_unit||r.unit} per batch)</option>)}
                    </select>
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                    <div>
                      <label className="bo-label">Jumlah Batch *</label>
                      <input type="number" value={form.batch_qty} onChange={e=>setForm(f=>({...f,batch_qty:e.target.value}))} className="bo-input" placeholder="0" style={{ fontSize:20, fontWeight:800 }} />
                    </div>
                    <div>
                      <label className="bo-label">Tanggal</label>
                      <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} className="bo-input" />
                    </div>
                  </div>

                  <div className="bo-form-row">
                    <label className="bo-label">Diproduksi Oleh</label>
                    <select value={form.produced_by} onChange={e=>setForm(f=>({...f,produced_by:e.target.value}))} className="bo-select">
                      <option value="">— Pilih —</option>
                      {staff.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>

                  {/* Read-only ingredient preview */}
                  {recipeId && parseFloat(form.batch_qty) > 0 && (() => {
                    const bq    = parseFloat(form.batch_qty)
                    const lines = subRecipeIngs.filter(l=>l.sub_recipe_id===recipeId)
                    const total = lines.reduce((s,l)=>{ const ing=ingredients.find(i=>i.id===l.ingredient_id); return s+(l.qty*bq*(ing?.cost_per_unit||0)) },0)
                    return (
                      <div style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px", marginBottom:14 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:"#42526E", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.4px" }}>
                          Bahan yang akan dipakai (otomatis)
                        </div>
                        {lines.map((l,i)=>{ const ing=ingredients.find(x=>x.id===l.ingredient_id); return (
                          <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid #eee", fontSize:13 }}>
                            <span style={{ fontWeight:600 }}>{ing?.name||""}</span>
                            <span style={{ color:"#00875A", fontWeight:700 }}>{l.qty} × {bq} = <strong>{l.qty*bq}</strong> {l.unit||ing?.unit}</span>
                          </div>
                        )})}
                        {total > 0 && <div style={{ marginTop:8, fontWeight:800, color:"#00875A", fontSize:13, textAlign:"right" }}>Est. cost: {fmt(total)}</div>}
                      </div>
                    )
                  })()}
                </>
              ) : (
                <>
                  {/* Manual mode — original UI */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                    <div><label className="bo-label">Item to Produce *</label>
                      <select value={form.item_id} onChange={e=>setForm(f=>({...f,item_id:e.target.value}))} className="bo-select">
                        <option value="">— Select item —</option>
                        {ingredients.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </div>
                    <div><label className="bo-label">Batch Quantity *</label>
                      <div style={{ display:"flex", gap:6 }}>
                        <input type="number" value={form.batch_qty} onChange={e=>setForm(f=>({...f,batch_qty:e.target.value}))} className="bo-input" placeholder="0" />
                        <input value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} className="bo-input" placeholder="Unit" style={{ width:70 }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                    <div><label className="bo-label">Date</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} className="bo-input" /></div>
                    <div><label className="bo-label">Produced By</label>
                      <select value={form.produced_by} onChange={e=>setForm(f=>({...f,produced_by:e.target.value}))} className="bo-select">
                        <option value="">— Select —</option>
                        {staff.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <label className="bo-label" style={{ marginBottom:0 }}>Ingredients Used *</label>
                      <button onClick={addUsedItem} className="bo-btn bo-btn-ghost bo-btn-sm">+ Add</button>
                    </div>
                    {usedItems.map((u,i) => (
                      <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 80px 70px 36px", gap:8, marginBottom:8 }}>
                        <select value={u.ingredient_id} onChange={e=>updateUsedItem(i,"ingredient_id",e.target.value)} className="bo-select">
                          <option value="">— Select —</option>
                          {ingredients.map(ing=><option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>)}
                        </select>
                        <input type="number" value={u.qty} onChange={e=>updateUsedItem(i,"qty",e.target.value)} className="bo-input" placeholder="Qty" />
                        <input value={u.unit} onChange={e=>updateUsedItem(i,"unit",e.target.value)} className="bo-input" placeholder="Unit" />
                        <button onClick={()=>removeUsedItem(i)} className="bo-btn bo-btn-danger bo-btn-sm" style={{ padding:"0 10px" }}>✕</button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="bo-form-row"><label className="bo-label">Notes</label><textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} className="bo-input" rows={2} /></div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setModal(false)} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={submitBatch} disabled={saving} className="bo-btn bo-btn-primary">{saving?"Saving...":"Record Production"}</button>
            </div>
          </div>
        </div>
      )}

      {/* View Batch Modal */}
      {viewModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setViewModal(null)}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">{viewModal.id} — Production Batch</div>
              <button className="bo-modal-close" onClick={()=>setViewModal(null)}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                <div><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>Produced Item</div><div style={{ fontSize:15, fontWeight:800, color:"#6554C0" }}>{viewModal.item_name}</div></div>
                <div><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>Batch Quantity</div><div style={{ fontSize:15, fontWeight:800, color:"var(--green)" }}>{viewModal.batch_qty} {viewModal.unit}</div></div>
                <div><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>Date</div><div>{viewModal.date}</div></div>
                <div><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>Produced By</div><div>{viewModal.produced_by||"—"}</div></div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:"var(--ink)", marginBottom:8 }}>Ingredients Used</div>
              <table className="bo-table">
                <thead><tr><th>Ingredient</th><th>Qty</th><th>Unit</th></tr></thead>
                <tbody>
                  {(viewModal.ingredients_used||[]).map((i,idx)=>(
                    <tr key={idx}><td>{i.name}</td><td>{i.qty}</td><td>{i.unit}</td></tr>
                  ))}
                </tbody>
              </table>
              {viewModal.notes && <div style={{ marginTop:10, padding:10, background:"var(--surface)", borderRadius:"var(--r)", fontSize:13 }}>{viewModal.notes}</div>}
            </div>
            <div className="bo-modal-footer"><button onClick={()=>setViewModal(null)} className="bo-btn bo-btn-ghost">Close</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
