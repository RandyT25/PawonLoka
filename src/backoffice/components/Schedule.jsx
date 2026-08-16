import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
const DAY_SHORT = { Monday:"Mon",Tuesday:"Tue",Wednesday:"Wed",Thursday:"Thu",Friday:"Fri",Saturday:"Sat",Sunday:"Sun" }
const STATIONS = ["Kasir","Bar","Bakar","Snack","Kitchen"]
const STATION_COLORS = { Kasir:"var(--brand)",Bar:"var(--green)",Bakar:"var(--red)",Snack:"var(--amber)",Kitchen:"#6554C0" }
const STAFF_COLORS = ["#6366F1","#10B981","#F59E0B","#3B82F6","#8B5CF6","#EF4444","#06B6D4","#F97316","#EC4899"]
const STAFF_EMPTY = { name:"", role:[], color:"#3B82F6", pin:"", active:true }
const DEPT_COLORS  = ["#6366F1","#10B981","#F59E0B","#3B82F6","#8B5CF6","#EF4444","#06B6D4","#F97316","#EC4899","#DC2626","#0EA5E9"]
const DEPT_EMPTY   = { name:"", color:"#6366F1" }

// Default staff — can be overridden by shuffle
const DEFAULT_STAFF = ["Nita","Uti","Mahes","Alin","Yudi","Meldy","Oji"]

// Default OFF rules
const DEFAULT_OFF = {
  Monday:["Alin","Meldy"], Tuesday:["Nita"], Wednesday:["Uti"],
  Thursday:["Mahes"], Friday:["Yudi"], Saturday:[], Sunday:["Oji"]
}

// OFF validation rules
const OFF_RULES = {
  Monday:2, Tuesday:1, Wednesday:1, Thursday:1, Friday:1, Saturday:0, Sunday:1
}

// A staff member is eligible for a station if their Staff-tab role tags include it — plus a
// small alias list for roles that don't literally match a station name but clearly belong to
// one in practice (e.g. "Cook"/"Head Cook" both work Kitchen). Extend this if new roles need
// a home station.
const STATION_ROLE_ALIASES = { Kitchen: ["Kitchen","Cook","Head Cook"] }

// Cascade auto-fill for a day given who is OFF and the real staff roster (with .role tags
// from the Staff tab) — previously this matched a hardcoded list of 7 specific staff names
// via if/else branches, so a roster change (rename, new hire, someone leaving) silently left
// stations empty for anyone not in that original list, with no explanation. Now driven
// entirely by data already editable in the Staff/Departments tabs: eligibility = active,
// available today, and tagged for that station (directly or via the alias list above).
function autoFillDay(day, off, staffRows) {
  const available = staffRows.filter(s => s.active !== false && !off.includes(s.name))
  const assigned = new Set()
  const result = { off }
  STATIONS.forEach(station => {
    const roleNames = STATION_ROLE_ALIASES[station] || [station]
    const eligible = available.filter(s => !assigned.has(s.name) && (s.role||[]).some(r => roleNames.includes(r)))
    result[station] = eligible.map(s => s.name)
    eligible.forEach(s => assigned.add(s.name))
  })
  return result
}

function validateDay(day, dayData) {
  const errors = []
  const off = dayData.off||[]
  const required = OFF_RULES[day]

  if (required !== undefined && off.length !== required) {
    errors.push(`Should have ${required} staff OFF (currently ${off.length})`)
  }
  if (!(dayData.Kasir||[]).length) errors.push("Kasir is empty")
  if (!(dayData.Bar||[]).length)   errors.push("Bar is empty")
  if (!(dayData.Bakar||[]).length) errors.push("Bakar is empty")

  // Same person assigned to more than one station the same day — previously unchecked.
  const seen = new Set(), dupes = new Set()
  STATIONS.forEach(station => {
    (dayData[station]||[]).forEach(name => { if (seen.has(name)) dupes.add(name); seen.add(name) })
  })
  if (dupes.size) errors.push(`${[...dupes].join(", ")} assigned to more than one station`)

  return errors
}

export default function Schedule() {
  const [days,       setDays]       = useState({})
  const [staff,      setStaff]      = useState(DEFAULT_STAFF)
  const [staffRows,  setStaffRows]  = useState([])
  const [shiftStart, setShiftStart] = useState("08:00")
  const [shiftEnd,   setShiftEnd]   = useState("17:00")
  const [attendance, setAttendance] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [tab,        setTab]        = useState("schedule")
  const [editDay,    setEditDay]    = useState(null)
  const [editForm,   setEditForm]   = useState({})
  const [showShuffle,setShowShuffle]= useState(false)
  const [shuffleMap, setShuffleMap] = useState({})
  const [staffModal, setStaffModal] = useState(null)
  const [staffForm,  setStaffForm]  = useState(STAFF_EMPTY)
  const [staffSaving,setStaffSaving]= useState(false)
  const [showPin,    setShowPin]    = useState(false)
  const [depts,      setDepts]      = useState([])
  const [deptModal,  setDeptModal]  = useState(null)
  const [deptForm,   setDeptForm]   = useState(DEPT_EMPTY)
  const [deptSaving, setDeptSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data:sched }, { data:att }, { data:staffData }, { data:deptData }] = await Promise.all([
      supabase.from("schedules").select("*").eq("id","weekly-template").maybeSingle(),
      supabase.from("attendance").select("*").order("date",{ascending:false}).limit(200),
      supabase.from("staff").select("*").order("name"),
      supabase.from("departments").select("*").order("sort_order"),
    ])
    if (sched) {
      setDays(sched.days||{})
      setShiftStart(sched.shift_start||"08:00")
      setShiftEnd(sched.shift_end||"17:00")
      if (sched.staff_list) setStaff(sched.staff_list)
    }
    setAttendance(att||[])
    if (deptData?.length) setDepts(deptData)
    if (staffData?.length) {
      setStaffRows(staffData)
      const ownerRoles = new Set((deptData||[]).filter(d=>d.is_owner).map(d=>d.name))
      setStaff(staffData.filter(s=>s.active!==false && !(s.role||[]).some(r=>ownerRoles.has(r))).map(s=>s.name))
    }
    setLoading(false)
  }

  async function save(newDays, newStaff) {
    setSaving(true)
    await supabase.from("schedules").upsert({
      id:"weekly-template",
      days: newDays||days,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      staff_list: newStaff||staff,
      updated_at: new Date().toISOString()
    })
    setSaving(false)
  }

  async function saveStaff() {
    if (!staffForm.name.trim()) return
    if (staffForm.pin && (staffForm.pin.length!==4||!/^\d+$/.test(staffForm.pin))) { alert("PIN must be 4 digits"); return }
    setStaffSaving(true)
    const payload = { name:staffForm.name.trim(), role:staffForm.role||[], color:staffForm.color, pin:staffForm.pin||null, active:staffForm.active!==false }
    if (staffModal==="add") {
      await supabase.from("staff").insert({ ...payload, id:"STAFF-"+Date.now() })
    } else {
      await supabase.from("staff").update(payload).eq("id", staffModal.id)
    }
    await load()
    setStaffModal(null)
    setStaffForm(STAFF_EMPTY)
    setStaffSaving(false)
  }

  async function deleteStaff(s) {
    if (!confirm(`Delete ${s.name}? This cannot be undone.`)) return
    await supabase.from("staff").delete().eq("id", s.id)
    await load()
    setStaffModal(null)
  }

  async function saveDept() {
    if (!deptForm.name.trim()) return
    setDeptSaving(true)
    if (deptModal==="add") {
      await supabase.from("departments").insert({ id:"DEPT-"+Date.now(), name:deptForm.name.trim(), color:deptForm.color, sort_order:depts.length+1 })
    } else {
      await supabase.from("departments").update({ name:deptForm.name.trim(), color:deptForm.color }).eq("id", deptModal.id)
    }
    await load()
    setDeptModal(null)
    setDeptForm(DEPT_EMPTY)
    setDeptSaving(false)
  }

  async function deleteDept(d) {
    if (!confirm(`Delete department "${d.name}"? Staff with this role will keep the name.`)) return
    await supabase.from("departments").delete().eq("id", d.id)
    await load()
    setDeptModal(null)
  }

  function autoFillWeek() {
    const newDays = {}
    DAYS.forEach(day => {
      const off = DEFAULT_OFF[day]||[]
      newDays[day] = autoFillDay(day, off, staffRows)
    })
    setDays(newDays)
    save(newDays)
  }

  function openEdit(day) {
    const d = days[day]||{ off:[], Kasir:[], Bar:[], Bakar:[], Snack:[], Kitchen:[] }
    setEditForm(JSON.parse(JSON.stringify(d)))
    setEditDay(day)
  }

  // Toggling one person's OFF status used to regenerate the ENTIRE day via autoFillDay,
  // silently wiping out any manual station assignment made earlier in the same edit session
  // for every other staff member — not just the one being toggled. Now it only touches the
  // specific person: going OFF removes them from whatever station they're in (can't work
  // while off); coming back ON just clears the OFF flag and leaves stations untouched (a
  // manager places them via the station buttons, or hits "Auto-fill Roles" for a full reset).
  function toggleOff(name) {
    setEditForm(f => {
      const off = f.off||[]
      const goingOff = !off.includes(name)
      const newOff = goingOff ? [...off, name] : off.filter(n=>n!==name)
      const next = { ...f, off: newOff }
      if (goingOff) {
        STATIONS.forEach(station => {
          if ((next[station]||[]).includes(name)) next[station] = next[station].filter(n=>n!==name)
        })
      }
      return next
    })
  }

  function toggleStation(station, name) {
    setEditForm(f => {
      const cur = f[station]||[]
      return { ...f, [station]: cur.includes(name)?cur.filter(n=>n!==name):[...cur,name] }
    })
  }

  async function saveDay() {
    const newDays = { ...days, [editDay]: editForm }
    setDays(newDays)
    await save(newDays)
    setEditDay(null)
  }

  // Shuffle: replace staff names across the whole schedule
  function applyShuffled() {
    const newDays = {}
    DAYS.forEach(day => {
      const d = days[day]||{}
      const replaceName = n => shuffleMap[n]||n
      newDays[day] = {
        off:     (d.off||[]).map(replaceName),
        Kasir:   (d.Kasir||[]).map(replaceName),
        Bar:     (d.Bar||[]).map(replaceName),
        Bakar:   (d.Bakar||[]).map(replaceName),
        Snack:   (d.Snack||[]).map(replaceName),
        Kitchen: (d.Kitchen||[]).map(replaceName),
      }
    })
    setDays(newDays)
    save(newDays)
    setShowShuffle(false)
    setShuffleMap({})
  }

  function shareWhatsApp() {
    let txt = "*JADWAL WARUNG*\n\n"
    DAYS.forEach(day => {
      const d = days[day]||{}
      txt += `*${day.toUpperCase()}*\n`
      txt += `OFF: ${(d.off||[]).join(", ")||"-"}\n`
      STATIONS.forEach(s => { txt += `${s}: ${(d[s]||[]).join(", ")||"-"}\n` })
      txt += "\n"
    })
    if (navigator.share) navigator.share({ text:txt })
    else { navigator.clipboard.writeText(txt); alert("Copied to clipboard!") }
  }

  const todayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()]
  const todayStr  = new Date().toISOString().slice(0,10)
  const todayAtt  = attendance.filter(a=>a.date===todayStr)
  const todaySchedule = days[todayName]||{}

  // Validation for all days
  const allErrors = {}
  DAYS.forEach(day => {
    const errs = validateDay(day, days[day]||{})
    if (errs.length) allErrors[day] = errs
  })
  const totalErrors = Object.values(allErrors).flat().length

  if (loading) return <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div>

  return (
    <div>
      {/* Top bar */}
      <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center", flexWrap:"wrap" }}>
        {[["schedule","Schedule"],["attendance","Attendance"],["staff","Staff"],["depts","Departments"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} className={"bo-btn bo-btn-sm "+(tab===t?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
        ))}
        {tab==="schedule" && <>
          <button onClick={autoFillWeek} className="bo-btn bo-btn-ghost bo-btn-sm">Auto-Fill Week</button>
          <button onClick={()=>{ const m={}; staff.forEach(n=>m[n]=n); setShuffleMap(m); setShowShuffle(true) }} className="bo-btn bo-btn-ghost bo-btn-sm">Shuffle Staff</button>
        </>}
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ fontSize:12, color:"var(--ink4)" }}>Shift:</span>
          <input type="time" value={shiftStart} onChange={e=>setShiftStart(e.target.value)} onBlur={()=>save()}
            style={{ border:"1px solid var(--surface3)", borderRadius:6, padding:"3px 8px", fontSize:12 }} />
          <span style={{ fontSize:12, color:"var(--ink4)" }}>→</span>
          <input type="time" value={shiftEnd} onChange={e=>setShiftEnd(e.target.value)} onBlur={()=>save()}
            style={{ border:"1px solid var(--surface3)", borderRadius:6, padding:"3px 8px", fontSize:12 }} />
          <button onClick={shareWhatsApp} className="bo-btn bo-btn-sm" style={{ background:"#25D366", color:"#fff", border:"none" }}>Share WA</button>
          {saving && <span style={{ fontSize:11, color:"var(--ink4)" }}>Saving...</span>}
        </div>
      </div>

      {/* Validation banner */}
      {totalErrors > 0 && tab==="schedule" && (
        <div style={{ padding:"10px 14px", background:"var(--amber-lt)", border:"1px solid var(--amber)", borderRadius:"var(--r)", marginBottom:12, fontSize:12, color:"var(--amber)", fontWeight:600 }}>
          {totalErrors} validation issue{totalErrors>1?"s":""}: {Object.entries(allErrors).map(([d,e])=>`${DAY_SHORT[d]}: ${e.join(", ")}`).join(" · ")}
        </div>
      )}

      {tab==="schedule" && (
        <>
          {/* Today highlight */}
          <div className="bo-card" style={{ marginBottom:16, background:"var(--brand-lt)", border:"1.5px solid var(--brand)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontSize:14, fontWeight:800, color:"var(--brand)" }}>Today — {todayName}</div>
              <div style={{ fontSize:12, color:"var(--ink4)" }}>Shift {shiftStart} – {shiftEnd}</div>
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {(todaySchedule.off||[]).length>0 && (
                <span style={{ padding:"3px 10px", borderRadius:20, background:"var(--red-lt)", color:"var(--red)", fontSize:12, fontWeight:700 }}>
                  OFF: {(todaySchedule.off||[]).join(", ")}
                </span>
              )}
              {STATIONS.map(s=>(todaySchedule[s]||[]).length>0&&(
                <span key={s} style={{ padding:"3px 10px", borderRadius:20, background:STATION_COLORS[s]+"22", color:STATION_COLORS[s], fontSize:12, fontWeight:700 }}>
                  {s}: {(todaySchedule[s]||[]).join(", ")}
                </span>
              ))}
            </div>
          </div>

          {/* Weekly grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:8, overflowX:"auto", WebkitOverflowScrolling:"touch" }} className="schedule-week-grid">
            {DAYS.map(day => {
              const d = days[day]||{}
              const isToday = day===todayName
              const errs = allErrors[day]
              return (
                <div key={day} style={{ background:"#fff", border:"1.5px solid "+(errs?"var(--amber)":isToday?"var(--brand)":"var(--surface3)"), borderRadius:12, overflow:"hidden" }}>
                  <div style={{ padding:"7px 10px", background:isToday?"var(--brand)":errs?"var(--amber-lt)":"var(--surface)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:12, fontWeight:800, color:isToday?"#fff":"var(--ink)" }}>{DAY_SHORT[day]}</span>
                    <button onClick={()=>openEdit(day)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:isToday?"rgba(255,255,255,0.8)":"var(--brand)", fontWeight:600, padding:0 }}>Edit</button>
                  </div>
                  <div style={{ padding:"8px 10px", fontSize:11 }}>
                    {(d.off||[]).length>0 && (
                      <div style={{ marginBottom:5 }}>
                        <div style={{ fontSize:9, fontWeight:700, color:"var(--red)", textTransform:"uppercase", marginBottom:1 }}>OFF</div>
                        <div style={{ color:"var(--red)" }}>{(d.off||[]).join(", ")}</div>
                      </div>
                    )}
                    {STATIONS.map(s=>(d[s]||[]).length>0&&(
                      <div key={s} style={{ marginBottom:3 }}>
                        <div style={{ fontSize:9, fontWeight:700, color:STATION_COLORS[s], textTransform:"uppercase", marginBottom:1 }}>{s}</div>
                        <div style={{ color:"var(--ink)", fontWeight:600 }}>{(d[s]||[]).join(", ")}</div>
                      </div>
                    ))}
                    {STATIONS.every(s=>!(d[s]||[]).length)&&!(d.off||[]).length&&(
                      <div style={{ color:"var(--ink5)", textAlign:"center", padding:"6px 0" }}>Empty</div>
                    )}
                    {errs && <div style={{ marginTop:4, fontSize:9, color:"var(--amber)", fontWeight:700 }}>{errs.join(" · ")}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab==="attendance" && (
        <div>
          <div className="bo-card" style={{ marginBottom:16 }}>
            <div className="bo-card-title">Today — {todayStr}</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:8 }}>
              {staff.filter(n=>!(todaySchedule.off||[]).includes(n)).map(name=>{
                const att = todayAtt.find(a=>a.staff_name===name)
                const station = STATIONS.find(s=>(todaySchedule[s]||[]).includes(name))
                return (
                  <div key={name} style={{ padding:"10px 12px", border:"1.5px solid "+(att?"var(--green)":"var(--surface3)"), borderRadius:10, background:att?"var(--green-lt)":"#fff" }}>
                    <div style={{ fontSize:13, fontWeight:700 }}>{name}</div>
                    <div style={{ fontSize:10, color:STATION_COLORS[station]||"var(--ink4)", fontWeight:600, marginBottom:3 }}>{station||"—"}</div>
                    {att?(
                      <>
                        <div style={{ fontSize:11, color:"var(--green)", fontWeight:600 }}>IN {new Date(att.clock_in).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}</div>
                        {att.clock_out&&<div style={{ fontSize:11, color:"var(--ink4)" }}>OUT {new Date(att.clock_out).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}</div>}
                        {att.clock_in_photo&&<img src={att.clock_in_photo} style={{ width:"100%",borderRadius:6,marginTop:4 }} />}
                        <span style={{ fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:10,background:att.status==="late"?"var(--red-lt)":"var(--green-lt)",color:att.status==="late"?"var(--red)":"var(--green)" }}>{att.status==="late"?"Late":"On Time"}</span>
                      </>
                    ):(
                      <div style={{ fontSize:11, color:"var(--ink5)" }}>Not clocked in</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="bo-card" style={{ padding:0, overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
            <table className="bo-table">
              <thead><tr><th>Date</th><th>Staff</th><th>Station</th><th>Clock In</th><th>Clock Out</th><th>Status</th><th>Photo</th></tr></thead>
              <tbody>
                {attendance.map(a=>(
                  <tr key={a.id}>
                    <td style={{ fontSize:12 }}>{a.date}</td>
                    <td style={{ fontWeight:700 }}>{a.staff_name}</td>
                    <td style={{ fontSize:12 }}>{a.scheduled_station||"—"}</td>
                    <td style={{ fontSize:12 }}>{a.clock_in?new Date(a.clock_in).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}):"—"}</td>
                    <td style={{ fontSize:12 }}>{a.clock_out?new Date(a.clock_out).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}):"—"}</td>
                    <td><span className={"bo-badge "+(a.status==="late"?"bo-badge-red":"bo-badge-green")}>{a.status||"—"}</span></td>
                    <td>{a.clock_in_photo&&<img src={a.clock_in_photo} style={{ width:36,height:36,borderRadius:6,objectFit:"cover" }} />}</td>
                  </tr>
                ))}
                {attendance.length===0&&<tr><td colSpan={7} style={{ textAlign:"center",color:"var(--ink5)",padding:"32px 0" }}>No attendance records yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="staff" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontSize:13, color:"var(--ink4)" }}>{staffRows.length} staff members · changes sync to schedule automatically</div>
            <button onClick={()=>{ setStaffForm(STAFF_EMPTY); setStaffModal("add") }} className="bo-btn bo-btn-primary bo-btn-sm">+ Add Staff</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
            {staffRows.map(s=>{
              const color = s.color||"#3B82F6"
              const initials = (s.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()
              return (
                <div key={s.id} style={{ background:"#fff", border:"1.5px solid var(--surface3)", borderRadius:12, overflow:"hidden", opacity:s.active===false?0.5:1 }}>
                  <div style={{ background:color+"18", borderBottom:"1px solid "+color+"22", padding:"12px 14px", display:"flex", gap:10, alignItems:"center" }}>
                    <div style={{ width:38, height:38, borderRadius:"50%", background:color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:"#fff", flexShrink:0 }}>{initials}</div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:800 }}>{s.name}</div>
                      <div style={{ fontSize:11, color, fontWeight:700 }}>{(s.role||[]).join(", ")||"—"}</div>
                    </div>
                    <div style={{ marginLeft:"auto", width:8, height:8, borderRadius:"50%", background:s.active!==false?"var(--green)":"var(--surface3)" }} />
                  </div>
                  <div style={{ display:"flex", borderTop:"1px solid var(--surface3)" }}>
                    <button onClick={()=>{ setStaffForm({...s,pin:s.pin||"",role:s.role||[]}); setStaffModal(s) }} style={{ flex:1, padding:"9px", border:"none", background:"none", fontSize:12, fontWeight:600, cursor:"pointer", color:"var(--brand)" }}>Edit</button>
                    <button onClick={()=>deleteStaff(s)} style={{ flex:1, padding:"9px", border:"none", borderLeft:"1px solid var(--surface3)", background:"none", fontSize:12, fontWeight:600, cursor:"pointer", color:"var(--red)" }}>Delete</button>
                  </div>
                </div>
              )
            })}
            {staffRows.length===0&&<div style={{ gridColumn:"1/-1", textAlign:"center", color:"var(--ink5)", padding:40 }}>No staff yet</div>}
          </div>
        </div>
      )}

      {tab==="depts" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontSize:13, color:"var(--ink4)" }}>{depts.length} departments · used as staff roles across the system</div>
            <button onClick={()=>{ setDeptForm(DEPT_EMPTY); setDeptModal("add") }} className="bo-btn bo-btn-primary bo-btn-sm">+ Add Department</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10 }}>
            {depts.map(d=>(
              <div key={d.id} style={{ background:"#fff", border:"1.5px solid var(--surface3)", borderRadius:12, overflow:"hidden" }}>
                <div style={{ background:d.color+"18", borderBottom:"1px solid "+d.color+"22", padding:"14px 16px", display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:d.color, flexShrink:0 }} />
                  <div style={{ fontSize:14, fontWeight:800 }}>{d.name}</div>
                </div>
                <div style={{ display:"flex", borderTop:"1px solid var(--surface3)" }}>
                  <button onClick={()=>{ setDeptForm({name:d.name,color:d.color}); setDeptModal(d) }} style={{ flex:1, padding:"9px", border:"none", background:"none", fontSize:12, fontWeight:600, cursor:"pointer", color:"var(--brand)" }}>Edit</button>
                  <button onClick={()=>deleteDept(d)} style={{ flex:1, padding:"9px", border:"none", borderLeft:"1px solid var(--surface3)", background:"none", fontSize:12, fontWeight:600, cursor:"pointer", color:"var(--red)" }}>Delete</button>
                </div>
              </div>
            ))}
            {depts.length===0&&<div style={{ gridColumn:"1/-1", textAlign:"center", color:"var(--ink5)", padding:40 }}>No departments yet</div>}
          </div>
        </div>
      )}

      {/* Edit Day Modal */}
      {editDay && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setEditDay(null)}>
          <div className="bo-modal" style={{ maxWidth:520 }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">Edit — {editDay}</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>
                  OFF rule: {OFF_RULES[editDay]===0?"Full team (no one off)":`${OFF_RULES[editDay]} person${OFF_RULES[editDay]>1?"s":""} off`}
                </div>
              </div>
              <button className="bo-modal-close" onClick={()=>setEditDay(null)}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div className="bo-form-row">
                <label className="bo-label">Day Off — click to toggle (auto-cascades roles)</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {staff.map(name=>{
                    const isOff=(editForm.off||[]).includes(name)
                    return (
                      <button key={name} onClick={()=>toggleOff(name)}
                        style={{ padding:"6px 14px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer",
                          border:"1.5px solid "+(isOff?"var(--red)":"var(--surface3)"),
                          background:isOff?"var(--red-lt)":"#fff", color:isOff?"var(--red)":"var(--ink4)" }}>
                        {isOff?"✕ ":""}{name}
                      </button>
                    )
                  })}
                </div>
                {validateDay(editDay,editForm).length>0 && (
                  <div style={{ marginTop:6, fontSize:11, color:"var(--amber)", fontWeight:600 }}>
                    {validateDay(editDay,editForm).join(" · ")}
                  </div>
                )}
              </div>
              {STATIONS.map(station=>(
                <div key={station} className="bo-form-row">
                  <label className="bo-label" style={{ color:STATION_COLORS[station] }}>
                    {station} {["Kasir","Bar","Bakar"].includes(station)&&<span style={{ color:"var(--red)" }}>*</span>}
                  </label>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {staff.filter(n=>!(editForm.off||[]).includes(n)).map(name=>{
                      const sel=(editForm[station]||[]).includes(name)
                      return (
                        <button key={name} onClick={()=>toggleStation(station,name)}
                          style={{ padding:"6px 14px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer",
                            border:"1.5px solid "+(sel?STATION_COLORS[station]:"var(--surface3)"),
                            background:sel?STATION_COLORS[station]+"22":"#fff", color:sel?STATION_COLORS[station]:"var(--ink4)" }}>
                          {name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setEditDay(null)} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={()=>{ setEditForm(autoFillDay(editDay,editForm.off||[],staffRows)) }} className="bo-btn bo-btn-ghost">Auto-fill Roles</button>
              <button onClick={saveDay} className="bo-btn bo-btn-primary">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Shuffle Modal */}
      {showShuffle && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setShowShuffle(false)}>
          <div className="bo-modal" style={{ maxWidth:440 }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">Shuffle Staff</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>Map old names to new — schedule updates instantly</div>
              </div>
              <button className="bo-modal-close" onClick={()=>setShowShuffle(false)}>✕</button>
            </div>
            <div className="bo-modal-body">
              {staff.map(name=>(
                <div key={name} style={{ display:"grid", gridTemplateColumns:"1fr 24px 1fr", gap:8, alignItems:"center", marginBottom:10 }}>
                  <div style={{ padding:"8px 12px", background:"var(--surface)", borderRadius:"var(--r)", fontSize:13, fontWeight:600 }}>{name}</div>
                  <div style={{ textAlign:"center", color:"var(--ink4)" }}>→</div>
                  <select value={shuffleMap[name]||name} onChange={e=>setShuffleMap(m=>({...m,[name]:e.target.value}))} className="bo-select" style={{ fontSize:13 }}>
                    {staff.map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ fontSize:11, color:"var(--ink4)", marginTop:8 }}>
                This replaces names in the schedule. Use to swap who covers a role this week.
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setShowShuffle(false)} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={applyShuffled} className="bo-btn bo-btn-primary">Apply Shuffle</button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Add/Edit Modal */}
      {staffModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setStaffModal(null)}>
          <div className="bo-modal" style={{ maxWidth:420 }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">{staffModal==="add"?"Add Staff":"Edit — "+staffForm.name}</div>
              <button className="bo-modal-close" onClick={()=>setStaffModal(null)}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div className="bo-form-row">
                <label className="bo-label">Name *</label>
                <input value={staffForm.name} onChange={e=>setStaffForm(f=>({...f,name:e.target.value}))} className="bo-input" autoFocus placeholder="Full name" />
              </div>
              <div className="bo-form-row">
                <label className="bo-label">Departments — click to toggle (can pick more than one)</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {depts.map(d=>{
                    const sel = (staffForm.role||[]).includes(d.name)
                    return (
                      <button key={d.id} type="button" onClick={()=>setStaffForm(f=>{
                        const cur = f.role||[]
                        return { ...f, role: cur.includes(d.name) ? cur.filter(r=>r!==d.name) : [...cur,d.name] }
                      })}
                        style={{ padding:"6px 14px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer",
                          border:"1.5px solid "+(sel?d.color:"var(--surface3)"),
                          background:sel?d.color+"22":"#fff", color:sel?d.color:"var(--ink4)" }}>
                        {d.name}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="bo-form-row">
                <label className="bo-label">PIN (4 digits — for POS login)</label>
                <div style={{ position:"relative" }}>
                  <input type={showPin?"text":"password"} maxLength={4} value={staffForm.pin||""}
                    onChange={e=>setStaffForm(f=>({...f,pin:e.target.value.replace(/\D/g,"").slice(0,4)}))}
                    className="bo-input" placeholder="••••" style={{ letterSpacing:4, fontSize:18, paddingRight:40 }} />
                  <button type="button" onClick={()=>setShowPin(p=>!p)}
                    style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:15, color:"var(--ink4)" }}>
                    {showPin?"🙈":"👁"}
                  </button>
                </div>
              </div>
              <div className="bo-form-row">
                <label className="bo-label">Color</label>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {STAFF_COLORS.map(c=>(
                    <div key={c} onClick={()=>setStaffForm(f=>({...f,color:c}))}
                      style={{ width:28, height:28, borderRadius:"50%", background:c, cursor:"pointer",
                        border:staffForm.color===c?"3px solid #0A1628":"3px solid transparent", boxSizing:"border-box" }} />
                  ))}
                </div>
              </div>
              <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginTop:4 }}>
                <input type="checkbox" checked={staffForm.active!==false} onChange={e=>setStaffForm(f=>({...f,active:e.target.checked}))}
                  style={{ width:16, height:16, accentColor:"var(--brand)" }} />
                <span style={{ fontSize:13, fontWeight:600 }}>Active (appears in schedule)</span>
              </label>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setStaffModal(null)} className="bo-btn bo-btn-ghost">Cancel</button>
              {staffModal!=="add" && <button onClick={()=>deleteStaff(staffModal)} className="bo-btn bo-btn-danger">Delete</button>}
              <button onClick={saveStaff} disabled={staffSaving||!staffForm.name.trim()} className="bo-btn bo-btn-primary">
                {staffSaving?"Saving...":staffModal==="add"?"Add":"Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Department Add/Edit Modal */}
      {deptModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setDeptModal(null)}>
          <div className="bo-modal" style={{ maxWidth:380 }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">{deptModal==="add"?"Add Department":"Edit — "+deptModal.name}</div>
              <button className="bo-modal-close" onClick={()=>setDeptModal(null)}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div className="bo-form-row">
                <label className="bo-label">Department Name *</label>
                <input value={deptForm.name} onChange={e=>setDeptForm(f=>({...f,name:e.target.value}))} className="bo-input" autoFocus placeholder="e.g. Snack, Bar, Kasir" />
              </div>
              <div className="bo-form-row">
                <label className="bo-label">Color</label>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {DEPT_COLORS.map(c=>(
                    <div key={c} onClick={()=>setDeptForm(f=>({...f,color:c}))}
                      style={{ width:28, height:28, borderRadius:8, background:c, cursor:"pointer",
                        border:deptForm.color===c?"3px solid #0A1628":"3px solid transparent", boxSizing:"border-box" }} />
                  ))}
                </div>
                <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:deptForm.color }} />
                  <span style={{ fontSize:13, fontWeight:700, color:deptForm.color }}>{deptForm.name||"Preview"}</span>
                </div>
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setDeptModal(null)} className="bo-btn bo-btn-ghost">Cancel</button>
              {deptModal!=="add" && <button onClick={()=>deleteDept(deptModal)} className="bo-btn bo-btn-danger">Delete</button>}
              <button onClick={saveDept} disabled={deptSaving||!deptForm.name.trim()} className="bo-btn bo-btn-primary">
                {deptSaving?"Saving...":deptModal==="add"?"Add":"Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
