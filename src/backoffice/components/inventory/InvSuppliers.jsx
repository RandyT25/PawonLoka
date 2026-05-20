import { useState, useEffect } from "react"
import { supabase } from "../../../lib/supabase"

const PAYMENT_TERMS = ["Cash on Delivery","Net 7","Net 14","Net 30","Net 60","Prepaid"]

const SUPPLIER_SEED = [
  { id:"SUP001", name:"Supplier Daging Kambing", contact:"", phone:"", email:"", address:"", category:"Protein",    payment_terms:"Cash on Delivery", active:true },
  { id:"SUP002", name:"Supplier Ayam",            contact:"", phone:"", email:"", address:"", category:"Protein",    payment_terms:"Cash on Delivery", active:true },
  { id:"SUP003", name:"Tukang Sayur",             contact:"", phone:"", email:"", address:"", category:"Vegetables", payment_terms:"Cash on Delivery", active:true },
  { id:"SUP004", name:"Indomaret",                contact:"", phone:"", email:"", address:"", category:"General",    payment_terms:"Cash on Delivery", active:true },
  { id:"SUP005", name:"Shopee",                   contact:"", phone:"", email:"", address:"", category:"General",    payment_terms:"Prepaid",          active:true },
  { id:"SUP006", name:"Mitra Indah",              contact:"", phone:"", email:"", address:"", category:"General",    payment_terms:"Cash on Delivery", active:true },
  { id:"SUP007", name:"Rinduh Plastic",           contact:"", phone:"", email:"", address:"", category:"Packaging",  payment_terms:"Cash on Delivery", active:true },
  { id:"SUP008", name:"Gunung Intan Photocopy",   contact:"", phone:"", email:"", address:"", category:"Other",      payment_terms:"Cash on Delivery", active:true },
  { id:"SUP009", name:"Supplier Air/Gas",         contact:"", phone:"", email:"", address:"", category:"Beverages",  payment_terms:"Cash on Delivery", active:true },
  { id:"SUP010", name:"Supplier Es",              contact:"", phone:"", email:"", address:"", category:"Beverages",  payment_terms:"Cash on Delivery", active:true },
  { id:"SUP011", name:"Toko Kue",                 contact:"", phone:"", email:"", address:"", category:"Bakery",     payment_terms:"Cash on Delivery", active:true },
  { id:"SUP012", name:"Pak Abu",                  contact:"", phone:"", email:"", address:"", category:"General",    payment_terms:"Cash on Delivery", active:true },
  { id:"SUP013", name:"Supplier Beras",           contact:"", phone:"", email:"", address:"", category:"Dry Goods",  payment_terms:"Cash on Delivery", active:true },
  { id:"SUP014", name:"Toko 99",                  contact:"", phone:"", email:"", address:"", category:"General",    payment_terms:"Cash on Delivery", active:true },
  { id:"SUP015", name:"Toko Sembako",             contact:"", phone:"", email:"", address:"", category:"Dry Goods",  payment_terms:"Cash on Delivery", active:true },
  { id:"SUP016", name:"Ayyasi",                   contact:"", phone:"", email:"", address:"", category:"General",    payment_terms:"Cash on Delivery", active:true },
]

const EMPTY = { name:"", contact:"", phone:"", email:"", address:"", category:"General", payment_terms:"Cash on Delivery", active:true }
const CAT_COLORS = { Protein:"var(--red)", Vegetables:"var(--green)", General:"var(--brand)", Packaging:"#6554C0", Beverages:"#00B8D9", "Dry Goods":"var(--amber)", Bakery:"#FF8B00", Other:"var(--ink5)" }

export default function InvSuppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [modal,     setModal]     = useState(null)
  const [form,      setForm]      = useState(EMPTY)
  const [saving,    setSaving]    = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [seeding,   setSeeding]   = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from("suppliers").select("*").order("name")
    setSuppliers(data||[])
    setLoading(false)
  }

  async function seedSuppliers() {
    if (!confirm("Import 16 suppliers from your POS data?")) return
    setSeeding(true)
    await supabase.from("suppliers").upsert(SUPPLIER_SEED, { onConflict:"id", ignoreDuplicates:true })
    await load()
    setSeeding(false)
  }

  function openAdd()   { setForm(EMPTY); setModal("add") }
  function openEdit(s) { setForm({...s}); setModal("edit") }
  function closeModal(){ setModal(null); setForm(EMPTY) }

  async function save() {
    if (!form.name) return
    setSaving(true)
    const payload = { name:form.name.trim(), contact:form.contact||null, phone:form.phone||null, email:form.email||null, address:form.address||null, category:form.category||"General", payment_terms:form.payment_terms||"Cash on Delivery", active:form.active!==false }
    if (modal==="add") await supabase.from("suppliers").insert({ ...payload, id:"SUP-"+Date.now() })
    else await supabase.from("suppliers").update(payload).eq("id", form.id)
    await load(); closeModal(); setSaving(false)
  }

  async function toggleActive(s) {
    await supabase.from("suppliers").update({ active:!s.active }).eq("id", s.id)
    setSuppliers(prev => prev.map(x => x.id===s.id?{...x,active:!x.active}:x))
  }

  async function deleteSupplier(id) {
    if (!confirm("Delete this supplier?")) return
    await supabase.from("suppliers").delete().eq("id", id)
    setSuppliers(prev => prev.filter(s=>s.id!==id))
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <span style={{ fontSize:13, color:"var(--ink4)", fontWeight:600 }}>{suppliers.length} suppliers</span>
        <div style={{ display:"flex", gap:8 }}>
          {suppliers.length === 0 && (
            <button onClick={seedSuppliers} disabled={seeding} className="bo-btn bo-btn-ghost">
              {seeding ? "Importing..." : "↻ Import from POS"}
            </button>
          )}
          <button onClick={openAdd} className="bo-btn bo-btn-primary">+ Add Supplier</button>
        </div>
      </div>

      {!loading && suppliers.length === 0 && (
        <div style={{ textAlign:"center", padding:48, background:"#fff", border:"1px solid var(--surface3)", borderRadius:16, marginBottom:16 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🏭</div>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>No suppliers yet</div>
          <div style={{ fontSize:13, color:"var(--ink5)", marginBottom:16 }}>Import your 16 suppliers from POS data</div>
          <button onClick={seedSuppliers} disabled={seeding} className="bo-btn bo-btn-primary">
            {seeding ? "Importing..." : "↻ Import 16 Suppliers from POS"}
          </button>
        </div>
      )}

      {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
          {suppliers.map(s => {
            const catColor = CAT_COLORS[s.category] || "var(--ink5)"
            return (
              <div key={s.id} style={{ background:"#fff", border:"1.5px solid var(--surface3)", borderRadius:16, overflow:"hidden", opacity:s.active?1:0.6 }}>
                <div style={{ height:6, background:catColor }} />
                <div style={{ padding:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:800, color:"var(--ink)" }}>{s.name}</div>
                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:10, background:catColor+"22", color:catColor, marginTop:3, display:"inline-block" }}>{s.category}</span>
                    </div>
                    <span className={"bo-badge "+(s.active?"bo-badge-green":"bo-badge-amber")}>{s.active?"Active":"Inactive"}</span>
                  </div>
                  {s.contact && <div style={{ fontSize:12, color:"var(--ink4)", marginBottom:2 }}>👤 {s.contact}</div>}
                  {s.phone   && <div style={{ fontSize:12, color:"var(--ink4)", marginBottom:2 }}>📞 {s.phone}</div>}
                  {s.email   && <div style={{ fontSize:12, color:"var(--ink4)", marginBottom:2 }}>✉️ {s.email}</div>}
                  {s.address && <div style={{ fontSize:11, color:"var(--ink5)", marginBottom:2 }}>📍 {s.address}</div>}
                  <div style={{ fontSize:11, color:"var(--ink5)", marginTop:4 }}>💳 {s.payment_terms||"Cash on Delivery"}</div>
                </div>
                <div style={{ display:"flex", borderTop:"1px solid var(--surface3)" }}>
                  <button onClick={()=>openEdit(s)} style={{ flex:1, padding:9, fontSize:12, fontWeight:600, color:"var(--ink4)", background:"none", border:"none", borderRight:"1px solid var(--surface3)", cursor:"pointer" }}>Edit</button>
                  <button onClick={()=>toggleActive(s)} style={{ flex:1, padding:9, fontSize:12, fontWeight:600, color:s.active?"var(--amber)":"var(--green)", background:"none", border:"none", borderRight:"1px solid var(--surface3)", cursor:"pointer" }}>{s.active?"Deactivate":"Activate"}</button>
                  <button onClick={()=>deleteSupplier(s.id)} style={{ flex:1, padding:9, fontSize:12, fontWeight:600, color:"var(--red)", background:"none", border:"none", cursor:"pointer" }}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&closeModal()}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">{modal==="add"?"Add Supplier":"Edit Supplier"}</div>
              <button className="bo-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div className="bo-form-row"><label className="bo-label">Supplier Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="bo-input" autoFocus /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Category</label>
                  <select value={form.category||"General"} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="bo-select">
                    {["General","Protein","Vegetables","Beverages","Dry Goods","Packaging","Bakery","Other"].map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="bo-label">Payment Terms</label>
                  <select value={form.payment_terms||"Cash on Delivery"} onChange={e=>setForm(f=>({...f,payment_terms:e.target.value}))} className="bo-select">
                    {PAYMENT_TERMS.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="bo-form-row"><label className="bo-label">Contact Person</label><input value={form.contact||""} onChange={e=>setForm(f=>({...f,contact:e.target.value}))} className="bo-input" /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Phone / WA</label><input value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} className="bo-input" /></div>
                <div><label className="bo-label">Email</label><input value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))} className="bo-input" /></div>
              </div>
              <div className="bo-form-row"><label className="bo-label">Address</label><input value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))} className="bo-input" /></div>
              <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
                <input type="checkbox" checked={form.active!==false} onChange={e=>setForm(f=>({...f,active:e.target.checked}))} style={{ width:16, height:16, accentColor:"var(--brand)" }} />
                <span style={{ fontSize:13, fontWeight:600 }}>Active</span>
              </label>
            </div>
            <div className="bo-modal-footer">
              <button onClick={closeModal} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving||!form.name} className="bo-btn bo-btn-primary">{saving?"Saving...":modal==="add"?"Add Supplier":"Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
