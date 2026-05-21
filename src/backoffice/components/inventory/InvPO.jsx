import { useState, useEffect } from "react"
import { supabase } from "../../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }
const UNITS = ["gr","kg","ml","L","Galon","pcs","Ekor","butir","biji","buah","ikat","lembar","bungkus","pack","sachet","botol","tsp","tbsp","cup","porsi","portion"]

function toBaseUnit(ing, qty, purchaseUnit) {
  if (purchaseUnit === ing.unit) return qty
  const conv = (ing.conversions||[]).find(c => c.unit === purchaseUnit)
  if (conv && parseFloat(conv.qty) > 0) return qty * parseFloat(conv.qty)
  const fallbacks = { kg:1000, L:1000, Galon:19000 }
  if (ing.unit==="gr" && fallbacks[purchaseUnit]) return qty * fallbacks[purchaseUnit]
  if (ing.unit==="ml" && fallbacks[purchaseUnit]) return qty * fallbacks[purchaseUnit]
  return qty
}

async function recalcWAC(ing, qtyBase, totalCostForBatch) {
  const oldStock     = parseFloat(ing.stock) || 0
  const oldCost      = parseFloat(ing.cost_per_unit) || 0
  const newTotalCost = (oldStock * oldCost) + totalCostForBatch
  const newStock     = oldStock + qtyBase
  const newWAC       = newStock > 0 ? newTotalCost / newStock : oldCost
  await supabase.from("ingredients").update({
    stock:         newStock,
    cost_per_unit: newWAC,
  }).eq("id", ing.id)
  return newWAC
}

// Full cascade: ingredient WAC updated → recalc sub-recipes → recalc dishes
async function cascadeRecalc(updatedIngIds) {
  if (!updatedIngIds.length) return

  // 1. Get all recipe_lines that use updated ingredients
  const { data: affectedLines } = await supabase
    .from("recipe_lines")
    .select("recipe_id, ingredient_id, qty, unit")
    .in("ingredient_id", updatedIngIds)

  if (!affectedLines || !affectedLines.length) return

  // Unique recipe IDs affected
  const affectedRecipeIds = [...new Set(affectedLines.map(l => l.recipe_id))]

  // 2. For each affected recipe, recalculate its total cost
  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, type, product_id, ingredient_id, yield_qty")
    .in("id", affectedRecipeIds)

  if (!recipes || !recipes.length) return

  // Get fresh ingredient costs
  const { data: allIngs } = await supabase
    .from("ingredients")
    .select("id, cost_per_unit, unit, conversions")

  const ingMap = {}
  for (const i of allIngs || []) ingMap[i.id] = i

  // Get all lines for these recipes
  const { data: allLines } = await supabase
    .from("recipe_lines")
    .select("*")
    .in("recipe_id", affectedRecipeIds)

  const linesByRecipe = {}
  for (const l of allLines || []) {
    if (!linesByRecipe[l.recipe_id]) linesByRecipe[l.recipe_id] = []
    linesByRecipe[l.recipe_id].push(l)
  }

  const updatedSubIngIds = []

  for (const recipe of recipes) {
    const lines = linesByRecipe[recipe.id] || []
    let totalCost = 0

    for (const line of lines) {
      const ing = ingMap[line.ingredient_id]
      if (!ing) continue
      // Convert line qty to base unit
      let qtyInBase = parseFloat(line.qty) || 0
      if (line.unit && line.unit !== ing.unit) {
        const conv = (ing.conversions||[]).find(c => c.unit === line.unit)
        if (conv && parseFloat(conv.qty) > 0) {
          qtyInBase = qtyInBase * parseFloat(conv.qty)
        }
      }
      totalCost += qtyInBase * (ing.cost_per_unit || 0)
    }

    if (recipe.type === "sub" && recipe.ingredient_id) {
      // Sub-recipe: update the ingredient's cost_per_unit (cost per yield unit)
      const yieldQty = parseFloat(recipe.yield_qty) || 1
      const costPerYield = totalCost / yieldQty
      await supabase.from("ingredients")
        .update({ cost_per_unit: costPerYield })
        .eq("id", recipe.ingredient_id)
      ingMap[recipe.ingredient_id] = { ...ingMap[recipe.ingredient_id], cost_per_unit: costPerYield }
      updatedSubIngIds.push(recipe.ingredient_id)
    } else if (recipe.type === "dish" && recipe.product_id) {
      // Dish: update product COGS and margin
      const { data: product } = await supabase
        .from("products")
        .select("price")
        .eq("id", recipe.product_id)
        .single()
      const price = product?.price || 0
      const margin = price > 0 ? Math.round(((price - totalCost) / price) * 100) : 0
      await supabase.from("products")
        .update({ cogs: Math.round(totalCost), margin })
        .eq("id", recipe.product_id)
    }
  }

  // 3. If sub-recipes updated, cascade into dishes that use those sub-ingredients
  if (updatedSubIngIds.length) {
    await cascadeRecalc(updatedSubIngIds)
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

  function addPOItem()        { setPOItems(items => [...items, { ingredient_id:"", qty:"", unit:"gr", unit_cost:"" }]) }
  function removePOItem(i)    { setPOItems(items => items.filter((_,idx)=>idx!==i)) }
  function updatePOItem(i,k,v){
    setPOItems(items => items.map((x,idx) => {
      if (idx!==i) return x
      const updated = {...x,[k]:v}
      if (k==="ingredient_id") {
        const ing = ingredients.find(ing=>ing.id===v)
        if (ing) { updated.unit = ing.unit; updated.unit_cost = String(ing.cost_per_unit||0) }
      }
      return updated
    }))
  }

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

    // Reload fresh ingredient data before WAC calc
    const { data: freshIngs } = await supabase.from("ingredients").select("*")
    const ingMap = {}
    for (const i of freshIngs||[]) ingMap[i.id] = i

    const updatedIngIds = []

    for (const item of po.po_items||[]) {
      const ing = ingMap[item.ingredient_id]
      if (!ing) continue

      const qtyBase        = toBaseUnit(ing, parseFloat(item.qty), item.unit)
      const ratePerPurchase = parseFloat(item.unit_cost) || 0
      // cost per base unit = purchase cost / qty_in_base
      const costPerBase    = qtyBase > 0 ? ratePerPurchase / (qtyBase / parseFloat(item.qty)) * parseFloat(item.qty) / qtyBase : 0
      const totalCostBatch = qtyBase * costPerBase

      const newWAC = await recalcWAC(ing, qtyBase, totalCostBatch)

      // Update last purchase info + conversion last_price
      const updatedConvs = (ing.conversions||[]).map(c =>
        c.unit === item.unit ? { ...c, last_price: item.unit_cost } : c
      )
      await supabase.from("ingredients").update({
        last_purchase_price: item.unit_cost,
        last_purchase_unit:  item.unit,
        conversions:         updatedConvs,
      }).eq("id", ing.id)

      // Update local map so recalcWAC uses fresh stock for next item
      ingMap[ing.id] = { ...ing, stock: (ing.stock||0) + qtyBase, cost_per_unit: newWAC }

      // Log to stock_movements
      await supabase.from("stock_movements").insert({
        id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
        type:"Purchase", ingredient_id:ing.id, ingredient_name:ing.name,
        qty:qtyBase, unit:ing.unit, ref:po.po_number,
        note:`Received: ${item.qty} ${item.unit} @ ${fmt(item.unit_cost)} → WAC: ${fmt(newWAC)}/${ing.unit}`,
        date:new Date().toISOString().slice(0,10),
        time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
      })

      updatedIngIds.push(ing.id)
    }

    await supabase.from("purchase_orders").update({
      status:"Paid",
      payment_date:new Date().toISOString().slice(0,10)
    }).eq("id", po.id)

    // Full cascade: sub-recipes → dishes → product COGS
    if (updatedIngIds.length) await cascadeRecalc(updatedIngIds)

    await load()
    setModal(false)
    alert(`✅ ${po.po_number} paid. WAC updated → COGS recalculated.`)
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
                        {po.status!=="Void" && po.status!=="Paid" && <button onClick={()=>voidPO(po)} className="bo-btn bo-btn-danger bo-btn-sm">Void</button>}
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
                    return (
                      <tr key={i}>
                        <td>
                          <div>{item.name}</div>
                          {ing && item.unit !== ing.unit && (
                            <div style={{ fontSize:10, color:"var(--ink5)" }}>= {qtyBase.toFixed(1)} {ing.unit}</div>
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
                {selected.status==="Paid" ? `✅ Paid on ${selected.payment_date} — WAC + COGS updated` : "⏳ Payment pending"}
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setModal(false)} className="bo-btn bo-btn-ghost">Close</button>
              {selected.status==="Unpaid" && <button onClick={()=>markPaid(selected)} className="bo-btn bo-btn-primary">✓ Mark as Paid & Update WAC</button>}
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
