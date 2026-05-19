import { useState } from "react"
const KEY="pl_receipt_settings"
const DEFAULTS={header:"PawonLoka",subheader:"Authentic Indonesian Food",showLogo:true,showAddress:true,showPhone:true,showWifi:false,showPoints:true,footer:"Terima kasih sudah makan di sini!",note:"Follow us @pawonloka",showTax:true,showService:true}

export default function ReceiptDesigner() {
  const [s,setS]=useState(()=>{try{return{...DEFAULTS,...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{return DEFAULTS}})
  const [saved,setSaved]=useState(false)
  function update(k,v){setS(p=>({...p,[k]:v}))}
  function save(){localStorage.setItem(KEY,JSON.stringify(s));setSaved(true);setTimeout(()=>setSaved(false),2000)}
  const Toggle=({k,label})=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--surface2)"}}>
      <span style={{fontSize:13,fontWeight:600}}>{label}</span>
      <input type="checkbox" checked={!!s[k]} onChange={e=>update(k,e.target.checked)} style={{width:18,height:18,accentColor:"var(--brand)"}} />
    </div>
  )
  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:16}}>
      <div>
        <div className="bo-card">
          <div className="bo-card-title">Header</div>
          <div className="bo-form-row"><label className="bo-label">Business Name</label><input value={s.header} onChange={e=>update("header",e.target.value)} className="bo-input" /></div>
          <div className="bo-form-row"><label className="bo-label">Tagline</label><input value={s.subheader} onChange={e=>update("subheader",e.target.value)} className="bo-input" /></div>
        </div>
        <div className="bo-card">
          <div className="bo-card-title">Show / Hide Fields</div>
          <Toggle k="showLogo" label="Logo" />
          <Toggle k="showAddress" label="Address" />
          <Toggle k="showPhone" label="Phone number" />
          <Toggle k="showWifi" label="WiFi password" />
          <Toggle k="showTax" label="Tax line" />
          <Toggle k="showService" label="Service charge line" />
          <Toggle k="showPoints" label="Loyalty points" />
        </div>
        <div className="bo-card">
          <div className="bo-card-title">Footer</div>
          <div className="bo-form-row"><label className="bo-label">Thank you message</label><input value={s.footer} onChange={e=>update("footer",e.target.value)} className="bo-input" /></div>
          <div className="bo-form-row"><label className="bo-label">Footer note</label><input value={s.note} onChange={e=>update("note",e.target.value)} className="bo-input" /></div>
        </div>
        <button onClick={save} className="bo-btn bo-btn-primary" style={{width:"100%",padding:13}}>{saved?"Saved!":"Save Receipt Settings"}</button>
      </div>
      <div className="bo-card" style={{fontFamily:"monospace",fontSize:12,lineHeight:1.8}}>
        <div className="bo-card-title">Preview</div>
        <div style={{background:"#fff",border:"1px dashed var(--surface3)",borderRadius:8,padding:16}}>
          <div style={{textAlign:"center",marginBottom:8}}>
            {s.showLogo&&<div style={{fontSize:24}}>🍳</div>}
            <div style={{fontWeight:900,fontSize:14}}>{s.header}</div>
            <div style={{fontSize:11,color:"#666"}}>{s.subheader}</div>
            {s.showAddress&&<div style={{fontSize:10,color:"#888"}}>Jl. Raya No.12, Bali</div>}
            {s.showPhone&&<div style={{fontSize:10,color:"#888"}}>0361-123456</div>}
          </div>
          <div style={{borderTop:"1px dashed #ccc",margin:"8px 0"}}/>
          <div style={{fontSize:11}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><span>Nasi Goreng x1</span><span>Rp 20.000</span></div>
            <div style={{display:"flex",justifyContent:"space-between"}}><span>Latte x2</span><span>Rp 40.000</span></div>
          </div>
          <div style={{borderTop:"1px dashed #ccc",margin:"8px 0"}}/>
          <div style={{fontSize:11}}>
            {s.showTax&&<div style={{display:"flex",justifyContent:"space-between"}}><span>PPN 10%</span><span>Rp 6.000</span></div>}
            {s.showService&&<div style={{display:"flex",justifyContent:"space-between"}}><span>Service 5%</span><span>Rp 3.000</span></div>}
            <div style={{display:"flex",justifyContent:"space-between",fontWeight:900,marginTop:4}}><span>TOTAL</span><span>Rp 69.000</span></div>
          </div>
          {s.showPoints&&<div style={{fontSize:10,color:"#888",marginTop:8,textAlign:"center"}}>Points earned: 69</div>}
          <div style={{borderTop:"1px dashed #ccc",margin:"8px 0"}}/>
          <div style={{textAlign:"center",fontSize:11}}><div>{s.footer}</div><div style={{color:"#888",fontSize:10}}>{s.note}</div></div>
        </div>
      </div>
    </div>
  )
}
