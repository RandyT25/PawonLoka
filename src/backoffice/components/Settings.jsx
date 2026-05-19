
import { useState } from "react"

const KEY = "pl_outlet_settings"

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") } catch { return {} }
}

export default function Settings() {
  const [s, setS]     = useState(load)
  const [saved, setSaved] = useState(false)

  function update(k, v) { setS(prev => ({ ...prev, [k]: v })) }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(s))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ maxWidth:600 }}>
      <div className="bo-card">
        <div className="bo-card-title">Outlet Information</div>
        {[
          ["outletName",  "Outlet Name",    "PawonLoka"],
          ["tagline",     "Tagline",         "Authentic Balinese Flavors"],
          ["address",     "Address",         "Jl. Raya Ubud No. 12, Bali"],
          ["phone",       "Phone",           "0361-123456"],
          ["website",     "Website",         "www.pawonloka.id"],
          ["instagram",   "Instagram",       "@pawonloka"],
          ["wifi",        "WiFi Password",   ""],
        ].map(([k, label, placeholder]) => (
          <div key={k} className="bo-form-row">
            <label className="bo-label">{label}</label>
            <input value={s[k]||""} onChange={e => update(k, e.target.value)} className="bo-input" placeholder={placeholder} />
          </div>
        ))}
      </div>

      <div className="bo-card">
        <div className="bo-card-title">Receipt Footer</div>
        <div className="bo-form-row">
          <label className="bo-label">Thank You Message</label>
          <input value={s.thankYou||""} onChange={e => update("thankYou", e.target.value)} className="bo-input" placeholder="Terima kasih sudah makan di sini!" />
        </div>
        <div className="bo-form-row">
          <label className="bo-label">Footer Note</label>
          <input value={s.footerNote||""} onChange={e => update("footerNote", e.target.value)} className="bo-input" placeholder="Follow us @pawonloka" />
        </div>
      </div>

      <button onClick={save} className="bo-btn bo-btn-primary" style={{ width:"100%", padding:13, fontSize:14 }}>
        {saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  )
}
