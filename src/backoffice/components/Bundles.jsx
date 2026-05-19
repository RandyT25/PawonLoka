import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }
const EMPTY={name:"",price:"",description:"",active:true}

export default function Bundles() {
  const [bundles, setBundles] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)

  useEffect(()=>{ load() },[])

  async function load() {
    setLoading(true)
    const {data}=await supabase.from("bundles").select("*").order("name")
    setBundles(data||[]); setLoading(false)
  }

  async function save() {
    if (!form.name||!form.price) return
    setSaving(true)
    const payload={name:form.name.trim(),price:parseInt(form.price)||0,description:form.description||null,active:form.active!==false}
    if (modal==="add") await supabase.from("bundles").insert({...payload,id:"BND-"+Date.now()})
    else await supabase.from("bundles").update(payload).eq("id",form.id)
    await load(); setModal(false); setForm(EMPTY); setSaving(false)
  }

  async function toggleActive(b) {
    await supabase.from("bundles").update({active:!b.active}).eq("id",b.id)
    setBundles(prev=>prev.map(x=>x.id===b.id?{...x,active:!x.active}:x))
  }

  async function deleteBundle(id) {
    if (!confirm("Delete bundle?")) return
    await supabase.from("bundles").delete().eq("id",id)
    setBundles(prev=>prev.filter(b=>b.id!==id))
  }

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <span style={{fontSize:13,color:"var(--ink4)"}}>{bundles.length} bundles</span>
        <button onClick={()=>{setForm(EMPTY);setModal("add")}} className="bo-btn bo-btn-primary">+ Add Bundle</button>
      </div>
      {loading?<div style={{textAlign:"center",padding:40,color:"var(--ink5)"}}>Loading...</div>:(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
          {bundles.map(b=>(
            <div key={b.id} style={{background:"#fff",border:"1.5px solid var(--surface3)",borderRadius:16,overflow:"hidden",opacity:b.active?1:0.6}}>
              <div style={{padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{fontSize:15,fontWeight:800}}>{b.name}</div>
                  <span className={"bo-badge "+(b.active?"bo-badge-green":"bo-badge-amber")}>{b.active?"Active":"Off"}</span>
                </div>
                <div style={{fontSize:24,fontWeight:900,color:"var(--brand)",margin:"8px 0"}}>{fmt(b.price)}</div>
                {b.description&&<div style={{fontSize:12,color:"var(--ink5)"}}>{b.description}</div>}
              </div>
              <div style={{display:"flex",borderTop:"1px solid var(--surface3)"}}>
                <button onClick={()=>{setForm({...b,price:String(b.price)});setModal("edit")}} style={{flex:1,padding:9,fontSize:12,fontWeight:600,color:"var(--ink4)",background:"none",border:"none",borderRight:"1px solid var(--surface3)",cursor:"pointer"}}>Edit</button>
                <button onClick={()=>toggleActive(b)} style={{flex:1,padding:9,fontSize:12,fontWeight:600,color:b.active?"var(--amber)":"var(--green)",background:"none",border:"none",borderRight:"1px solid var(--surface3)",cursor:"pointer"}}>{b.active?"Hide":"Show"}</button>
                <button onClick={()=>deleteBundle(b.id)} style={{flex:1,padding:9,fontSize:12,fontWeight:600,color:"var(--red)",background:"none",border:"none",cursor:"pointer"}}>Del</button>
              </div>
            </div>
          ))}
          {bundles.length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",color:"var(--ink5)",padding:40}}>No bundles yet</div>}
        </div>
      )}
      {modal&&(
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="bo-modal">
            <div className="bo-modal-header"><div className="bo-modal-title">{modal==="add"?"Add Bundle":"Edit Bundle"}</div><button className="bo-modal-close" onClick={()=>setModal(false)}>✕</button></div>
            <div className="bo-modal-body">
              <div className="bo-form-row"><label className="bo-label">Bundle Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="bo-input" autoFocus /></div>
              <div className="bo-form-row"><label className="bo-label">Price (Rp) *</label><input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} className="bo-input" /></div>
              <div className="bo-form-row"><label className="bo-label">Description</label><input value={form.description||""} onChange={e=>setForm(f=>({...f,description:e.target.value}))} className="bo-input" /></div>
              <div style={{display:"flex",alignItems:"center",gap:10}}><label className="bo-label" style={{marginBottom:0}}>Active</label><input type="checkbox" checked={form.active!==false} onChange={e=>setForm(f=>({...f,active:e.target.checked}))} style={{width:16,height:16,accentColor:"var(--brand)"}} /></div>
            </div>
            <div className="bo-modal-footer"><button onClick={()=>setModal(false)} className="bo-btn bo-btn-ghost">Cancel</button><button onClick={save} disabled={saving||!form.name||!form.price} className="bo-btn bo-btn-primary">{saving?"Saving...":modal==="add"?"Add":"Save"}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
