
import { useState } from "react"

const KEY = "pl_payments_settings"
const DEFAULTS = {
  tax:      { enabled:true,  rate:10, label:"PPN" },
  service:  { enabled:true,  rate:5,  label:"Service Charge" },
  rounding: { enabled:true,  roundTo:1000 },
  methods:  [
    { id:"Cash",     name:"Cash",         enabled:true,  surcharge:0 },
    { id:"QRIS",     name:"QRIS",         enabled:true,  surcharge:0 },
    { id:"GoPay",    name:"GoPay",        enabled:true,  surcharge:0 },
    { id:"OVO",      name:"OVO",          enabled:true,  surcharge:0 },
    { id:"Card",     name:"Debit/Credit", enabled:true,  surcharge:1.5 },
    { id:"Transfer", name:"Bank Transfer",enabled:false, surcharge:0 },
  ]
}

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)||"{}") } }
  catch { return DEFAULTS }
}

export default function PaymentsTax() {
  const [s, setS]     = useState(load)
  const [saved, setSaved] = useState(false)

  function save() {
    localStorage.setItem(KEY, JSON.stringify(s))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function updateMethod(id, key, val) {
    setS(prev => ({ ...prev, methods: prev.methods.map(m => m.id===id ? {...m,[key]:val} : m) }))
  }

  return (
    <div style={{ maxWidth:640 }}>
      {/* Tax */}
      <div className="bo-card">
        <div className="bo-card-title">Tax</div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--surface3)" }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600 }}>Enable Tax</div>
            <div style={{ fontSize:11, color:"var(--ink5)" }}>Applied to all transactions</div>
          </div>
          <input type="checkbox" checked={s.tax.enabled} onChange={e => setS(p=>({...p,tax:{...p.tax,enabled:e.target.checked}}))} style={{ width:18, height:18, accentColor:"var(--brand)" }} />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:12 }}>
          <div>
            <label className="bo-label">Label</label>
            <input value={s.tax.label} onChange={e => setS(p=>({...p,tax:{...p.tax,label:e.target.value}}))} className="bo-input" />
          </div>
          <div>
            <label className="bo-label">Rate (%)</label>
            <input type="number" value={s.tax.rate} onChange={e => setS(p=>({...p,tax:{...p.tax,rate:parseFloat(e.target.value)||0}}))} className="bo-input" />
          </div>
        </div>
      </div>

      {/* Service */}
      <div className="bo-card">
        <div className="bo-card-title">Service Charge</div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--surface3)" }}>
          <div style={{ fontSize:13, fontWeight:600 }}>Enable Service Charge</div>
          <input type="checkbox" checked={s.service.enabled} onChange={e => setS(p=>({...p,service:{...p.service,enabled:e.target.checked}}))} style={{ width:18, height:18, accentColor:"var(--brand)" }} />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:12 }}>
          <div>
            <label className="bo-label">Label</label>
            <input value={s.service.label} onChange={e => setS(p=>({...p,service:{...p.service,label:e.target.value}}))} className="bo-input" />
          </div>
          <div>
            <label className="bo-label">Rate (%)</label>
            <input type="number" value={s.service.rate} onChange={e => setS(p=>({...p,service:{...p.service,rate:parseFloat(e.target.value)||0}}))} className="bo-input" />
          </div>
        </div>
      </div>

      {/* Payment methods */}
      <div className="bo-card">
        <div className="bo-card-title">Payment Methods</div>
        <table className="bo-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Enabled</th>
              <th>Surcharge (%)</th>
            </tr>
          </thead>
          <tbody>
            {s.methods.map(m => (
              <tr key={m.id}>
                <td style={{ fontWeight:600 }}>{m.name}</td>
                <td>
                  <input type="checkbox" checked={m.enabled} onChange={e => updateMethod(m.id,"enabled",e.target.checked)} style={{ width:16, height:16, accentColor:"var(--brand)" }} />
                </td>
                <td>
                  <input type="number" value={m.surcharge} onChange={e => updateMethod(m.id,"surcharge",parseFloat(e.target.value)||0)} className="bo-input" style={{ width:80, padding:"6px 8px" }} step="0.1" min="0" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={save} className="bo-btn bo-btn-primary" style={{ width:"100%", padding:13, fontSize:14 }}>
        {saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  )
}
