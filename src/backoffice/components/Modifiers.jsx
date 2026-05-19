import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }
const EMPTY_GROUP = { name:"", required:false, multi:false, min:0, max:1 }
const EMPTY_OPT   = { name:"", price:0 }

export default function Modifiers() {
  const [groups,   setGroups]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(null)
  const [form,     setForm]     = useState(EMPTY_GROUP)
  const [options,  setOptions]  = useState([{...EMPTY_OPT}])
  const [saving,   setSaving]   = useState(false)
  const [expanded, setExpanded] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from("modifier_groups").select("*, modifier_options(*)").order("name")
    setGroups(data||[])
    setLoading(false)
  }

  function openAdd()  { setForm(EMPTY_GROUP); setOptions([{...EMPTY_OPT}]); setModal("add") }
  function openEdit(g){ setForm({name:g.name,required:g.required,multi:g.multi,min:g.min||0,max:g.max||1}); setOptions(g.modifier_options?.length?g.modifier_options.map(o=>({...o})):[{...EMPTY_OPT}]); setModal({type:"edit",id:g.id}) }
  function closeModal(){ setModal(null) }
  function addOption()     { setOptions(o=>[...o,{...EMPTY_OPT}]) }
  function removeOption(i) { setOptions(o=>o.filter((_,idx)=>idx!==i)) }
  function updateOption(i,k,v){ setOptions(o=>o.map((x,idx)=>idx===i?{...x,[k]:v}:x)) }

  async function save() {
    if (!form.name) return
    setSaving(true)
    const gid = modal?.id||"MOD-"+Date.now()
    const payload = {name:form.name.trim(),required:!!form.required,multi:!!form.multi,min:parseInt(form.min)||0,max:parseInt(form.max)||1}
    if (modal==="add") { await supabase.from("modifier_groups").insert({...payload,id:gid}) }
    else { await supabase.from("modifier_groups").update(payload).eq("id",modal.id); await supabase.from("modifier_options").delete().eq("group_id",modal.id) }
    const opts = options.filter(o=>o.name.trim()).map((o,i)=>({id:`${gid}-OPT-${i}`,group_id:gid,name:o.name.trim(),price:parseInt(o.price)||0}))
    if (opts.length) await supabase.from("modifier_options").insert(opts)
    await load(); closeModal(); setSaving(false)
  }

  async function deleteGroup(id) {
    if (!confirm("Delete this modifier group?")) return
    await supabase.from("modifier_options").delete().eq("group_id",id)
    await supabase.from("modifier_groups").delete().eq("id",id)
    setGroups(prev=>prev.filter(g=>g.id!==id))
  }

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <span style={{fontSize:13,color:"var(--ink4)"}}>{groups.length} modifier groups</span>
        <button onClick={openAdd} className="bo-btn bo-btn-primary">+ Add Group</button>
      </div>
      {loading ? <div style={{textAlign:"center",padding:40,color:"var(--ink5)"}}>Loading...</div> : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {groups.map(g=>(
            <div key={g.id} className="bo-card" style={{marginBottom:0}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:800,color:"var(--ink)"}}>{g.name}</div>
                  <div style={{fontSize:11,color:"var(--ink5)",marginTop:2,display:"flex",gap:8}}>
                    {g.required&&<span className="bo-badge bo-badge-red">Required</span>}
                    {g.multi&&<span className="bo-badge bo-badge-blue">Multi-select</span>}
                    <span>{(g.modifier_options||[]).length} options</span>
                  </div>
                </div>
                <button onClick={()=>setExpanded(e=>({...e,[g.id]:!e[g.id]}))} className="bo-btn bo-btn-ghost bo-btn-sm">{expanded[g.id]?"▲ Hide":"▼ Options"}</button>
                <button onClick={()=>openEdit(g)} className="bo-btn bo-btn-ghost bo-btn-sm">Edit</button>
                <button onClick={()=>deleteGroup(g.id)} className="bo-btn bo-btn-danger bo-btn-sm">Del</button>
              </div>
              {expanded[g.id]&&(
                <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--surface3)",display:"flex",flexWrap:"wrap",gap:8}}>
                  {(g.modifier_options||[]).map(o=>(
                    <div key={o.id} style={{padding:"5px 12px",background:"var(--surface)",border:"1px solid var(--surface3)",borderRadius:20,fontSize:12,fontWeight:600}}>
                      {o.name} {o.price>0&&<span style={{color:"var(--brand)"}}>+{fmt(o.price)}</span>}
                    </div>
                  ))}
                  {!(g.modifier_options||[]).length&&<span style={{fontSize:12,color:"var(--ink5)"}}>No options yet</span>}
                </div>
              )}
            </div>
          ))}
          {groups.length===0&&<div style={{textAlign:"center",padding:40,color:"var(--ink5)"}}>No modifier groups yet</div>}
        </div>
      )}
      {modal&&(
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&closeModal()}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">{modal==="add"?"Add Modifier Group":"Edit Modifier Group"}</div>
              <button className="bo-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div className="bo-form-row"><label className="bo-label">Group Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="bo-input" placeholder="e.g. Spice Level" autoFocus /></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:14}}>
                <div><label className="bo-label">Required</label><input type="checkbox" checked={!!form.required} onChange={e=>setForm(f=>({...f,required:e.target.checked}))} style={{width:18,height:18,accentColor:"var(--brand)",marginTop:8,display:"block"}} /></div>
                <div><label className="bo-label">Multi-select</label><input type="checkbox" checked={!!form.multi} onChange={e=>setForm(f=>({...f,multi:e.target.checked}))} style={{width:18,height:18,accentColor:"var(--brand)",marginTop:8,display:"block"}} /></div>
                <div><label className="bo-label">Min</label><input type="number" value={form.min} onChange={e=>setForm(f=>({...f,min:e.target.value}))} className="bo-input" min={0} /></div>
                <div><label className="bo-label">Max</label><input type="number" value={form.max} onChange={e=>setForm(f=>({...f,max:e.target.value}))} className="bo-input" min={1} /></div>
              </div>
              <div className="bo-label" style={{marginBottom:8}}>Options</div>
              {options.map((o,i)=>(
                <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 120px 36px",gap:8,marginBottom:8}}>
                  <input value={o.name} onChange={e=>updateOption(i,"name",e.target.value)} className="bo-input" placeholder="Option name" />
                  <input type="number" value={o.price} onChange={e=>updateOption(i,"price",e.target.value)} className="bo-input" placeholder="Extra price" />
                  <button onClick={()=>removeOption(i)} className="bo-btn bo-btn-danger bo-btn-sm" style={{padding:"0 10px"}}>✕</button>
                </div>
              ))}
              <button onClick={addOption} className="bo-btn bo-btn-ghost bo-btn-sm" style={{marginTop:4}}>+ Add Option</button>
            </div>
            <div className="bo-modal-footer">
              <button onClick={closeModal} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving||!form.name} className="bo-btn bo-btn-primary">{saving?"Saving...":modal==="add"?"Add Group":"Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
