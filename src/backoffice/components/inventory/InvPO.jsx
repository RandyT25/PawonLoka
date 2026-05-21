export default function InvPO() {
  const [pos,         setPOs]         = useState([])
  const [ingredients, setIngredients] = useState([])
  const [suppliers,   setSuppliers]   = useState([])
  const [filter,      setFilter]      = useState("all")
  const [viewModal,   setViewModal]   = useState(null)
  const [editModal,   setEditModal]   = useState(null)
  const [newPO,       setNewPO]       = useState(false)
  const [selected,    setSelected]    = useState(new Set())
  const [poForm,      setPOForm]      = useState({ supplier_id:"", invoice_no:"", order_date:new Date().toISOString().slice(0,10), due_date:"", notes:"" })
  const [poItems,     setPOItems]     = useState([{ ingredient_id:"", qty:"", unit:"gr", unit_cost:"" }])
  const [saving,      setSaving]      = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data:p }, { data:i }, { data:s }] = await Promise.all([
      supabase.from("purchase_orders").select("*").order("created_at", { ascending:false }),
      supabase.from("ingredients").select("*"),
      supabase.from("suppliers").select("*").eq("active", true),
    ])
    const posNorm = (p||[]).map(po => ({
      ...po,
      po_number:     po.id,
      supplier_name: po.supplierName || po.supplier_name || "",
      supplier_id:   po.supplierId   || po.supplier_id   || "",
      invoice_no:    po.invoiceNo    || po.invoice_no    || "",
      order_date:    po.date         || po.order_date    || "",
      due_date:      po.dueDate      || po.due_date      || "",
      po_items:      po.items        || po.po_items      || [],
    }))
    setPOs(posNorm); setIngredients(i||[]); setSuppliers(s||[])
    setLoading(false)
  }

  const unpaid  = pos.filter(p => p.status==="Unpaid")
  const paid    = pos.filter(p => p.status==="Paid")
  const overdue = pos.filter(p => p.status==="Unpaid" && p.due_date && new Date(p.due_date)<new Date())
  const voided  = pos.filter(p => p.status==="Void")
  const filtered = filter==="all" ? pos : filter==="unpaid" ? unpaid : filter==="paid" ? paid : filter==="overdue" ? overdue : voided

  // Selection helpers
  const selectedUnpaid = [...selected].filter(id => pos.find(p=>p.id===id&&p.status==="Unpaid"))
  const allFilteredUnpaid = filtered.filter(p=>p.status==="Unpaid")
  const allUnpaidSelected = allFilteredUnpaid.length > 0 && allFilteredUnpaid.every(p=>selected.has(p.id))

  function toggleSelect(id) {
    setSelected(prev => { const s=new Set(prev); s.has(id)?s.delete(id):s.add(id); return s })
  }
  function toggleSelectAll() {
    if (allUnpaidSelected) setSelected(prev => { const s=new Set(prev); allFilteredUnpaid.forEach(p=>s.delete(p.id)); return s })
    else setSelected(prev => { const s=new Set(prev); allFilteredUnpaid.forEach(p=>s.add(p.id)); return s })
  }

  async function bulkMarkPaid() {
    const targets = pos.filter(p => selected.has(p.id) && p.status==="Unpaid")
    if (!targets.length) return
    if (!confirm(`Mark ${targets.length} PO(s) as paid?`)) return
    setBulkLoading(true)
    const { data: freshIngs } = await supabase.from("ingredients").select("*")
    const ingMap = {}
    for (const i of freshIngs||[]) ingMap[i.id] = i
    const allUpdatedIds = []
    for (const po of targets) {
      const ids = await processPaidPO(po, ingMap)
      allUpdatedIds.push(...ids)
    }
    if (allUpdatedIds.length) await cascadeRecalc([...new Set(allUpdatedIds)])
    setSelected(new Set())
    await load()
    setBulkLoading(false)
    alert(`✅ ${targets.length} PO(s) marked paid. WAC + COGS updated.`)
  }

  async function bulkVoid() {
    const targets = pos.filter(p => selected.has(p.id) && p.status==="Unpaid")
    if (!targets.length) return
    if (!confirm(`Void ${targets.length} PO(s)?`)) return
    setBulkLoading(true)
    for (const po of targets) {
      await supabase.from("purchase_orders").update({ status:"Void" }).eq("id", po.id)
    }
    setSelected(new Set())
    await load()
    setBulkLoading(false)
  }

  async function markPaid(po) {
    if (!confirm(`Mark ${po.po_number} as paid?`)) return
    const { data: freshIngs } = await supabase.from("ingredients").select("*")
    const ingMap = {}
    for (const i of freshIngs||[]) ingMap[i.id] = i
    const updatedIds = await processPaidPO(po, ingMap)
    if (updatedIds.length) await cascadeRecalc(updatedIds)
    await load(); setViewModal(null)
    alert(`✅ ${po.po_number} paid. WAC + COGS updated.`)
  }

  async function voidPO(po) {
    if (!confirm(`Void ${po.po_number}?`)) return
    await supabase.from("purchase_orders").update({ status:"Void" }).eq("id", po.id)
    await load(); setViewModal(null)
  }

  async function deletePO(po) {
    if (!confirm(`Delete ${po.po_number}? This cannot be undone.`)) return
    await supabase.from("purchase_orders").delete().eq("id", po.id)
    await load(); setViewModal(null)
  }

  function addPOItem()        { setPOItems(items => [...items, { ingredient_id:"", qty:"", unit:"gr", unit_cost:"" }]) }
  function removePOItem(i)    { setPOItems(items => items.filter((_,idx)=>idx!==i)) }
  function updatePOItem(i,k,v){
    setPOItems(items => items.map((x,idx) => {
      if (idx!==i) return x
      const updated = {...x,[k]:v}
      if (k==="ingredient_id") {
        const ing = ingredients.find(ing=>ing.id===v)
        if (ing) { updated.unit=ing.unit; updated.unit_cost=String(ing.cost_per_unit||0) }
      }
      return updated
    }))
  }
  function getUnits(ingId) {
    const ing = ingredients.find(i=>i.id===ingId)
    if (!ing) return UNITS
    return [ing.unit, ...(ing.conversions||[]).map(c=>c.unit).filter(u=>u!==ing.unit)]
  }
  const grandTotal = poItems.reduce((a,item) => a+(parseFloat(item.qty)||0)*(parseFloat(item.unit_cost)||0), 0)

  async function submitPO(isEdit=false) {
    const sup = suppliers.find(s=>s.id===poForm.supplier_id)
    if (!sup) { alert("Select a supplier"); return }
    const validItems = poItems.filter(i=>i.ingredient_id&&parseFloat(i.qty)>0)
    if (!validItems.length) { alert("Add at least one item"); return }
    setSaving(true)
    const poItems_json = validItems.map(item => {
      const ing = ingredients.find(i=>i.id===item.ingredient_id)
      return { ingredient_id:item.ingredient_id, name:ing?.name||"", qty:parseFloat(item.qty), unit:item.unit, unit_cost:parseFloat(item.unit_cost)||0, total_cost:(parseFloat(item.qty)||0)*(parseFloat(item.unit_cost)||0) }
    })
    const payload = {
      supplierId:sup.id, supplierName:sup.name,
      invoiceNo:poForm.invoice_no, date:poForm.order_date,
      dueDate:poForm.due_date||null, notes:poForm.notes||null,
      status:"Unpaid", subtotal:grandTotal, total:grandTotal, items:poItems_json
    }
    if (isEdit) {
      await supabase.from("purchase_orders").update(payload).eq("id", editModal.id)
    } else {
      await supabase.from("purchase_orders").insert({ id:"PO-"+Date.now(), ...payload })
    }
    await load()
    setNewPO(false); setEditModal(null)
    setPOForm({ supplier_id:"", invoice_no:"", order_date:new Date().toISOString().slice(0,10), due_date:"", notes:"" })
    setPOItems([{ ingredient_id:"", qty:"", unit:"gr", unit_cost:"" }])
    setSaving(false)
  }

  function openEdit(po) {
    setPOForm({ supplier_id:po.supplier_id||po.supplierId||"", invoice_no:po.invoice_no||"", order_date:po.order_date||po.date||"", due_date:po.due_date||po.dueDate||"", notes:po.notes||"" })
    setPOItems((po.po_items||[]).map(i=>({ ingredient_id:i.ingredient_id, qty:String(i.qty), unit:i.unit, unit_cost:String(i.unit_cost) })))
    setEditModal(po)
  }

  const POFormModal = ({ title, onSubmit, onClose }) => (
    <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="bo-modal" style={{ maxWidth:700, maxHeight:"94vh" }}>
        <div className="bo-modal-header">
          <div className="bo-modal-title">{title}</div>
          <button className="bo-modal-close" onClick={onClose}>✕</button>
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
          <div className="bo-form-row"><label className="bo-label">Notes</label><textarea value={poForm.notes} onChange={e=>setPOForm(f=>({...f,notes:e.target.value}))} className="bo-input" rows={2} /></div>
        </div>
        <div className="bo-modal-footer">
          <button onClick={onClose} className="bo-btn bo-btn-ghost">Cancel</button>
          <button onClick={onSubmit} disabled={saving} className="bo-btn bo-btn-primary">{saving?"Saving...":title}</button>
        </div>
      </div>
    </div>
  )

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
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          {selectedUnpaid.length > 0 && (
            <>
              <span style={{ fontSize:12, color:"var(--ink4)", display:"flex", alignItems:"center" }}>{selectedUnpaid.length} selected</span>
              <button onClick={bulkMarkPaid} disabled={bulkLoading} className="bo-btn bo-btn-sm" style={{ background:"var(--green-lt)", color:"var(--green)", border:"none", cursor:"pointer", borderRadius:"var(--r)", padding:"5px 11px", fontSize:12, fontWeight:600 }}>
                {bulkLoading?"Processing...":"✓ Pay Selected"}
              </button>
              <button onClick={bulkVoid} disabled={bulkLoading} className="bo-btn bo-btn-danger bo-btn-sm">Void Selected</button>
            </>
          )}
          <button onClick={()=>setNewPO(true)} className="bo-btn bo-btn-primary">+ New PO</button>
        </div>
      </div>

      <div className="bo-card" style={{ padding:0, overflow:"hidden" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
          <table className="bo-table">
            <thead>
              <tr>
                <th style={{ width:36 }}>
                  <input type="checkbox" checked={allUnpaidSelected} onChange={toggleSelectAll}
                    style={{ width:15, height:15, accentColor:"var(--brand)", cursor:"pointer" }} />
                </th>
                <th>PO #</th><th>Invoice</th><th>Supplier</th><th>Date</th><th>Due</th><th>Total</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(po => {
                const isOverdue = po.status==="Unpaid" && po.due_date && new Date(po.due_date)<new Date()
                const statusColor = po.status==="Paid" ? "var(--green)" : po.status==="Void" ? "var(--ink5)" : isOverdue ? "var(--red)" : "var(--amber)"
                const isUnpaid = po.status==="Unpaid"
                return (
                  <tr key={po.id} style={{ background:selected.has(po.id)?"var(--brand-lt)":"" }}>
                    <td>
                      {isUnpaid && <input type="checkbox" checked={selected.has(po.id)} onChange={()=>toggleSelect(po.id)}
                        style={{ width:15, height:15, accentColor:"var(--brand)", cursor:"pointer" }} />}
                    </td>
                    <td style={{ fontWeight:700, fontFamily:"monospace", fontSize:12 }}>{po.id}</td>
                    <td style={{ fontSize:12, color:"var(--ink4)" }}>{po.invoice_no||"—"}</td>
                    <td style={{ fontWeight:600 }}>{po.supplier_name}</td>
                    <td style={{ fontSize:12 }}>{po.order_date||po.date}</td>
                    <td style={{ fontSize:12, color:isOverdue?"var(--red)":"var(--ink4)" }}>{po.due_date||po.dueDate||"—"}{isOverdue?" ⚠":""}</td>
                    <td style={{ fontWeight:700, color:"var(--brand)" }}>{fmt(po.total)}</td>
                    <td><span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10, background:statusColor+"22", color:statusColor }}>{isOverdue?"Overdue":po.status}</span></td>
                    <td>
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={()=>setViewModal(po)} className="bo-btn bo-btn-ghost bo-btn-sm">View</button>
                        {isUnpaid && <button onClick={()=>openEdit(po)} className="bo-btn bo-btn-ghost bo-btn-sm">Edit</button>}
                        {isUnpaid && <button onClick={()=>markPaid(po)} className="bo-btn bo-btn-sm" style={{ background:"var(--green-lt)", color:"var(--green)", border:"none", cursor:"pointer", borderRadius:"var(--r)", padding:"5px 11px", fontSize:12, fontWeight:600 }}>✓ Pay</button>}
                        {isUnpaid && <button onClick={()=>deletePO(po)} className="bo-btn bo-btn-danger bo-btn-sm">Delete</button>}
                        {isUnpaid && <button onClick={()=>voidPO(po)} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ color:"var(--ink4)" }}>Void</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length===0 && <tr><td colSpan={9} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No purchase orders</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* View Modal */}
      {viewModal && (
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&setViewModal(null)}>
          <div className="bo-modal" style={{ maxWidth:600 }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">{viewModal.id}</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>{viewModal.invoice_no||viewModal.invoiceNo} · {viewModal.supplier_name||viewModal.supplierName}</div>
              </div>
              <button className="bo-modal-close" onClick={()=>setViewModal(null)}>✕</button>
            </div>
            <div className="bo-modal-body">
              <table className="bo-table">
                <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Unit Cost</th><th>Total</th></tr></thead>
                <tbody>
                  {(viewModal.po_items||viewModal.items||[]).map((item,i) => (
                    <tr key={i}>
                      <td>{item.name}</td><td>{item.qty}</td><td>{item.unit}</td>
                      <td>{fmt(item.unit_cost)}</td>
                      <td style={{ fontWeight:700, color:"var(--brand)" }}>{fmt(item.total_cost)}</td>
                    </tr>
                  ))}
                  <tr style={{ background:"var(--surface)" }}>
                    <td colSpan={4} style={{ fontWeight:700 }}>Total</td>
                    <td style={{ fontWeight:900, fontSize:15, color:"var(--brand)" }}>{fmt(viewModal.total)}</td>
                  </tr>
                </tbody>
              </table>
              {viewModal.notes && <div style={{ marginTop:12, padding:10, background:"var(--surface)", borderRadius:"var(--r)", fontSize:13 }}>{viewModal.notes}</div>}
              <div style={{ marginTop:12, padding:"10px 14px", background:viewModal.status==="Paid"?"var(--green-lt)":"var(--amber-lt)", borderRadius:"var(--r)", fontSize:12, fontWeight:700, color:viewModal.status==="Paid"?"var(--green)":"var(--amber)" }}>
                {viewModal.status==="Paid" ? "✅ Paid — WAC + COGS updated" : "⏳ Payment pending"}
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setViewModal(null)} className="bo-btn bo-btn-ghost">Close</button>
              {viewModal.status==="Unpaid" && <>
                <button onClick={()=>{setViewModal(null);openEdit(viewModal)}} className="bo-btn bo-btn-ghost">Edit</button>
                <button onClick={()=>deletePO(viewModal)} className="bo-btn bo-btn-danger">Delete</button>
                <button onClick={()=>markPaid(viewModal)} className="bo-btn bo-btn-primary">✓ Mark as Paid</button>
              </>}
            </div>
          </div>
        </div>
      )}

      {newPO && <POFormModal title="Create Purchase Order" onSubmit={()=>submitPO(false)} onClose={()=>{setNewPO(false);setPOItems([{ingredient_id:"",qty:"",unit:"gr",unit_cost:""}])}} />}
      {editModal && <POFormModal title="Save Changes" onSubmit={()=>submitPO(true)} onClose={()=>{setEditModal(null);setPOItems([{ingredient_id:"",qty:"",unit:"gr",unit_cost:""}])}} />}
    </div>
  )
}
