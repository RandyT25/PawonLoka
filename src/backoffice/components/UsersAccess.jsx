import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

const ROLES=["Owner","Manager","Cashier","Waiter","Kitchen"]

export default function UsersAccess() {
  const [staff,  setStaff]  =useState([])
  const [loading,setLoading]=useState(true)
  const [modal,  setModal]  =useState(null)
  const [form,   setForm]   =useState({pin:"",role:""})
  const [saving, setSaving] =useState(false)

  useEffect(()=>{load()},[])

  async function load(){
    setLoading(true)
    const {data}=await supabase.from("staff").select("*").order("name")
    setStaff(data||[]); setLoading(false)
  }

  async function savePin(){
    if (!form.pin||form.pin.length!==4){alert("PIN must be 4 digits");return}
    setSaving(true)
    await supabase.from("staff").update({pin:form.pin,role:form.role}).eq("id",modal.id)
    await load(); setModal(null); setSaving(false)
  }

  const roleColors={Owner:"var(--red)",Manager:"var(--brand)",Cashier:"var(--green)",Waiter:"var(--amber)",Kitchen:"#6554C0"}

  return (
    <div>
      <div className="bo-card" style={{padding:0,overflow:"hidden"}}>
        {loading?<div style={{padding:40,textAlign:"center",color:"var(--ink5)"}}>Loading...</div>:(
          <table className="bo-table">
            <thead><tr><th>Staff</th><th>Role</th><th>PIN</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {staff.map(s=>(
                <tr key={s.id}>
                  <td><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:32,height:32,borderRadius:"50%",background:s.color||"var(--brand)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#fff"}}>{s.name?.slice(0,2).toUpperCase()}</div><span style={{fontWeight:700}}>{s.name}</span></div></td>
                  <td><span style={{fontSize:12,fontWeight:700,color:roleColors[s.role]||"var(--ink4)"}}>{s.role}</span></td>
                  <td><span style={{fontFamily:"monospace",letterSpacing:2}}>••••</span></td>
                  <td><span className={"bo-badge "+(s.active?"bo-badge-green":"bo-badge-amber")}>{s.active?"Active":"Inactive"}</span></td>
                  <td><button onClick={()=>{setModal(s);setForm({pin:"",role:s.role})}} className="bo-btn bo-btn-ghost bo-btn-sm">Change PIN / Role</button></td>
                </tr>
              ))}
              {staff.length===0&&<tr><td colSpan={5} style={{textAlign:"center",color:"var(--ink5)",padding:"32px 0"}}>No staff yet — add from Employees</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {modal&&(
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="bo-modal">
            <div className="bo-modal-header"><div className="bo-modal-title">Edit Access — {modal.name}</div><button className="bo-modal-close" onClick={()=>setModal(null)}>✕</button></div>
            <div className="bo-modal-body">
              <div className="bo-form-row"><label className="bo-label">Role</label><select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} className="bo-select">{ROLES.map(r=><option key={r}>{r}</option>)}</select></div>
              <div className="bo-form-row"><label className="bo-label">New PIN (4 digits)</label><input type="password" maxLength={4} value={form.pin} onChange={e=>setForm(f=>({...f,pin:e.target.value.replace(/\D/g,"").slice(0,4)}))} className="bo-input" placeholder="Enter new 4-digit PIN" /></div>
            </div>
            <div className="bo-modal-footer"><button onClick={()=>setModal(null)} className="bo-btn bo-btn-ghost">Cancel</button><button onClick={savePin} disabled={saving||!form.pin} className="bo-btn bo-btn-primary">{saving?"Saving...":"Save Changes"}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
