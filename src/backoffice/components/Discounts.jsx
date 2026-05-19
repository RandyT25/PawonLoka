import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }
const EMPTY={name:"",type:"Percentage",value:"",applyTo:"All Items",minOrder:"",active:true,startTime:"",endTime:""}

export default function Discounts() {
  const [discounts,setDiscounts]=useState([])
  const [loading,  setLoading]  =useState(true)
  const [modal,    setModal]    =useState(false)
  const [form,     setForm]     =useState(EMPTY)
  const [saving,   setSaving]   =useState(false)

  useEffect(()=>{load()},[])

  async function load(){
    setLoading(true)
    const {data}=await supabase.from("discounts").select("*").order("name")
    setDiscounts(data||[]); setLoading(false)
  }

  async function save(){
    if (!form.name||!form.value) return
    setSaving(true)
    const payload={name:form.name.trim(),type:form.type,value:parseFloat(form.value)||0,apply_to:form.applyTo,min_order:parseInt(form.minOrder)||0,active:form.active!==false,start_time:form.startTime||null,end_time:form.endTime||null}
    if (modal==="add") await supabase.from("discounts").insert({...payload,id:"DSC-"+Date.now()})
    else await supabase.from("discounts").update(payload).eq("id",form.id)
    await load(); setModal(false); setForm(EMPTY); setSaving(false)
  }

  async function toggleActive(d){
    await supabase.from("discounts").update({active:!d.active}).eq("id",d.id)
    setDiscounts(prev=>prev.map(x=>x.id===d.id?{...x,active:!x.active}:x))
  }

  async function deleteDiscount(id){
    if (!confirm("Delete discount?")) return
    await supabase.from("discounts").delete().eq("id",id)
    setDiscounts(prev=>prev.filter(d=>d.id!==id))
  }

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <span style={{fontSize:13,color:"var(--ink4)"}}>{discounts.filter(d=>d.active).length} active · {discounts.length} total</span>
        <button onClick={()=>{setForm(EMPTY);setModal("add")}} className="bo-btn bo-btn-primary">+ Add Discount</button>
      </div>
      {loading?<div style={{textAlign:"center",padding:40,color:"var(--ink5)"}}>Loading...</div>:(
        <div className="bo-card" style={{padding:0,overflow:"hidden"}}>
          <table className="bo-table">
            <thead><tr><th>Name</th><th>Type</th><th>Value</th><th>Apply To</th><th>Time</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {discounts.map(d=>(
                <tr key={d.id}>
                  <td style={{fontWeight:700}}>{d.name}</td>
                  <td>{d.type}</td>
                  <td style={{fontWeight:700,color:"var(--brand)"}}>{d.type==="Percentage"?d.value+"%":fmt(d.value)}</td>
                  <td>{d.apply_to||"All"}</td>
                  <td style={{fontSize:12,color:"var(--ink5)"}}>{d.start_time&&d.end_time?d.start_time+" - "+d.end_time:"Always"}</td>
                  <td><span className={"bo-badge "+(d.active?"bo-badge-green":"bo-badge-amber")}>{d.active?"Active":"Off"}</span></td>
                  <td>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>{setForm({...d,value:String(d.value),minOrder:String(d.min_order||""),applyTo:d.apply_to||"All Items",startTime:d.start_time||"",endTime:d.end_time||""});setModal("edit")}} className="bo-btn bo-btn-ghost bo-btn-sm">Edit</button>
                      <button onClick={()=>toggleActive(d)} className="bo-btn bo-btn-ghost bo-btn-sm">{d.active?"Off":"On"}</button>
                      <button onClick={()=>deleteDiscount(d.id)} className="bo-btn bo-btn-danger bo-btn-sm">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
              {discounts.length===0&&<tr><td colSpan={7} style={{textAlign:"center",color:"var(--ink5)",padding:"32px 0"}}>No discounts yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {modal&&(
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="bo-modal">
            <div className="bo-modal-header"><div className="bo-modal-title">{modal==="add"?"Add Discount":"Edit Discount"}</div><button className="bo-modal-close" onClick={()=>setModal(false)}>✕</button></div>
            <div className="bo-modal-body">
              <div className="bo-form-row"><label className="bo-label">Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="bo-input" autoFocus /></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <div><label className="bo-label">Type</label><select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="bo-select"><option>Percentage</option><option>Fixed Amount</option></select></div>
                <div><label className="bo-label">Value *</label><input type="number" value={form.value} onChange={e=>setForm(f=>({...f,value:e.target.value}))} className="bo-input" /></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <div><label className="bo-label">Apply To</label><select value={form.applyTo} onChange={e=>setForm(f=>({...f,applyTo:e.target.value}))} className="bo-select"><option>All Items</option><option>Category</option><option>Specific Item</option></select></div>
                <div><label className="bo-label">Min Order (Rp)</label><input type="number" value={form.minOrder} onChange={e=>setForm(f=>({...f,minOrder:e.target.value}))} className="bo-input" /></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <div><label className="bo-label">Start Time</label><input type="time" value={form.startTime} onChange={e=>setForm(f=>({...f,startTime:e.target.value}))} className="bo-input" /></div>
                <div><label className="bo-label">End Time</label><input type="time" value={form.endTime} onChange={e=>setForm(f=>({...f,endTime:e.target.value}))} className="bo-input" /></div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10}}><label className="bo-label" style={{marginBottom:0}}>Active</label><input type="checkbox" checked={form.active!==false} onChange={e=>setForm(f=>({...f,active:e.target.checked}))} style={{width:16,height:16,accentColor:"var(--brand)"}} /></div>
            </div>
            <div className="bo-modal-footer"><button onClick={()=>setModal(false)} className="bo-btn bo-btn-ghost">Cancel</button><button onClick={save} disabled={saving||!form.name||!form.value} className="bo-btn bo-btn-primary">{saving?"Saving...":modal==="add"?"Add":"Save"}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
