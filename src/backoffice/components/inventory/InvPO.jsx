import { useState, useEffect } from "react"
import { supabase } from "../../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }
const UNITS = ["gr","kg","ml","L","Galon","pcs","Ekor","butir","biji","buah","ikat","lembar","bungkus","pack","sachet","botol","tsp","tbsp","cup","porsi","portion"]

// Convert purchase qty to base unit using ingredient conversions
function toBaseUnit(ing, qty, purchaseUnit) {
  if (purchaseUnit === ing.unit) return qty
  const conv = (ing.conversions||[]).find(c => c.unit === purchaseUnit)
  if (conv && conv.qty > 0) return qty * parseFloat(conv.qty)
  // Common fallbacks
  const fallbacks = { kg:1000, L:1000, Galon:19000 }
  if (ing.unit==="gr" && fallbacks[purchaseUnit]) return qty * fallbacks[purchaseUnit]
  if (ing.unit==="ml" && fallbacks[purchaseUnit]) return qty * fallbacks[purchaseUnit]
  return qty
}

// Recalculate WAC for ingredient after receiving stock
async function recalcWAC(ing, qtyBase, totalCostForBatch) {
  const oldStock      = ing.stock || 0
  const oldCost       = ing.cost_per_unit || 0
  const oldTotalCost  = ing.total_purchase_cost || (oldStock * oldCost)
  const oldTotalStock = ing.total_purchased || oldStock

  const newTotalCost  = oldTotalCost + totalCostForBatch
  const newTotalStock = oldTotalStock + qtyBase
  const newWAC        = newTotalStock > 0 ? newTotalCost / newTotalStock : oldCost
  const newStock      = oldStock + qtyBase

  await supabase.from("ingredients").update({
    stock:               newStock,
    cost_per_unit:       newWAC,
    total_purchased:     newTotalStock,
    total_purchase_cost: newTotalCost,
  }).eq("id", ing.id)

  return newWAC
}

// Cascade: recalculate sub-recipe costs, then dish costs
async function cascadeRecalc(updatedIngIds) {
  // Get all recipes that use updated ingredients
  const { data: affectedRecipes } = await supabase
    .from("recipes")
    .select("*, recipe_lines(*)")
    .in("ingredient_id", updatedIngIds)

  // For each affected sub-recipe, recalculate its cost_per_unit
  const subIds = []
  for (const r of affectedRecipes || []) {
    if (r.type === "sub" || r.ingredient_id) {
      subIds.push(r.id)
    }
  }

  // Get all dish recipes that use affected subs — recalculate COGS
  if (subIds.length) {
    const { data: dishes } = await supabase
      .from("recipes")
      .select("product_id")
      .in("ingredient_id", subIds)
    // Trigger dish COGS recalc — handled in Recipes module
    console.log("Cascade: dishes to recalc", dishes?.map(d=>d.product_id))
  }
}

export default function InvPO() {
  const [pos,         setPOs]         = useState([])
  const [ingredients, setIngredients] = useState([])
  const [suppliers,   setSuppliers]   = useState([])
  const [filter,      setFilter]      = useState("all")
  const [modal,       setModal]       = useState(false)
  const [selected,    setSelected]    = useState(null)
  const [newPO,       setNewPO]       = useState(false)
  const [poForm,      setPOForm]      = useState({ supplier_id:"", invoice_no:"", order_date:new Date().toISOString().slice(0,10), due_date:"", notes:"" })
  const [poItems,     setPOItems]     = useState([{ ingredient_id:"", qty:"", unit:"gr", unit_cost:"" }])
  const [saving,      setSaving]      = useState(false)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data:p }, { data:i }, { data:s }] = await Promise.all([
      supabase.from("purchase_orders").select("*, po_items(*)").order("created_at", { ascending:false }),
      supabase.from("ingredients").select("*"),
      supabase.from("suppliers").select("*").eq("active", true),
    ])
    setPOs(p||[]); setIngredients(i||[]); setSuppliers(s||[])
    setLoading(false)
  }

  const unpaid  = pos.filter(p => p.status==="Unpaid")
  const paid    = pos.filter(p => p.status==="Paid")
  const overdue = pos.filter(p => p.status==="Unpaid" && p.due_date && new Date(p.due_date)<new Date())
  const voided  = pos.filter(p => p.status==="Void")

  const filtered = filter==="all" ? pos : filter==="unpaid" ? unpaid : filter==="paid" ? paid : filter==="overdue" ? overdue : voided

  function addPOItem()       { setPOItems(items => [...items, { ingredient_id:"", qty:"", unit:"gr", unit_cost:"" }]) }
  function removePOItem(i)   { setPOItems(items => items.filter((_,idx)=>idx!==i)) }
  function updatePOItem(i,k,v){
    setPOItems(items => items.map((x,idx) => {
      if (idx!==i) return x
      const updated = {...x,[k]:v}
      if (k==="ingredient_id") {
        const ing = ingredients.find(ing=>ing.id===v)
        if (ing) {
          updated.unit = ing.unit
          updated.unit_cost = String(ing.cost_per_unit||0)
        }
      }
      return updated
    }))
  }

  // Get available units for an ingredient (base + conversions)
  function getUnits(ingId) {
    const ing = ingredients.find(i=>i.id===ingId)
    if (!ing) return UNITS
    const extra = (ing.conversions||[]).map(c=>c.unit)
    return [ing.unit, ...extra.filter(u=>u!==ing.unit)]
  }

  const grandTotal = poItems.reduce((a,item) => a + (parseFloat(item.qty)||0)*(parseFloat(item.unit_cost)||0), 0)

  async function submitPO() {
    const sup = suppliers.find(s=>s.id===poForm.supplier_id)
    if (!sup) { alert("Select a supplier"); return }
    const validItems = poItems.filter(i=>i.ingredient_id&&parseFloat(i.qty)>0)
    if (!validItems.length) { alert("Add at least one item"); return }
    setSaving(true)
    const poNum = "PO-" + String(pos.length+1).padStart(3,"0")
    const { data:po } = await supabase.from("purchase_orders").insert({
      id:"PO-"+Date.now(), po_number:poNum,
      supplier_id:sup.id, supplier_name:sup.name,
      invoice_no:poForm.invoice_no||poNum,
      order_date:poForm.order_date, due_date:poForm.due_date||null,
      notes:poForm.notes||null, status:"Unpaid", total:grandTotal
    }).select().single()
    if (po) {
      const items = validItems.map(item => {
        const ing = ingredients.find(i=>i.id===item.ingredient_id)
        return {
          id:"POI-"+Date.now()+Math.random(), po_id:po.id,
          ingredient_id:item.ingredient_id, name:ing?.name||"",
          qty:parseFloat(item.qty), unit:item.unit,
          unit_cost:parseFloat(item.unit_cost)||0,
          total_cost:(parseFloat(item.qty)||0)*(parseFloat(item.unit_cost)||0)
        }
      })
      await supabase.from("po_items").insert(items)
    }
    await load()
    setNewPO(false)
    setPOForm({ supplier_id:"", invoice_no:"", order_date:new Date().toISOString().slice(0,10), due_date:"", notes:"" })
    setPOItems([{ ingredient_id:"", qty:"", unit:"gr", unit_cost:"" }])
    setSaving(false)
  }

  async function markPaid(po) {
    if (!confirm(`Mark ${po.po_number} as paid? Stock and WAC costs will be updated automatically.`)) return

    // Update each item — WAC calculation
    const updatedIngIds = []
    for (const item of po.po_items||[]) {
      const ing = ingredients.find(i=>i.id===item.ingredient_id)
      if (!ing) continue

      // Convert to base unit
      const qtyBase = toBaseUnit(ing, item.qty, item.unit)
      const costPerBase = item.unit_cost / (item.qty > 0 ? (qtyBase / item.qty) : 1)
      const totalCostForBatch = qtyBase * costPerBase

      // Recalculate WAC
      const newWAC = await recalcWAC(ing, qtyBase, totalCostForBatch)

      // Update last purchase info and conversion last_price
      const updatedConvs = (ing.conversions||[]).map(c => {
        if (c.unit === item.unit) return { ...c, last_price: item.unit_cost }
        return c
      })

      await supabase.from("ingredients").update({
        last_purchase_price: item.unit_cost,
        last_purchase_unit:  item.unit,
        conversions:         updatedConvs,
      }).eq("id", ing.id)

      // Log movement
      await supabase.from("stock_movements").insert({
        id:"MOV-"+Date.now()+Math.random(),
        type:"Purchase", ingredient_id:ing.id, ingredient_name:ing.name,
        qty:qtyBase, unit:ing.unit, ref:po.po_number,
        note:`Received: ${item.qty} ${item.unit} @ ${fmt(item.unit_cost)} → WAC: ${fmt(newWAC)}/${ing.unit}`,
        date:new Date().toISOString().slice(0,10),
        time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
      })

      updatedIngIds.push(ing.id)
    }

    // Mark PO as paid
    await supabase.from("purchase_orders").update({
      status:"Paid",
      payment_date:new Date().toISOString().slice(0,10)
    }).eq("id", po.id)

    // Cascade recalculate recipes
    if (updatedIngIds.length) await cascadeRecalc(updatedIngIds)

    await load()
    setModal(false)
    alert(`✅ ${po.po_number} marked as paid. Stock updated with WAC calculation.`)
  }

  async function voidPO(po) {
    if (!confirm(`Void ${po.po_number}?`)) return
    await supabase.from("purchase_orders").update({ status:"Void" }).eq("id", po.id)
    await load()
  }

  return (
    <div>
      <div className="bo-metrics" style={{ gridTemplateColumns:"repeat(4,1fr)", marginBottom:16 }}>
        <div className="bo-met blue"><div className="bo-met-label">Total Invoices</div><div className="bo-met-val">{pos.length}</div></div>
        <div className="bo-met amber"><div className="bo-met-label">Unpaid</div><div className="bo-met-val">{fmt(unpaid.reduce((a,p)=>a+(p.total||0),0))}</div><div className="bo-met-sub">{unpaid.length} invoices</div></div>
        <div className="bo-met green"><div className="bo-met-label">Paid</div><div className="bo-met-val">{fmt(paid.reduce((a,p)=>a+(p.total||0),0))}</div><div className="bo-met-sub">{paid.length} invoices</div></div>
        <div className="bo-met red"><div className="bo-met-label">Overdue</div><div className="bo-met-val">{overdue.length}</div><div className="bo-met-sub">past due date</div></div>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {[["all",`All (${pos.length})`],["unpaid",`Unpaid (${unpaid.length})`],["paid",`Paid (${paid.length})`],["overdue",`Overdue (${overdue.length})`],["voided",`Voided (${voided.length})`]].map(([f,l])=>(
            <button key={f} onClick={()=>setFilter(f)} className={"bo-btn bo-btn-sm "+(filter===f?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
          ))}
        </div>
        <button onClick={()=>setNewPO(true)} className="bo-btn bo-btn-primary" style={{ marginLeft:"auto" }}>+ New Purchase Order</button>
      </div>

      <div className="bo-card" style={{ padding:0, overflow:"hidden" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
          <table className="bo-table">
            <thead><tr><th>PO #</th><th>Invoice</th><th>Supplier</th><th>Date</th><th>Due</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(po => {
                const isOverdue = po.status==="Unpaid" && po.due_date && new Date(po.due_date)<new Date()
                const statusColor = po.status==="Paid" ? "var(--green)" : isOverdue ? "var(--red)" : "var(--amber)"
                return (
                  <tr key={po.id}>
                    <td style={{ fontWeight:700 }}>{po.po_number}</td>
                    <td style={{ fontSize:12, color:"var(--ink4)" }}>{po.invoice_no}</td>
                    <td style={{ fontWeight:600 }}>{po.supplier_name}</td>
                    <td style={{ fontSize:12 }}>{po.order_date}</td>
                    <td style={{ fontSize:12, color:isOverdue?"var(--red)":"var(--ink4)" }}>{po.due_date||"—"}{isOverdue?" ⚠":""}</td>
                    <td style={{ fontWeight:700, color:"var(--brand)" }}>{fmt(po.total)}</td>
                    <td><span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10, background:statusColor+"22", color:statusColor }}>{isOverdue?"Overdue":po.status}</span></td>
                    <td>
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={()=>{setSelected(po);setModal(true)}} className="bo-btn bo-btn-ghost bo-btn-sm">View</button>
                        {po.status==="Unpaid" && <button onClick={()=>markPaid(po)} className="bo-btn bo-btn-sm" style={{ background:"var(--green-lt)", color:"var(--green)", border:"none", cursor:"pointer", borderRadius:"var(--r)", padding:"5px 11px", fontSize:12, fontWeight:600 }}>✓ Mark Paid</button>}
                        {po.status!=="Void" && <button onClick={()=>voidPO(po)} className="bo-btn bo-btn-danger bo-btn-sm">Void</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length===0 && <tr><td colSpan={8} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No purchase orders</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* View PO Modal */}
      {modal && selected && (
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="bo-modal" style={{ maxWidth:600 }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">{selected.po_number}</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>{selected.invoice_no} · {selected.supplier_name}</div>
              </div>
              <button className="bo-modal-close" onClick={()=>setModal(false)}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                <div><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>Order Date</div><div style={{ fontWeight:600 }}>{selected.order_date}</div></div>
                <div><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>Due Date</div><div style={{ fontWeight:600 }}>{selected.due_date||"—"}</div></div>
              </div>
              <table className="bo-table">
                <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Unit Cost</th><th>Total</th></tr></thead>
                <tbody>
                  {(selected.po_items||[]).map((item,i) => {
                    const ing = ingredients.find(x=>x.id===item.ingredient_id)
                    const qtyBase = ing ? toBaseUnit(ing, item.qty, item.unit) : item.qty
                    const costPerBase = item.unit_cost && item.qty ? item.unit_cost / item.qty : 0
                    return (
                      <tr key={i}>
                        <td>
                          <div>{item.name}</div>
                          {ing && item.unit !== ing.unit && (
                            <div style={{ fontSize:10, color:"var(--ink5)" }}>{qtyBase.toFixed(1)} {ing.unit} @ {fmt(costPerBase)}/{ing.unit}</div>
                          )}
                        </td>
                        <td>{item.qty}</td>
                        <td>{item.unit}</td>
                        <td>{fmt(item.unit_cost)}</td>
                        <td style={{ fontWeight:700, color:"var(--brand)" }}>{fmt(item.total_cost)}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ background:"var(--surface)" }}>
                    <td colSpan={4} style={{ fontWeight:700 }}>Total</td>
                    <td style={{ fontWeight:900, fontSize:15, color:"var(--brand)" }}>{fmt(selected.total)}</td>
                  </tr>
                </tbody>
              </table>
              {selected.notes && <div style={{ marginTop:12, padding:10, background:"var(--surface)", borderRadius:"var(--r)", fontSize:13 }}>{selected.notes}</div>}
              <div style={{ marginTop:12, padding:"10px 14px", background:selected.status==="Paid"?"var(--green-lt)":"var(--amber-lt)", borderRadius:"var(--r)", fontSize:12, fontWeight:700, color:selected.status==="Paid"?"var(--green)":"var(--amber)" }}>
                {selected.status==="Paid" ? `✅ Paid on ${selected.payment_date} — WAC updated` : "⏳ Payment pending"}
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setModal(false)} className="bo-btn bo-btn-ghost">Close</button>
              {selected.status==="Unpaid" && <button onClick={()=>{markPaid(selected)}} className="bo-btn bo-btn-primary">✓ Mark as Paid & Update WAC</button>}
            </div>
          </div>
        </div>
      )}

      {/* New PO Modal */}
      {newPO && (
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&setNewPO(false)}>
          <div className="bo-modal" style={{ maxWidth:700, maxHeight:"94vh" }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">New Purchase Order</div>
              <button className="bo-modal-close" onClick={()=>setNewPO(false)}>✕</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Supplier *</label>
                  <select value={poForm.supplier_id} onChange={e=>setPOForm(f=>({...f,supplier_id:e.target.value}))} className="bo-select">
                    <option value="">— Select supplier —</option>
                    {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div><label className="bo-label">Invoice No.</label><input value={poForm.invoice_no} onChange={e=>setPOForm(f=>({...f,invoice_no:e.target.value}))} className="bo-input" placeholder="INV/001" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Order Date</label><input type="date" value={poForm.order_date} onChange={e=>setPOForm(f=>({...f,order_date:e.target.value}))} className="bo-input" /></div>
                <div><label className="bo-label">Due Date</label><input type="date" value={poForm.due_date} onChange={e=>setPOForm(f=>({...f,due_date:e.target.value}))} className="bo-input" /></div>
              </div>

              <div style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <label className="bo-label" style={{ marginBottom:0 }}>Items *</label>
                  <button onClick={addPOItem} className="bo-btn bo-btn-ghost bo-btn-sm">+ Add Item</button>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"2fr 80px 100px 130px 36px", gap:6, marginBottom:6 }}>
                  {["INGREDIENT","QTY","UNIT","UNIT COST",""].map((h,i)=><div key={i} style={{ fontSize:10, fontWeight:700, color:"var(--ink4)" }}>{h}</div>)}
                </div>
                {poItems.map((item,i) => (
                  <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 80px 100px 130px 36px", gap:6, marginBottom:8 }}>
                    <select value={item.ingredient_id} onChange={e=>updatePOItem(i,"ingredient_id",e.target.value)} className="bo-select">
                      <option value="">— Select —</option>
                      {ingredients.map(ing=><option key={ing.id} value={ing.id}>{ing.name}</option>)}
                    </select>
                    <input type="number" value={item.qty} onChange={e=>updatePOItem(i,"qty",e.target.value)} className="bo-input" placeholder="0" />
                    <select value={item.unit} onChange={e=>updatePOItem(i,"unit",e.target.value)} className="bo-select">
                      {getUnits(item.ingredient_id).map(u=><option key={u}>{u}</option>)}
                    </select>
                    <input type="number" value={item.unit_cost} onChange={e=>updatePOItem(i,"unit_cost",e.target.value)} className="bo-input" placeholder="Price/unit" />
                    <button onClick={()=>removePOItem(i)} className="bo-btn bo-btn-danger bo-btn-sm" style={{ padding:"0 10px" }}>✕</button>
                  </div>
                ))}
                <div style={{ display:"flex", justifyContent:"space-between", padding:"12px 16px", background:"var(--surface)", borderRadius:"var(--r)", marginTop:8 }}>
                  <span style={{ fontWeight:700 }}>Grand Total</span>
                  <span style={{ fontSize:18, fontWeight:900, color:"var(--brand)" }}>{fmt(grandTotal)}</span>
                </div>
              </div>

              <div className="bo-form-row">
                <label className="bo-label">Notes</label>
                <textarea value={poForm.notes} onChange={e=>setPOForm(f=>({...f,notes:e.target.value}))} className="bo-input" rows={2} />
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setNewPO(false)} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={submitPO} disabled={saving} className="bo-btn bo-btn-primary">{saving?"Creating...":"Create Purchase Order"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
