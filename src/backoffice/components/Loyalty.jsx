import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }
const KEY="pl_loyalty_settings"
const DEFAULTS={pointsPerRp:1000,bronzeMin:0,silverMin:1000,goldMin:5000,redeemRate:100}

export default function Loyalty() {
  const [tab,      setTab]      = useState("settings")
  const [settings, setSettings] = useState(()=>{ try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{return DEFAULTS} })
  const [vouchers, setVouchers] = useState([])
  const [loading,  setLoading]  = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState({code:"",discount:0,type:"Percentage",minOrder:0,expiry:"",active:true})

  useEffect(()=>{ if(tab==="vouchers") loadVouchers() },[tab])

  async function loadVouchers() {
    setLoading(true)
    const {data}=await supabase.from("vouchers").select("*").order("created_at",{ascending:false})
    setVouchers(data||[]); setLoading(false)
  }

  function saveSettings(){ localStorage.setItem(KEY,JSON.stringify(settings)); setSaved(true); setTimeout(()=>setSaved(false),2000) }

  async function saveVoucher() {
    const payload={...form,id:"VCH-"+Date.now(),discount:parseFloat(form.discount)||0,min_order:parseInt(form.minOrder)||0,expiry:form.expiry||null}
    await supabase.from("vouchers").insert(payload)
    setModal(false); loadVouchers()
  }

  async function toggleVoucher(v) {
    await supabase.from("vouchers").update({active:!v.active}).eq("id",v.id)
    setVouchers(prev=>prev.map(x=>x.id===v.id?{...x,active:!x.active}:x))
  }

  async function deleteVoucher(id) {
    if (!confirm("Delete voucher?")) return
    await supabase.from("vouchers").delete().eq("id",id)
    setVouchers(prev=>prev.filter(v=>v.id!==id))
  }

  return (
    <div>
      <div style={{display:"flex",gap:4,marginBottom:16}}>
        {[["settings","⚙️ Settings"],["vouchers","🎟 Vouchers"]].map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)} className={"bo-btn bo-btn-sm "+(tab===v?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
        ))}
      </div>
      {tab==="settings"&&(
        <div style={{maxWidth:500}}>
          <div className="bo-card">
            <div className="bo-card-title">Points Settings</div>
            {[["pointsPerRp","Rp spent per 1 point"],["redeemRate","Rp value per point redeemed"]].map(([k,l])=>(
              <div key={k} className="bo-form-row"><label className="bo-label">{l}</label><input type="number" value={settings[k]} onChange={e=>setSettings(s=>({...s,[k]:parseFloat(e.target.value)||0}))} className="bo-input" /></div>
            ))}
          </div>
          <div className="bo-card">
            <div className="bo-card-title">Tier Thresholds (points)</div>
            {[["bronzeMin","🥉 Bronze"],["silverMin","🥈 Silver"],["goldMin","🥇 Gold"]].map(([k,l])=>(
              <div key={k} className="bo-form-row"><label className="bo-label">{l}</label><input type="number" value={settings[k]} onChange={e=>setSettings(s=>({...s,[k]:parseInt(e.target.value)||0}))} className="bo-input" /></div>
            ))}
          </div>
          <button onClick={saveSettings} className="bo-btn bo-btn-primary" style={{width:"100%",padding:13}}>{saved?"Saved!":"Save Settings"}</button>
        </div>
      )}
      {tab==="vouchers"&&(
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
            <button onClick={()=>setModal(true)} className="bo-btn bo-btn-primary">+ Add Voucher</button>
          </div>
          {loading?<div style={{textAlign:"center",padding:40,color:"var(--ink5)"}}>Loading...</div>:(
            <div className="bo-card" style={{padding:0,overflow:"hidden"}}>
              <table className="bo-table">
                <thead><tr><th>Code</th><th>Type</th><th>Discount</th><th>Min Order</th><th>Expiry</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {vouchers.map(v=>(
                    <tr key={v.id}>
                      <td style={{fontFamily:"monospace",fontWeight:700}}>{v.code}</td>
                      <td>{v.type}</td>
                      <td style={{fontWeight:700,color:"var(--brand)"}}>{v.type==="Percentage"?v.discount+"%":fmt(v.discount)}</td>
                      <td>{fmt(v.min_order||0)}</td>
                      <td style={{fontSize:12,color:"var(--ink4)"}}>{v.expiry||"No expiry"}</td>
                      <td><span className={"bo-badge "+(v.active?"bo-badge-green":"bo-badge-amber")}>{v.active?"Active":"Off"}</span></td>
                      <td><div style={{display:"flex",gap:4}}><button onClick={()=>toggleVoucher(v)} className="bo-btn bo-btn-ghost bo-btn-sm">{v.active?"Off":"On"}</button><button onClick={()=>deleteVoucher(v.id)} className="bo-btn bo-btn-danger bo-btn-sm">Del</button></div></td>
                    </tr>
                  ))}
                  {vouchers.length===0&&<tr><td colSpan={7} style={{textAlign:"center",color:"var(--ink5)",padding:"32px 0"}}>No vouchers yet</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {modal&&(
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="bo-modal">
            <div className="bo-modal-header"><div className="bo-modal-title">Add Voucher</div><button className="bo-modal-close" onClick={()=>setModal(false)}>✕</button></div>
            <div className="bo-modal-body">
              <div className="bo-form-row"><label className="bo-label">Code *</label><input value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value.toUpperCase()}))} className="bo-input" placeholder="e.g. SAVE20" /></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <div><label className="bo-label">Type</label><select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="bo-select"><option>Percentage</option><option>Fixed Amount</option></select></div>
                <div><label className="bo-label">Discount</label><input type="number" value={form.discount} onChange={e=>setForm(f=>({...f,discount:e.target.value}))} className="bo-input" /></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <div><label className="bo-label">Min Order (Rp)</label><input type="number" value={form.minOrder} onChange={e=>setForm(f=>({...f,minOrder:e.target.value}))} className="bo-input" /></div>
                <div><label className="bo-label">Expiry Date</label><input type="date" value={form.expiry} onChange={e=>setForm(f=>({...f,expiry:e.target.value}))} className="bo-input" /></div>
              </div>
            </div>
            <div className="bo-modal-footer"><button onClick={()=>setModal(false)} className="bo-btn bo-btn-ghost">Cancel</button><button onClick={saveVoucher} disabled={!form.code||!form.discount} className="bo-btn bo-btn-primary">Add Voucher</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
