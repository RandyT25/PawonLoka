import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }
const ASSET_CATEGORIES = ["Kitchen Equipment","Appliances","Furniture","Tableware & Serveware","Decor","Seasonal Decorations","Electronics","Vehicle","Renovation/Fixtures","Other"]
const CAT_COLORS = {
  "Kitchen Equipment":"var(--brand)", "Appliances":"#00B8D9", "Furniture":"var(--amber)",
  "Tableware & Serveware":"#36B37E", "Decor":"#FF7452", "Seasonal Decorations":"#DE350B",
  "Electronics":"#6554C0", "Vehicle":"var(--green)", "Renovation/Fixtures":"#8777D9", "Other":"var(--ink5)",
}
const EMPTY = { name:"", category:"", qty:1, unit_price:"", acquired_date:new Date().toISOString().slice(0,10), notes:"" }

function emptyBulkRow() { return { name:"", category:"", qty:1, unit_price:"", acquired_date:new Date().toISOString().slice(0,10) } }

export default function Assets() {
  const [assets,  setAssets]  = useState([])
  const [modal,   setModal]   = useState(null)
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [loading, setLoading] = useState(true)
  const [bulkModal,  setBulkModal]  = useState(false)
  const [bulkRows,   setBulkRows]   = useState([])
  const [bulkSaving, setBulkSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from("assets").select("*").order("acquired_date", { ascending:false })
    setAssets(data||[])
    setLoading(false)
  }

  function openAdd()   { setForm(EMPTY); setModal("add") }
  function openEdit(a) {
    // Records added before qty/unit_price existed have qty=1, unit_price=0 by column
    // default even though `amount` is real — back-fill unit_price from amount so editing
    // an old record doesn't silently zero it out the moment it's saved again.
    const qty = a.qty || 1
    const unit_price = a.unit_price || (qty > 0 ? (a.amount||0) / qty : 0)
    setForm({ ...a, qty, unit_price })
    setModal("edit")
  }
  function closeModal(){ setModal(null); setForm(EMPTY) }

  const formAmount = (parseFloat(form.qty)||0) * (parseFloat(form.unit_price)||0)

  async function save() {
    if (!form.name || !form.category || !form.unit_price) return
    setSaving(true)
    const qty = parseFloat(form.qty)||1
    const unit_price = parseFloat(form.unit_price)||0
    const payload = {
      name:form.name.trim(), category:form.category,
      qty, unit_price, amount: qty * unit_price,
      acquired_date:form.acquired_date||new Date().toISOString().slice(0,10),
      notes:form.notes||null, updated_at:new Date().toISOString(),
    }
    if (modal==="add") await supabase.from("assets").insert(payload)
    else await supabase.from("assets").update(payload).eq("id", form.id)
    await load(); closeModal(); setSaving(false)
  }

  async function deleteAsset(id) {
    if (!confirm("Delete this asset record?")) return
    await supabase.from("assets").delete().eq("id", id)
    setAssets(prev => prev.filter(a => a.id !== id))
  }

  // Bulk add — same pattern as InvIngredients.jsx's Bulk Add: N editable rows, one batched insert
  function openBulk()           { setBulkRows(Array.from({length:5}, emptyBulkRow)); setBulkModal(true) }
  function closeBulk()          { setBulkModal(false); setBulkRows([]) }
  function addBulkRow()         { setBulkRows(r => [...r, emptyBulkRow()]) }
  function removeBulkRow(i)     { setBulkRows(r => r.filter((_,idx)=>idx!==i)) }
  function updateBulkRow(i,k,v) { setBulkRows(r => r.map((x,idx)=>idx===i?{...x,[k]:v}:x)) }

  async function saveBulk() {
    const valid = bulkRows.filter(r => r.name.trim())
    if (!valid.length) return
    const missingCat = valid.filter(r => !r.category)
    if (missingCat.length) { alert("Pilih kategori untuk semua baris terlebih dahulu: " + missingCat.map(r=>r.name.trim()).join(", ")); return }
    setBulkSaving(true)
    const payload = valid.map(r => {
      const qty = parseFloat(r.qty)||1
      const unit_price = parseFloat(r.unit_price)||0
      return {
        name: r.name.trim(), category: r.category,
        qty, unit_price, amount: qty * unit_price,
        acquired_date: r.acquired_date || new Date().toISOString().slice(0,10),
      }
    })
    const { error } = await supabase.from("assets").insert(payload)
    if (error) { alert("Error: "+error.message); setBulkSaving(false); return }
    await load()
    closeBulk()
    setBulkSaving(false)
  }

  const totalInvested = assets.reduce((a,x)=>a+(x.amount||0),0)

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div className="bo-card" style={{ margin:0, padding:"14px 20px", display:"flex", gap:24, alignItems:"center" }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--ink4)", textTransform:"uppercase" }}>Total Invested</div>
            <div style={{ fontSize:22, fontWeight:900, color:"var(--brand)" }}>{fmt(totalInvested)}</div>
          </div>
          <div style={{ fontSize:12, color:"var(--ink4)" }}>{assets.length} asset{assets.length!==1?"s":""}</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={openBulk} className="bo-btn bo-btn-ghost">+ Bulk Add</button>
          <button onClick={openAdd} className="bo-btn bo-btn-primary">+ Add Asset</button>
        </div>
      </div>

      <div className="bo-card" style={{ padding:0, overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
          <table className="bo-table">
            <thead><tr><th>Date</th><th>Name</th><th>Category</th><th style={{textAlign:"right"}}>Qty</th><th style={{textAlign:"right"}}>Unit Price</th><th style={{textAlign:"right"}}>Amount</th><th>Notes</th><th>Actions</th></tr></thead>
            <tbody>
              {assets.map(a => {
                const c = CAT_COLORS[a.category] || "var(--ink5)"
                return (
                  <tr key={a.id}>
                    <td style={{ fontSize:12, color:"var(--ink4)" }}>{a.acquired_date}</td>
                    <td style={{ fontWeight:700 }}>{a.name}</td>
                    <td><span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10, background:c+"22", color:c }}>{a.category||"—"}</span></td>
                    <td style={{ textAlign:"right", fontSize:12 }}>{a.qty||1}</td>
                    <td style={{ textAlign:"right", fontSize:12, color:"var(--ink4)" }}>{fmt(a.unit_price||a.amount)}</td>
                    <td style={{ fontWeight:700, textAlign:"right" }}>{fmt(a.amount)}</td>
                    <td style={{ fontSize:12, color:"var(--ink4)", maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.notes||"—"}</td>
                    <td>
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={()=>openEdit(a)} className="bo-btn bo-btn-ghost bo-btn-sm">Edit</button>
                        <button onClick={()=>deleteAsset(a.id)} className="bo-btn bo-btn-danger bo-btn-sm">✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {assets.length===0 && <tr><td colSpan={8} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No assets yet. Click + Add Asset.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&closeModal()}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">{modal==="add"?"Add Asset":"Edit Asset"}</div>
              <button className="bo-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div className="bo-form-row"><label className="bo-label">Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="bo-input" autoFocus placeholder="e.g. Kulkas 2 Pintu" /></div>
              <div className="bo-form-row"><label className="bo-label">Category *</label>
                <select value={form.category||""} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="bo-select" style={!form.category?{ borderColor:"var(--red)" }:undefined}>
                  <option value="">— Select category —</option>
                  {ASSET_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Qty</label><input type="number" value={form.qty??1} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} className="bo-input" placeholder="1" /></div>
                <div><label className="bo-label">Unit Price *</label><input type="number" value={form.unit_price} onChange={e=>setForm(f=>({...f,unit_price:e.target.value}))} className="bo-input" placeholder="0" /></div>
              </div>
              <div className="bo-form-row" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:"var(--surface)", borderRadius:"var(--r)" }}>
                <span style={{ fontSize:12, color:"var(--ink4)" }}>Total Amount</span>
                <span style={{ fontWeight:800 }}>{fmt(formAmount)}</span>
              </div>
              <div className="bo-form-row"><label className="bo-label">Date Acquired</label><input type="date" value={form.acquired_date} onChange={e=>setForm(f=>({...f,acquired_date:e.target.value}))} className="bo-input" /></div>
              <div className="bo-form-row"><label className="bo-label">Notes</label><input value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} className="bo-input" placeholder="Optional" /></div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={closeModal} className="bo-btn bo-btn-ghost">Cancel</button>
              {modal==="edit" && <button onClick={()=>deleteAsset(form.id)} className="bo-btn bo-btn-danger">Delete</button>}
              <button onClick={save} disabled={saving||!form.name||!form.category||!form.unit_price} className="bo-btn bo-btn-primary">{saving?"Saving...":modal==="add"?"Add":"Save"}</button>
            </div>
          </div>
        </div>
      )}

      {bulkModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&closeBulk()}>
          <div className="bo-modal" style={{ maxWidth:840, maxHeight:"92vh" }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">Bulk Add Assets</div>
                <div style={{ fontSize:11, color:"var(--ink5)", marginTop:2 }}>Fill in as many rows as you need, then save them all at once. Rows with no name are ignored.</div>
              </div>
              <button className="bo-modal-close" onClick={closeBulk}>✕</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 170px 70px 110px 130px 28px", gap:8, marginBottom:6 }}>
                {["NAME *","CATEGORY *","QTY","UNIT PRICE","DATE",""].map((h,i)=>(
                  <div key={i} style={{ fontSize:10, fontWeight:700, color:"var(--ink4)", letterSpacing:"0.5px" }}>{h}</div>
                ))}
              </div>
              {bulkRows.map((r,i) => (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 170px 70px 110px 130px 28px", gap:8, marginBottom:6 }}>
                  <input value={r.name} onChange={e=>updateBulkRow(i,"name",e.target.value)} className="bo-input" style={{ fontSize:12 }} placeholder="e.g. Blender Phillips" />
                  <select value={r.category} onChange={e=>updateBulkRow(i,"category",e.target.value)} className="bo-select" style={r.name.trim()&&!r.category?{ fontSize:12, borderColor:"var(--red)" }:{ fontSize:12 }}>
                    <option value="">— Category —</option>
                    {ASSET_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                  <input type="number" value={r.qty} onChange={e=>updateBulkRow(i,"qty",e.target.value)} className="bo-input" style={{ fontSize:12 }} placeholder="1" />
                  <input type="number" value={r.unit_price} onChange={e=>updateBulkRow(i,"unit_price",e.target.value)} className="bo-input" style={{ fontSize:12 }} placeholder="0" />
                  <input type="date" value={r.acquired_date} onChange={e=>updateBulkRow(i,"acquired_date",e.target.value)} className="bo-input" style={{ fontSize:12 }} />
                  <button onClick={()=>removeBulkRow(i)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize:16, padding:0 }}>✕</button>
                </div>
              ))}
              <button onClick={addBulkRow} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ marginTop:8 }}>+ Add Row</button>
            </div>
            <div className="bo-modal-footer">
              <button onClick={closeBulk} className="bo-btn bo-btn-ghost" disabled={bulkSaving}>Cancel</button>
              <button onClick={saveBulk} disabled={bulkSaving} className="bo-btn bo-btn-primary">{bulkSaving?"Saving...":"Save All"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
