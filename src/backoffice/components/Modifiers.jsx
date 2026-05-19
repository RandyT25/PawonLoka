import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n) {
  if (n === 0) return "free"
  return (n > 0 ? "+" : "") + "Rp " + Math.abs(Number(n)).toLocaleString("id-ID")
}

const TYPES = [
  { value:"single", label:"Single select (choose one)" },
  { value:"multi",  label:"Multi select (choose many)" },
  { value:"size",   label:"Size selector" },
]

const TYPE_COLORS = {
  single: { bg:"#E3FCEF", color:"#00875A" },
  multi:  { bg:"#E8F0FF", color:"#0066FF" },
  size:   { bg:"#FFF7E6", color:"#FF8B00" },
}

const EMPTY_MOD = { name:"", type:"single", required:false, linkedCats:[], linkedProducts:[] }
const EMPTY_OPT = { name:"", price:0 }

export default function Modifiers() {
  const [modifiers,  setModifiers]  = useState([])
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(null)
  const [form,       setForm]       = useState(EMPTY_MOD)
  const [options,    setOptions]    = useState([{ ...EMPTY_OPT }])
  const [saving,     setSaving]     = useState(false)
  const [expanded,   setExpanded]   = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: mods }, { data: cats }] = await Promise.all([
      supabase.from("modifier_groups").select("*, modifier_options(*)").order("name"),
      supabase.from("categories").select("*").order("sort"),
    ])
    setModifiers(mods || [])
    setCategories(cats || [])
    setLoading(false)
  }

  function openAdd() {
    setForm(EMPTY_MOD)
    setOptions([{ ...EMPTY_OPT }])
    setModal("add")
  }

  function openEdit(m) {
    setForm({
      id: m.id,
      name: m.name,
      type: m.type || "single",
      required: m.required || false,
      linkedCats: m.linked_cats || [],
      linkedProducts: m.linked_products || [],
    })
    setOptions(m.modifier_options?.length
      ? m.modifier_options.map(o => ({ id:o.id, name:o.name, price:o.price||0 }))
      : [{ ...EMPTY_OPT }]
    )
    setModal("edit")
  }

  function closeModal() { setModal(null); setForm(EMPTY_MOD); setOptions([{ ...EMPTY_OPT }]) }

  function addOption()       { setOptions(o => [...o, { ...EMPTY_OPT }]) }
  function removeOption(i)   { setOptions(o => o.filter((_,idx) => idx !== i)) }
  function updateOption(i,k,v){ setOptions(o => o.map((x,idx) => idx===i ? {...x,[k]:v} : x)) }

  function toggleLinkedCat(catName) {
    setForm(f => ({
      ...f,
      linkedCats: f.linkedCats.includes(catName)
        ? f.linkedCats.filter(c => c !== catName)
        : [...f.linkedCats, catName]
    }))
  }

  async function save() {
    if (!form.name) return
    const validOpts = options.filter(o => o.name.trim())
    if (!validOpts.length) { alert("Add at least one option"); return }
    setSaving(true)

    const gid = modal === "add" ? "MOD-" + Date.now() : form.id
    const payload = {
      name:             form.name.trim(),
      type:             form.type,
      required:         !!form.required,
      linked_cats:      form.linkedCats,
      linked_products:  form.linkedProducts,
    }

    if (modal === "add") {
      await supabase.from("modifier_groups").insert({ ...payload, id: gid })
    } else {
      await supabase.from("modifier_groups").update(payload).eq("id", form.id)
      await supabase.from("modifier_options").delete().eq("group_id", form.id)
    }

    const opts = validOpts.map((o, i) => ({
      id:       `${gid}-OPT-${i}-${Date.now()}`,
      group_id: gid,
      name:     o.name.trim(),
      price:    parseFloat(o.price) || 0,
    }))
    if (opts.length) await supabase.from("modifier_options").insert(opts)

    await load()
    closeModal()
    setSaving(false)
  }

  async function deleteModifier(id, name) {
    if (!confirm(`Delete modifier "${name}"?`)) return
    await supabase.from("modifier_options").delete().eq("group_id", id)
    await supabase.from("modifier_groups").delete().eq("id", id)
    setModifiers(prev => prev.filter(m => m.id !== id))
  }

  function toggleExpand(id) {
    setExpanded(e => ({ ...e, [id]: !e[id] }))
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <span style={{ fontSize:13, fontWeight:600, color:"var(--ink4)" }}>
          {modifiers.length} modifier groups
        </span>
        <button onClick={openAdd} className="bo-btn bo-btn-primary">+ Add Modifier Group</button>
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:"var(--ink5)" }}>Loading...</div>
      ) : modifiers.length === 0 ? (
        <div style={{ textAlign:"center", padding:60, color:"var(--ink5)" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>✏️</div>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>No modifier groups yet</div>
          <div style={{ fontSize:13, marginBottom:16 }}>Add modifiers like Sugar Level, Spice Level, Size, Extras</div>
          <button onClick={openAdd} className="bo-btn bo-btn-primary">+ Add Modifier Group</button>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:12 }}>
          {modifiers.map(m => {
            const typeColor = TYPE_COLORS[m.type] || TYPE_COLORS.single
            const typeLabel = TYPES.find(t=>t.value===m.type)?.label || m.type
            const linkedCats = m.linked_cats || []
            const isExpanded = expanded[m.id]

            return (
              <div key={m.id} style={{ background:"#fff", border:"1.5px solid var(--surface3)", borderRadius:16, overflow:"hidden" }}>
                {/* Header */}
                <div style={{ padding:"14px 16px", borderBottom:"1px solid var(--surface2)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:15, fontWeight:800, color:"var(--ink)" }}>{m.name}</div>
                      <div style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap" }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10, background:typeColor.bg, color:typeColor.color }}>
                          {typeLabel}
                        </span>
                        <span className={"bo-badge " + (m.required ? "bo-badge-red" : "bo-badge-green")}>
                          {m.required ? "Required" : "Optional"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Options */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom: linkedCats.length ? 10 : 0 }}>
                    {(m.modifier_options||[]).map(o => (
                      <span key={o.id} style={{ fontSize:12, fontWeight:600, padding:"4px 10px", borderRadius:20, background:"var(--surface)", border:"1px solid var(--surface3)", color:"var(--ink3)" }}>
                        {o.name}
                        {o.price !== 0 && (
                          <span style={{ color: o.price > 0 ? "var(--green)" : "var(--red)", marginLeft:4 }}>
                            {fmt(o.price)}
                          </span>
                        )}
                      </span>
                    ))}
                    {!(m.modifier_options||[]).length && (
                      <span style={{ fontSize:11, color:"var(--ink5)" }}>No options yet</span>
                    )}
                  </div>

                  {/* Linked categories */}
                  {linkedCats.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <span style={{ fontSize:11, color:"var(--ink5)", fontWeight:600 }}>Linked to: </span>
                      {linkedCats.map(catName => {
                        const cat = categories.find(c => c.name === catName || c.id === catName)
                        return cat ? (
                          <span key={catName} style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10, background:(cat.color||"#666")+"22", color:cat.color||"#666", marginLeft:4 }}>
                            {cat.icon} {cat.name}
                          </span>
                        ) : (
                          <span key={catName} style={{ fontSize:11, color:"var(--ink5)", marginLeft:4 }}>{catName}</span>
                        )
                      })}
                    </div>
                  )}
                  {linkedCats.length === 0 && (
                    <div style={{ fontSize:11, color:"var(--ink5)", marginTop:6 }}>Not linked to any category</div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display:"flex", borderTop:"1px solid var(--surface3)" }}>
                  <button onClick={() => openEdit(m)} style={{ flex:1, padding:"9px 0", fontSize:12, fontWeight:600, color:"var(--ink4)", background:"none", border:"none", borderRight:"1px solid var(--surface3)", cursor:"pointer" }}>Edit</button>
                  <button onClick={() => deleteModifier(m.id, m.name)} style={{ flex:1, padding:"9px 0", fontSize:12, fontWeight:600, color:"var(--red)", background:"none", border:"none", cursor:"pointer" }}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="bo-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="bo-modal" style={{ maxWidth:560, maxHeight:"92vh" }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">{modal==="add" ? "Add Modifier Group" : "Edit Modifier Group"}</div>
              <button className="bo-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto" }}>

              {/* Name */}
              <div className="bo-form-row">
                <label className="bo-label">Group Name *</label>
                <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                  className="bo-input" placeholder="e.g. Sugar Level, Spice Level, Size" autoFocus />
              </div>

              {/* Type + Required */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div>
                  <label className="bo-label">Type *</label>
                  <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="bo-select">
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div style={{ paddingTop:22 }}>
                  <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
                    <input type="checkbox" checked={!!form.required} onChange={e=>setForm(f=>({...f,required:e.target.checked}))}
                      style={{ width:16, height:16, accentColor:"var(--brand)" }} />
                    <span style={{ fontSize:13, fontWeight:600, color:"var(--ink3)" }}>Required (customer must choose)</span>
                  </label>
                </div>
              </div>

              {/* Options */}
              <div className="bo-form-row">
                <label className="bo-label">Options * <span style={{ fontSize:10, color:"var(--ink5)", fontWeight:400 }}>— use negative price for discounts (e.g. Small = -4000)</span></label>
                {options.map((o, i) => (
                  <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 140px 36px", gap:8, marginBottom:8 }}>
                    <input value={o.name} onChange={e=>updateOption(i,"name",e.target.value)}
                      className="bo-input" placeholder="Option name (e.g. No Sugar)" />
                    <input type="number" value={o.price} onChange={e=>updateOption(i,"price",e.target.value)}
                      className="bo-input" placeholder="Price adj. (0=free)" />
                    <button onClick={()=>removeOption(i)} className="bo-btn bo-btn-danger bo-btn-sm" style={{ padding:"0 10px" }}>✕</button>
                  </div>
                ))}
                <button onClick={addOption} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ marginTop:4 }}>
                  + Add option
                </button>
              </div>

              {/* Link to categories */}
              <div style={{ borderTop:"1px solid var(--surface3)", paddingTop:14 }}>
                <label className="bo-label">Link to Categories</label>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:6 }}>
                  {categories.map(c => (
                    <label key={c.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:8, border:"1px solid var(--surface3)", cursor:"pointer", background: form.linkedCats.includes(c.name) ? "var(--brand-lt)" : "#fff" }}>
                      <input type="checkbox"
                        checked={form.linkedCats.includes(c.name) || form.linkedCats.includes(c.id)}
                        onChange={() => toggleLinkedCat(c.name)}
                        style={{ accentColor:"var(--brand)" }} />
                      <span style={{ fontSize:16 }}>{c.icon}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:"var(--ink3)" }}>{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="bo-modal-footer">
              <button onClick={closeModal} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving || !form.name} className="bo-btn bo-btn-primary">
                {saving ? "Saving..." : modal==="add" ? "Add Modifier Group" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
