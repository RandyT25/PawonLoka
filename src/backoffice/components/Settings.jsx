import { useState, useEffect, useRef } from "react"
import { supabase } from "../../lib/supabase"

const DEFAULTS = {
  outlet: { name:"PawonLoka", tagline:"Rasa yang lahir dari dapur penuh cerita", address:"Bali, Indonesia", phone:"", email:"", website:"", instagram:"@pawonloka", wifi:"" },
  pos_behaviour: { auto_print_receipt:true, auto_print_checker:true, auto_print_stations:true, kitchen_display:true, cashier_discounts:true, require_pin_void:true, require_pin_refund:true, auto_member_discount:true, auto_close_time:"", manager_pin:"9999" },
  regional: { currency:"IDR", timezone:"WITA", date_format:"DD/MM/YYYY" },
  loyalty: { points_per_100:1, gold_threshold:5000, silver_threshold:2000 },
  stations: [{ id:"kitchen",name:"Kitchen",icon:"🍳" },{ id:"bar",name:"Bar",icon:"🍹" },{ id:"snack",name:"Snack",icon:"🍟" },{ id:"kasir",name:"Kasir",icon:"🧾" }],
}

export default function Settings() {
  const [settings, setSettings] = useState(DEFAULTS)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [tab,      setTab]      = useState("outlet")
  const [newStation, setNewStation] = useState({ name:"", icon:"🍳" })
  const [editStation, setEditStation] = useState(null)
  const [categories, setCategories] = useState([])
  const [catRouting, setCatRouting] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data:s }, { data:cats }] = await Promise.all([
      supabase.from("app_settings").select("*").eq("id","main").maybeSingle(),
      supabase.from("categories").select("id,name,icon").order("sort"),
    ])
    if (s) {
      setSettings({ outlet:s.outlet||DEFAULTS.outlet, pos_behaviour:s.pos_behaviour||DEFAULTS.pos_behaviour, regional:s.regional||DEFAULTS.regional, loyalty:s.loyalty||DEFAULTS.loyalty, stations:s.stations||DEFAULTS.stations })
      if (s.cat_routing) setCatRouting(s.cat_routing)
      else { try { setCatRouting(JSON.parse(localStorage.getItem("pl_cat_routing")||"{}")) } catch {} }
    }
    setCategories(cats||[])
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    const cleanedLoyalty = {
      ...settings.loyalty,
      points_per_100: parseFloat(settings.loyalty.points_per_100)||0,
      gold_threshold: parseInt(settings.loyalty.gold_threshold)||0,
      silver_threshold: parseInt(settings.loyalty.silver_threshold)||0,
    }
    await supabase.from("app_settings").upsert({ id:"main", ...settings, loyalty:cleanedLoyalty, cat_routing:catRouting, updated_at:new Date().toISOString() }, { onConflict:"id" })
    setSettings(s=>({...s, loyalty:cleanedLoyalty}))
    localStorage.setItem("pl_cat_routing", JSON.stringify(catRouting))
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function update(section, key, val) {
    setSettings(s => ({ ...s, [section]: { ...s[section], [key]: val } }))
  }

  function addStation() {
    if (!newStation.name) return
    const id = newStation.name.toLowerCase().replace(/\s+/g,"-")
    setSettings(s => ({ ...s, stations: [...(s.stations||[]), { ...newStation, id }] }))
    setNewStation({ name:"", icon:"🍳" })
  }

  function removeStation(id) {
    setSettings(s => ({ ...s, stations: (s.stations||[]).filter(st=>st.id!==id) }))
  }

  const TABS = [
    ["outlet","🏪 Outlet"],["pos","🧾 POS"],["regional","🌍 Regional"],
    ["loyalty","⭐ Loyalty"],["stations","🍳 Stations"],["reset","🗑 Reset"],
  ]

  if (loading) return <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div>

  return (
    <div style={{ maxWidth:700 }}>
      {/* Tab nav */}
      <div style={{ display:"flex", gap:6, marginBottom:20, flexWrap:"wrap" }}>
        {TABS.map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} className={"bo-btn bo-btn-sm "+(tab===t?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
        ))}
        <button onClick={save} disabled={saving} className="bo-btn bo-btn-sm" style={{ marginLeft:"auto", background:"var(--green)", color:"#fff", border:"none" }}>
          {saving?"Saving...":saved?"✓ Saved":"Save All"}
        </button>
      </div>

      {tab==="outlet" && (
        <div className="bo-card">
          <div className="bo-card-title">🏪 Outlet Information</div>
          {[["name","Outlet Name"],["tagline","Tagline"],["address","Address"],["phone","Phone"],["email","Email"],["website","Website"],["instagram","Instagram / Social"],["wifi","WiFi Password"]].map(([k,l])=>(
            <div key={k} className="bo-form-row">
              <label className="bo-label">{l}</label>
              <input value={settings.outlet[k]||""} onChange={e=>update("outlet",k,e.target.value)} className="bo-input" />
            </div>
          ))}
          <div style={{ marginTop:8, padding:"10px 14px", background:"var(--surface)", borderRadius:"var(--r)", fontSize:12, color:"var(--ink4)" }}>
            App version: PawonLoka v1.0 · Built with React + Supabase + Cloudflare Pages
          </div>
        </div>
      )}

      {tab==="pos" && (
        <div className="bo-card">
          <div className="bo-card-title">🧾 POS Behaviour</div>
          {[
            ["auto_print_receipt","Auto-print receipt on sale"],
            ["auto_print_checker","Auto-print checker when order is sent to kitchen"],
            ["auto_print_stations","Auto-print to kitchen stations (Kitchen/Bar/Snack printers)"],
            ["kitchen_display","Kitchen Display screen (on-screen KDS — separate from printers)"],
            ["cashier_discounts","Allow cashier discounts"],
            ["require_pin_void","Require PIN for void"],
            ["require_pin_refund","Require PIN for refund"],
            ["auto_member_discount","Auto-apply member discount (Gold 5%)"],
            ["auto_accept_production","Auto-Accept Kitchen Production"],
          ].map(([k,l])=>(
            <label key={k} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--surface2)", cursor:"pointer" }}>
              <span style={{ fontSize:13, fontWeight:600 }}>{l}</span>
              <div onClick={()=>update("pos_behaviour",k,!settings.pos_behaviour[k])}
                style={{ width:44, height:24, borderRadius:12, background:settings.pos_behaviour[k]?"var(--green)":"var(--surface3)", position:"relative", cursor:"pointer", transition:"background 0.2s", flexShrink:0 }}>
                <div style={{ width:20, height:20, borderRadius:"50%", background:"#fff", position:"absolute", top:2, left:settings.pos_behaviour[k]?22:2, transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
            </label>
          ))}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderTop:"1px solid var(--surface2)" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600 }}>Auto-Close POS Time</div>
              <div style={{ fontSize:11, color:"var(--ink4)" }}>POS shows 5-min warning before this time. Leave empty to disable.</div>
            </div>
            <input type="time" value={settings.pos_behaviour?.auto_close_time||""} onChange={e=>update("pos_behaviour","auto_close_time",e.target.value)} className="bo-input" style={{ width:130 }} />
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderTop:"1px solid var(--surface2)" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600 }}>Manager PIN</div>
              <div style={{ fontSize:11, color:"var(--ink4)" }}>Required to void orders and remove sent items.</div>
            </div>
            <input type="password" value={settings.pos_behaviour?.manager_pin||""} onChange={e=>update("pos_behaviour","manager_pin",e.target.value)} className="bo-input" style={{ width:130, textAlign:"center", letterSpacing:6 }} maxLength={8} placeholder="PIN" />
          </div>
        </div>
      )}

      {tab==="regional" && (
        <div className="bo-card">
          <div className="bo-card-title">🌍 Regional & Format</div>
          <div className="bo-form-row">
            <label className="bo-label">Currency</label>
            <div style={{ display:"flex", gap:8 }}>
              {["IDR","USD"].map(c=>(
                <button key={c} onClick={()=>update("regional","currency",c)} className={"bo-btn bo-btn-sm "+(settings.regional.currency===c?"bo-btn-primary":"bo-btn-ghost")}>
                  {c==="IDR"?"IDR — Indonesian Rupiah":"USD — US Dollar"}
                </button>
              ))}
            </div>
          </div>
          <div className="bo-form-row">
            <label className="bo-label">Timezone</label>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {[["WITA","WITA — Bali/Makassar"],["WIB","WIB — Jakarta"],["WIT","WIT — East Indonesia"]].map(([v,l])=>(
                <button key={v} onClick={()=>update("regional","timezone",v)} className={"bo-btn bo-btn-sm "+(settings.regional.timezone===v?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
              ))}
            </div>
          </div>
          <div className="bo-form-row">
            <label className="bo-label">Date Format</label>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {["DD/MM/YYYY","MM/DD/YYYY","YYYY-MM-DD"].map(v=>(
                <button key={v} onClick={()=>update("regional","date_format",v)} className={"bo-btn bo-btn-sm "+(settings.regional.date_format===v?"bo-btn-primary":"bo-btn-ghost")}>{v}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab==="loyalty" && (
        <div className="bo-card">
          <div className="bo-card-title">⭐ Loyalty Program</div>
          {[["points_per_100","Points per Rp 100 spent"],["gold_threshold","Gold Threshold (pts)"],["silver_threshold","Silver Threshold (pts)"]].map(([k,l])=>(
            <div key={k} className="bo-form-row">
              <label className="bo-label">{l}</label>
              <input type="number" value={settings.loyalty[k]??0} onChange={e=>update("loyalty",k,e.target.value)} className="bo-input" style={{ maxWidth:160 }} />
            </div>
          ))}
          <div style={{ padding:"10px 14px", background:"var(--brand-lt)", borderRadius:"var(--r)", fontSize:12, color:"var(--brand)", fontWeight:600 }}>
            Gold: {settings.loyalty.gold_threshold?.toLocaleString("id-ID")} pts · Silver: {settings.loyalty.silver_threshold?.toLocaleString("id-ID")} pts · {settings.loyalty.points_per_100} pt per Rp 100
          </div>
        </div>
      )}

      {tab==="stations" && (
        <>
          <div className="bo-card">
            <div className="bo-card-title">🍳 Kitchen Stations</div>
            <div style={{ fontSize:12, color:"var(--ink4)", marginBottom:14 }}>Items automatically route to the correct station when charged.</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
              {(settings.stations||[]).map(st=>(
                <div key={st.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"var(--surface)", borderRadius:"var(--r)", border:"1px solid var(--surface3)" }}>
                  <span style={{ fontSize:20 }}>{st.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700 }}>{st.name}</div>
                    <div style={{ fontSize:11, color:"var(--ink5)" }}>ID: {st.id}</div>
                  </div>
                  <button onClick={()=>removeStation(st.id)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize:16 }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"60px 1fr auto", gap:8 }}>
              <input value={newStation.icon} onChange={e=>setNewStation(s=>({...s,icon:e.target.value}))} className="bo-input" placeholder="🍳" style={{ textAlign:"center", fontSize:20 }} />
              <input value={newStation.name} onChange={e=>setNewStation(s=>({...s,name:e.target.value}))} className="bo-input" placeholder="Station name" onKeyDown={e=>e.key==="Enter"&&addStation()} />
              <button onClick={addStation} className="bo-btn bo-btn-primary">+ Add</button>
            </div>
          </div>

          <div className="bo-card">
            <div className="bo-card-title">Category → Station Routing</div>
            <div style={{ fontSize:12, color:"var(--ink4)", marginBottom:14 }}>Assign each category to a station. Changes take effect immediately in POS.</div>
            {categories.map(cat=>(
              <div key={cat.id||cat.name} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid var(--surface2)" }}>
                <span style={{ fontSize:18, width:28 }}>{cat.icon||"🍽"}</span>
                <span style={{ flex:1, fontSize:13, fontWeight:600 }}>{cat.name}</span>
                <select value={catRouting[cat.name]||""} onChange={e=>setCatRouting(r=>({...r,[cat.name]:e.target.value}))} className="bo-select" style={{ maxWidth:160, fontSize:12 }}>
                  <option value="">— No routing —</option>
                  {(settings.stations||[]).map(st=><option key={st.id} value={st.id}>{st.icon} {st.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </>
      )}

      {tab !== "reset" && (
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
          <button onClick={save} disabled={saving} className="bo-btn bo-btn-primary" style={{ minWidth:140 }}>
            {saving?"Saving...":saved?"✓ Saved!":"Save Settings"}
          </button>
        </div>
      )}

      {tab==="reset" && (
        <div className="bo-card" style={{ border:"1.5px solid var(--red)" }}>
          <div className="bo-card-title" style={{ color:"var(--red)" }}>🗑 Reset Data</div>
          <div style={{ fontSize:13, color:"var(--ink4)", marginBottom:20, lineHeight:1.7 }}>
            Use these options carefully. Deleted data cannot be recovered.<br/>
            These operations only delete transaction data — products, staff, settings and inventory are kept.
          </div>
          {[
            { label:"Clear All Orders", desc:"Delete all POS orders and receipts", table:"orders", color:"var(--amber)" },
            { label:"Clear All Expenses", desc:"Delete all manually entered expenses", table:"expenses", color:"var(--amber)" },
            { label:"Clear Attendance Records", desc:"Delete all clock in/out records", table:"attendance", color:"var(--amber)" },
            { label:"Clear Shift Records", desc:"Delete all POS shift records", table:"shifts", color:"var(--amber)" },
            { label:"Clear Customer Points", desc:"Reset all customer loyalty points to 0", table:"customers_points", color:"var(--red)" },
            { label:"Clear Kas Bon", desc:"Delete all staff loan records", table:"kas_bon", color:"var(--amber)" },
          ].map(item=>(
            <div key={item.table} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", borderBottom:"1px solid var(--surface2)" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700 }}>{item.label}</div>
                <div style={{ fontSize:11, color:"var(--ink4)" }}>{item.desc}</div>
              </div>
              <button onClick={async()=>{
                if (!confirm("Are you sure? This cannot be undone.\n\n"+item.desc)) return
                const code = prompt("Type DELETE to confirm:")
                if (code !== "DELETE") { alert("Cancelled"); return }
                if (item.table==="customers_points") {
                  const { supabase: sb } = await import("../../lib/supabase")
                  await sb.from("customers").update({ points:0, visits:0, totalSpend:0 }).neq("id","none")
                  alert("Customer points reset!")
                } else {
                  const { supabase: sb } = await import("../../lib/supabase")
                  await sb.from(item.table).delete().neq("id","none")
                  alert(item.label+" complete!")
                }
              }} style={{ padding:"8px 16px", border:"1.5px solid "+item.color, borderRadius:8, background:"#fff", color:item.color, fontWeight:700, fontSize:12, cursor:"pointer", flexShrink:0, marginLeft:16 }}>
                Clear
              </button>
            </div>
          ))}
          <div style={{ marginTop:20, padding:"12px 16px", background:"#FFEBE6", borderRadius:8, fontSize:12, color:"var(--red)", fontWeight:600 }}>
            ⚠️ Full reset: deletes orders + expenses + attendance + shifts. Products, staff, recipes and inventory are NOT deleted.
          </div>
          <button onClick={async()=>{
            if (!confirm("FULL RESET: Delete ALL transaction data?\nThis cannot be undone.")) return
            const code = prompt("Type RESET ALL to confirm:")
            if (code !== "RESET ALL") { alert("Cancelled"); return }
            const { supabase: sb } = await import("../../lib/supabase")
            await Promise.all([
              sb.from("orders").delete().neq("id","none"),
              sb.from("expenses").delete().neq("id","none"),
              sb.from("attendance").delete().neq("id","none"),
              sb.from("shifts").delete().neq("id","none"),
              sb.from("kas_bon").delete().neq("id","none"),
            ])
            alert("Full reset complete!")
          }} className="bo-btn bo-btn-danger" style={{ width:"100%", marginTop:12 }}>
            FULL RESET — Delete All Transaction Data
          </button>
        </div>
      )}
    </div>
  )
}
