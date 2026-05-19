import { useState } from "react"
const KEY="pl_hardware_settings"
const DEFAULTS={printerType:"bluetooth",printerName:"",printerIp:"",printerPort:"9100",kitchenPrinter:"same",paperSize:"80mm",autoPrint:true,printKitchen:true,printReceipt:true}

export default function Hardware() {
  const [s,setS]=useState(()=>{try{return{...DEFAULTS,...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{return DEFAULTS}})
  const [saved,setSaved]=useState(false)
  function update(k,v){setS(p=>({...p,[k]:v}))}
  function save(){localStorage.setItem(KEY,JSON.stringify(s));setSaved(true);setTimeout(()=>setSaved(false),2000)}
  return (
    <div style={{maxWidth:600}}>
      <div className="bo-card">
        <div className="bo-card-title">Receipt Printer</div>
        <div className="bo-form-row"><label className="bo-label">Connection Type</label>
          <div style={{display:"flex",gap:8}}>
            {["bluetooth","network","usb"].map(t=>(
              <button key={t} onClick={()=>update("printerType",t)} className={"bo-btn bo-btn-sm "+(s.printerType===t?"bo-btn-primary":"bo-btn-ghost")} style={{textTransform:"capitalize"}}>{t}</button>
            ))}
          </div>
        </div>
        {s.printerType==="bluetooth"&&<div className="bo-form-row"><label className="bo-label">Printer Name / MAC</label><input value={s.printerName} onChange={e=>update("printerName",e.target.value)} className="bo-input" placeholder="e.g. POS-58" /></div>}
        {s.printerType==="network"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 120px",gap:12,marginBottom:14}}>
            <div><label className="bo-label">IP Address</label><input value={s.printerIp} onChange={e=>update("printerIp",e.target.value)} className="bo-input" placeholder="192.168.1.100" /></div>
            <div><label className="bo-label">Port</label><input value={s.printerPort} onChange={e=>update("printerPort",e.target.value)} className="bo-input" /></div>
          </div>
        )}
        <div className="bo-form-row"><label className="bo-label">Paper Size</label><select value={s.paperSize} onChange={e=>update("paperSize",e.target.value)} className="bo-select" style={{maxWidth:160}}><option>58mm</option><option>80mm</option></select></div>
      </div>
      <div className="bo-card">
        <div className="bo-card-title">Kitchen Printer</div>
        <div className="bo-form-row"><label className="bo-label">Kitchen Printer</label>
          <select value={s.kitchenPrinter} onChange={e=>update("kitchenPrinter",e.target.value)} className="bo-select">
            <option value="same">Same as receipt printer</option>
            <option value="separate">Separate printer</option>
            <option value="none">No kitchen printer</option>
          </select>
        </div>
      </div>
      <div className="bo-card">
        <div className="bo-card-title">Auto Print</div>
        {[["autoPrint","Auto-print receipt on payment"],["printKitchen","Print kitchen ticket on order"],["printReceipt","Print customer receipt"]].map(([k,l])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--surface2)"}}>
            <span style={{fontSize:13,fontWeight:600}}>{l}</span>
            <input type="checkbox" checked={!!s[k]} onChange={e=>update(k,e.target.checked)} style={{width:18,height:18,accentColor:"var(--brand)"}} />
          </div>
        ))}
      </div>
      <button onClick={save} className="bo-btn bo-btn-primary" style={{width:"100%",padding:13}}>{saved?"Saved!":"Save Hardware Settings"}</button>
    </div>
  )
}
