import React, { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "../../lib/supabase"
import { isFoodCategory } from "../lib/ingredientCategories"
import { unitPriceFor } from "../../shared/unitConversion"

const UNIT_TO_BASE = {
  gr:1,g:1,kg:1000,ml:1,mL:1,L:1000,Galon:19000,
  pcs:1,butir:1,biji:1,buah:1,lembar:1,ekor:1,Ekor:1,
  tsp:5,tbsp:15,cup:240,portion:1,porsi:1,slice:1,
  bungkus:1,pack:1,sachet:1,ikat:1,botol:1,Can:1,
}
const UNITS_FALLBACK = Object.keys(UNIT_TO_BASE)
function toBase(qty, unit) { return (qty||0) * (UNIT_TO_BASE[unit] || 1) }
function fmtRp(n) { if (!n || isNaN(n)) return "—"; return "Rp " + Math.round(n).toLocaleString("id-ID") }
function fmtUnit(n) { if (!n || isNaN(n)) return "0"; return Number(n.toFixed(2)).toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) }
function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0 }

function IngSearch({ value, onChange, ingredients, subRecipes, showSubs = true }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [cursor, setCursor] = useState(-1)
  const ref = React.useRef(null)
  const listRef = React.useRef(null)

  const all = [
    ...ingredients.filter(i => i.category !== "Semi-finished" && isFoodCategory(i.category)).map(i => ({ ...i, _g:"Raw" })),
    // Use ingredient_id (not the sub_recipes row's own id) as the lookup key — that's what
    // recipe lines actually store for a sub-recipe-as-ingredient, per handleIngChange's
    // resolution below. Using s.id here made this component unable to resolve/display any
    // existing line referencing a sub-recipe nested inside another sub-recipe.
    ...(showSubs ? subRecipes.map(s => ({ ...s, id: s.ingredient_id, _g:"Sub" })) : []),
  ]
  const filtered = q ? all.filter(x => x.name.toLowerCase().includes(q.toLowerCase())) : all
  const sel = all.find(x => x.id === value)

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(""); setCursor(-1) } }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  function handleKey(e) {
    if (!open) { if (e.key==="Enter"||e.key==="ArrowDown") setOpen(true); return }
    if (e.key==="ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c+1, filtered.length-1)) }
    else if (e.key==="ArrowUp") { e.preventDefault(); setCursor(c => Math.max(c-1, 0)) }
    else if (e.key==="Enter") {
      e.preventDefault()
      if (cursor >= 0 && filtered[cursor]) { onChange(filtered[cursor]); setOpen(false); setQ(""); setCursor(-1) }
    }
    else if (e.key==="Escape") { setOpen(false); setQ(""); setCursor(-1) }
  }

  useEffect(() => {
    if (cursor >= 0 && listRef.current) {
      const el = listRef.current.children[cursor]
      if (el) el.scrollIntoView({ block:"nearest" })
    }
  }, [cursor])

  return (
    <div ref={ref} style={{ position:"relative", flex:1, minWidth:0 }}>
      <div onClick={()=>{ setOpen(o=>!o); setQ(""); setCursor(-1) }}
        className="bo-select"
        style={{ cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 10px", userSelect:"none" }}>
        <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontSize:13, color:sel?"var(--ink)":"var(--ink4)" }}>
          {sel ? `${sel.name}${(sel.cost_per_unit||sel.market_cost)>0?` · Rp ${Math.round(sel.cost_per_unit||sel.market_cost).toLocaleString("id-ID")}/${sel.unit}`+(sel.cost_per_unit===0&&sel.market_cost>0?" (est.)":""):""}` : "— Select ingredient or sub-recipe —"}
        </span>
        <span style={{ fontSize:9, color:"var(--ink4)", flexShrink:0, marginLeft:4 }}>▼</span>
      </div>
      {open && (
        <div style={{ position:"absolute", zIndex:9999, top:"calc(100% + 2px)", left:0, right:0, background:"#fff", border:"1.5px solid var(--brand,#2563eb)", borderRadius:8, boxShadow:"0 8px 24px rgba(0,0,0,0.12)" }}>
          <input autoFocus value={q} onChange={e=>{setQ(e.target.value);setCursor(-1)}}
            onKeyDown={handleKey} placeholder="Type to search..."
            onClick={e=>e.stopPropagation()}
            style={{ width:"100%", padding:"8px 10px", border:"none", borderBottom:"1px solid #f0f0f0", fontSize:13, outline:"none", boxSizing:"border-box", borderRadius:"8px 8px 0 0", fontFamily:"inherit" }} />
          <div ref={listRef} style={{ maxHeight:240, overflowY:"auto" }}>
            {filtered.length===0
              ? <div style={{ padding:"10px 12px", fontSize:12, color:"var(--ink4)", textAlign:"center" }}>No results</div>
              : filtered.map((o,i) => (
                <div key={o.id}
                  onMouseDown={()=>{ onChange(o); setOpen(false); setQ(""); setCursor(-1) }}
                  onMouseEnter={()=>setCursor(i)}
                  style={{ padding:"8px 12px", fontSize:13, cursor:"pointer",
                    background: i===cursor ? "var(--brand-lt,#eff6ff)" : o.id===value ? "#f0fdf4" : "transparent",
                    color: o._g==="Sub" ? "#7c3aed" : "var(--ink)",
                    fontWeight: o.id===value ? 700 : 400,
                    borderLeft: i===cursor ? "3px solid var(--brand,#2563eb)" : "3px solid transparent" }}>
                  {o.name}
                  {o._g==="Sub" && <span style={{ fontSize:10, color:"#7c3aed", marginLeft:4 }}>(sub)</span>}
                  {(o.cost_per_unit||o.market_cost)>0 && <span style={{ fontSize:10, color:o.cost_per_unit>0?"var(--ink4)":"#92400e", marginLeft:6 }}>Rp {Math.round(o.cost_per_unit||o.market_cost).toLocaleString("id-ID")}/{o.unit}{o.cost_per_unit===0&&o.market_cost>0?" (est.)":""}</span>}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

function ConsignmentPanel({ item, onSaved, onCancel }) {
  const [consignCogs, setConsignCogs] = useState(String(item.cogs || ""))
  const [saving,      setSaving]      = useState(false)
  const [msg,         setMsg]         = useState(null)

  async function save() {
    const v = parseInt(consignCogs) || 0
    if (!v) { setMsg({ err:true, text:"Enter a COGS value > 0" }); return }
    setSaving(true); setMsg(null)
    const { error } = await supabase.from("products").update({ cogs: v }).eq("sku", item.id)
    if (error) { setMsg({ err:true, text:"Error: "+error.message }) }
    else { setMsg({ err:false, text:"✓ COGS updated!" }); onSaved({ cogs: v }) }
    setSaving(false)
  }

  const cp    = parseInt(consignCogs) || 0
  const sellP = item.price || 0
  const mgn   = sellP > 0 && cp > 0 ? pct(sellP - cp, sellP) : null

  return (
    <div style={{ padding:"24px 28px", maxWidth:480, position:"relative" }}>
      <button onClick={onCancel} aria-label="Close" title="Close"
        style={{ position:"absolute", top:16, right:16, width:32, height:32, borderRadius:"50%",
          border:"1px solid var(--surface3,#e5e7eb)", background:"#fff", fontSize:16, fontWeight:700,
          color:"var(--ink4,#6b7280)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
      <div style={{ fontSize:20, fontWeight:800, marginBottom:4, paddingRight:40 }}>{item.icon||"📦"} {item.name}</div>
      <div style={{ fontSize:12, color:"var(--ink4)", marginBottom:20 }}>Consignment · no recipe — set COGS directly</div>
      <div style={{ background:"#ede9fe", borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#6d28d9", textTransform:"uppercase", marginBottom:8 }}>Consignment COGS (per item)</div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:14, fontWeight:700, color:"#6d28d9" }}>Rp</span>
          <input type="number" value={consignCogs} onChange={e=>setConsignCogs(e.target.value)}
            className="bo-input" style={{ fontSize:18, fontWeight:800, width:160 }} placeholder="0" />
        </div>
        {mgn !== null && (
          <div style={{ marginTop:10, fontSize:13, fontWeight:700 }}>
            Sell: {fmtRp(sellP)} · Margin: <span style={{ color:mgn>=65?"#065f46":mgn>=45?"#92400e":"#991b1b" }}>{mgn}%</span>
          </div>
        )}
      </div>
      {msg && (
        <div style={{ padding:"8px 12px", borderRadius:8, fontSize:13, fontWeight:600, marginBottom:14,
          background:msg.err?"#fee2e2":"#d1fae5", color:msg.err?"#991b1b":"#065f46" }}>
          {msg.text}
        </div>
      )}
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={onCancel} className="bo-btn bo-btn-ghost">Cancel</button>
        <button onClick={save} disabled={saving} className="bo-btn bo-btn-primary">
          {saving ? "Saving..." : "Save COGS"}
        </button>
      </div>
    </div>
  )
}

function RecipePanel({ item, itemType, ingredients, subRecipes, onSaved, onCancel }) {
  const [rows,      setRows]      = useState([])
  const [yieldQty,  setYieldQty]  = useState(1)
  const [yieldUnit, setYieldUnit] = useState("gr")
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState(null)
  const [unitsList, setUnitsList] = useState(UNITS_FALLBACK)

  useEffect(() => {
    supabase.from("app_settings").select("units").eq("id","main").maybeSingle()
      .then(({data}) => { if (data?.units?.length) setUnitsList(data.units.map(u=>u.name)) })
  }, [])

  const all = [...ingredients, ...subRecipes]

  useEffect(() => {
    if (!item?.id) return
    setRows([]); setMsg(null)
    setYieldQty(item.yield_qty || 1)
    // For sub-recipes, prefer stored yield_unit, fallback to ingredient unit
    const ingUnit = itemType === "sub" ? (item.unit || "portion") : "portion"
    setYieldUnit(item.yield_unit || ingUnit)
    const table = itemType === "sub" ? "sub_recipe_ingredients" : "recipes"
    const loadRecipe = async () => {
      let data = null
      if (itemType === "sub") {
        const res = await supabase.from(table).select("*").eq("sub_recipe_id", item.id)
        data = res.data
      } else {
        const res1 = await supabase.from("recipes").select("*").eq("productSku", item.id)
        data = res1.data
      }
      if (data?.length) setRows(data.map(r => {
        const found = all.find(x => x.id === r.ingredient_id)
        return {
          ingredient_id: r.ingredient_id,
          name: r.ingredient_name || found?.name || "",
          qty: r.qty || 0,
          unit: r.unit || found?.yield_unit || found?.unit || "gr",
        }
      }))
    }
    loadRecipe()
  }, [item?.id, itemType])

  const totalCost = rows.reduce((sum, row) => {
    const found = all.find(x => x.id === row.ingredient_id)
    const effectiveCost = found?.cost_per_unit || found?.market_cost || 0
    if (!effectiveCost) return sum
    // Price per row.unit using the ingredient's own conversions[] (respects real pack/kg/etc
    // sizes) rather than assuming every "pack"/"sachet"/etc is exactly 1 base unit.
    const priceIng = { unit: found.yield_unit || found.unit, cost_per_unit: effectiveCost, conversions: found.conversions }
    return sum + unitPriceFor(priceIng, row.unit) * (parseFloat(row.qty)||0)
  }, 0)

  const yieldBase   = toBase(yieldQty, yieldUnit)
  const costPerUnit = itemType==="sub" && yieldBase>0 ? totalCost/yieldBase : 0

  function addRow()          { setRows(r => [...r, { ingredient_id:"", name:"", qty:"", unit:"gr" }]) }
  function removeRow(i)      { setRows(r => r.filter((_,idx)=>idx!==i)) }
  function updateRow(i, patch){ setRows(r => r.map((x,idx)=>idx===i?{...x,...patch}:x)) }

  function handleIngChange(i, ingId) {
    const found = all.find(x => x.id === ingId)
    // A sub-recipe's own id isn't a real ingredients-table row — resolve to the
    // ingredient it's actually linked to, since that's what stock deduction at
    // sale time (and production consumption) looks up.
    const resolvedId = found?.ingredient_id || ingId
    updateRow(i, { ingredient_id: resolvedId, name: found?.name||"", unit: found?.yield_unit || found?.unit || "gr" })
  }

  async function save() {
    const valid = rows.filter(r => r.ingredient_id && parseFloat(r.qty) > 0)
    if (!valid.length) { setMsg({ err:true, text:"Add at least 1 ingredient with qty > 0" }); return }
    setSaving(true); setMsg(null)
    const inserts = valid.map(r => ({
      ingredient_id: r.ingredient_id,
      ingredient_name: r.name || all.find(x=>x.id===r.ingredient_id)?.name || "",
      qty: parseFloat(r.qty), unit: r.unit,
    }))
    try {
      if (itemType === "sub") {
        const { error: d } = await supabase.from("sub_recipe_ingredients").delete().eq("sub_recipe_id", item.id)
        if (d) throw d
        const { error: ins } = await supabase.from("sub_recipe_ingredients").insert(inserts.map(r=>({...r, sub_recipe_id:item.id})))
        if (ins) throw ins
        const cleanYieldQty = parseFloat(yieldQty)||1
        const { error: u } = await supabase.from("sub_recipes").update({ yield_qty:cleanYieldQty, yield_unit:yieldUnit, cost_per_unit:costPerUnit }).eq("id", item.id)
        if (u) throw u
        if (item.ingredient_id) {
          await supabase.from("ingredients").update({ cost_per_unit:costPerUnit }).eq("id", item.ingredient_id)
        }
        setMsg({ err:false, text:`✓ Saved! Cost: Rp ${fmtUnit(costPerUnit)}/${yieldUnit}` })
        onSaved({ cost_per_unit:costPerUnit, yield_qty:cleanYieldQty, yield_unit:yieldUnit })
      } else {
        const { error: d } = await supabase.from("recipes").delete().eq("productSku", item.id)
        if (d) throw d
        const { error: ins } = await supabase.from("recipes").insert(inserts.map(r=>({...r, product_id:item.id, productSku:item.id})))
        if (ins) throw ins
        await supabase.from("products").update({ cogs:Math.round(totalCost) }).eq("sku", item.id)
        setMsg({ err:false, text:`✓ Saved! COGS: ${fmtRp(totalCost)}` })
        onSaved({ cogs:Math.round(totalCost) })
      }
    } catch(e) {
      setMsg({ err:true, text:"Error: "+e.message })
    }
    setSaving(false)
  }

  const sellingPrice = item?.price || 0
  const margin = sellingPrice>0 && totalCost>0 ? pct(sellingPrice-totalCost, sellingPrice) : null

  if (itemType === "dish" && item.category === "Consignment") {
    return <ConsignmentPanel item={item} onSaved={onSaved} onCancel={onCancel} />
  }

  return (
    <div style={{ padding:"24px 28px", maxWidth:780, position:"relative" }}>
      <button onClick={onCancel} aria-label="Close" title="Close"
        style={{ position:"absolute", top:16, right:16, width:32, height:32, borderRadius:"50%",
          border:"1px solid var(--surface3,#e5e7eb)", background:"#fff", fontSize:16, fontWeight:700,
          color:"var(--ink4,#6b7280)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1 }}>✕</button>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, paddingBottom:16, borderBottom:"1px solid var(--surface3,#f0f0f0)" }}>
        <div style={{ flex:1, paddingRight:40 }}>
          <div style={{ fontSize:20, fontWeight:800, color:"var(--ink,#1f2937)" }}>{item.icon||"🥣"} {item.name}</div>
          <div style={{ fontSize:12, color:"var(--ink4,#6b7280)", marginTop:4 }}>
            {itemType==="sub" ? "Sub-recipe" : "Dish"} · Category: {item.category||item.cat||"—"}
          </div>
          {/* Recipe COGS inline on mobile */}
          <div className="recipe-cogs-inline" style={{ display:"none", marginTop:10, padding:"10px 14px", border:"1.5px solid var(--surface3,#e5e7eb)", borderRadius:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--ink4,#6b7280)", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:2 }}>Recipe COGS</div>
            <div style={{ fontSize:22, fontWeight:900, color: totalCost>0?"var(--green,#059669)":"var(--ink4,#9ca3af)" }}>{fmtRp(totalCost)}</div>
            {itemType==="sub" && yieldBase>0 && <div style={{ fontSize:12, color:"var(--ink4,#6b7280)", marginTop:2 }}>Rp {fmtUnit(totalCost/yieldBase)}/{yieldUnit}</div>}
            {margin!==null && (
              <div style={{ marginTop:6, fontSize:12, fontWeight:700, padding:"2px 8px", borderRadius:10, display:"inline-block",
                background:margin>=65?"#d1fae5":margin>=45?"#fef3c7":"#fee2e2",
                color:margin>=65?"#065f46":margin>=45?"#92400e":"#991b1b" }}>
                {margin}% margin
              </div>
            )}
          </div>
        </div>
        <div className="recipe-cogs-desktop" style={{ textAlign:"right", padding:"12px 16px", border:"1.5px solid var(--surface3,#e5e7eb)", borderRadius:12 }}>
          <div style={{ fontSize:10, fontWeight:700, color:"var(--ink4,#6b7280)", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>Recipe COGS</div>
          <div style={{ fontSize:24, fontWeight:900, color: totalCost>0?"var(--green,#059669)":"var(--ink4,#9ca3af)" }}>{fmtRp(totalCost)}</div>
          {itemType==="sub" && yieldBase>0 && <div style={{ fontSize:12, color:"var(--ink4,#6b7280)", marginTop:2 }}>Rp {fmtUnit(totalCost/yieldBase)}/{yieldUnit}</div>}
          {margin!==null && (
            <div style={{ marginTop:6, fontSize:12, fontWeight:700, padding:"2px 8px", borderRadius:10, display:"inline-block",
              background:margin>=65?"#d1fae5":margin>=45?"#fef3c7":"#fee2e2",
              color:margin>=65?"#065f46":margin>=45?"#92400e":"#991b1b" }}>
              {margin}% margin
            </div>
          )}
        </div>
      </div>

      {/* Yield bar - sub only */}
      {itemType==="sub" && (
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", background:"#eff6ff", borderRadius:10, marginBottom:20, flexWrap:"wrap" }}>
          <span style={{ fontSize:13, fontWeight:700, color:"#1e40af" }}>This recipe produces:</span>
          <input type="number" value={yieldQty} onChange={e=>setYieldQty(e.target.value)}
            style={{ width:90, padding:"6px 10px", border:"1.5px solid #bfdbfe", borderRadius:8, fontSize:14, outline:"none", fontFamily:"inherit" }} />
          <select value={yieldUnit} onChange={e=>setYieldUnit(e.target.value)}
            style={{ padding:"6px 10px", border:"1.5px solid #bfdbfe", borderRadius:8, fontSize:14, background:"#fff", outline:"none", fontFamily:"inherit" }}>
            {unitsList.map(u=><option key={u}>{u}</option>)}
          </select>
          {totalCost>0 && yieldBase>0 && (
            <span style={{ fontSize:13, color:"#2563eb", fontWeight:600 }}>→ cost per {yieldUnit}: Rp {fmtUnit(totalCost/yieldBase)}</span>
          )}
        </div>
      )}

      {/* Column headers */}
      <div className="recipe-ing-header" style={{ display:"grid", gridTemplateColumns:"1fr 100px 110px 110px 32px", gap:8, marginBottom:8, padding:"0 2px" }}>
        {["INGREDIENT / SUB-RECIPE","QTY","UNIT","COST",""].map((h,i)=>(
          <div key={i} style={{ fontSize:10, fontWeight:700, color:"var(--ink4,#6b7280)", textTransform:"uppercase", letterSpacing:"0.4px" }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:14 }}>
        {rows.map((row,i) => {
          const found = all.find(x=>x.id===row.ingredient_id)
          const effectiveCost = found?.cost_per_unit || found?.market_cost || 0
          const cost  = effectiveCost ? unitPriceFor({ unit: found.yield_unit || found.unit, cost_per_unit: effectiveCost, conversions: found.conversions }, row.unit) * (parseFloat(row.qty)||0) : 0
          const isEst = cost > 0 && !found?.cost_per_unit && found?.market_cost > 0
          return (
            <div key={i} className="recipe-ing-row" style={{ display:"grid", gridTemplateColumns:"1fr 100px 110px 110px 32px", gap:8, alignItems:"center" }}>
              <IngSearch
                value={row.ingredient_id||""}
                onChange={o=>handleIngChange(i,o.id)}
                ingredients={ingredients}
                subRecipes={subRecipes}
              />
              <input type="number" value={row.qty===0?"":row.qty} min="0" step="any"
                onChange={e=>updateRow(i,{qty:e.target.value})}
                className="bo-input" style={{ fontSize:13, textAlign:"center" }} placeholder="0" />
              <select value={row.unit} onChange={e=>updateRow(i,{unit:e.target.value})}
                className="bo-select" style={{ fontSize:13 }}>
                {unitsList.map(u=><option key={u}>{u}</option>)}
              </select>
              <div style={{ fontSize:13, fontWeight:700, color:cost>0?(isEst?"#92400e":"var(--ink,#1f2937)"):"var(--ink4,#9ca3af)", textAlign:"right" }} title={isEst?"Estimated from market price":"WAC cost"}>
                {cost>0?fmtRp(cost)+(isEst?"*":""):"—"}
              </div>
              <button onClick={()=>removeRow(i)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--red,#ef4444)", fontSize:16, padding:0, lineHeight:1 }}>✕</button>
            </div>
          )
        })}
        {rows.length===0 && <div style={{ fontSize:13, color:"var(--ink4,#9ca3af)", padding:"12px 0" }}>No ingredients yet.</div>}
      </div>

      <button onClick={addRow} className="bo-btn bo-btn-ghost" style={{ marginBottom:20, fontSize:13 }}>+ Add Ingredient</button>

      {/* Msg */}
      {msg && (
        <div style={{ padding:"8px 12px", borderRadius:8, fontSize:13, fontWeight:600, marginBottom:14,
          background:msg.err?"#fee2e2":"#d1fae5", color:msg.err?"#991b1b":"#065f46" }}>
          {msg.text}
        </div>
      )}

      {/* Footer */}
      <div style={{ display:"flex", justifyContent:"flex-end", gap:10, paddingTop:16, borderTop:"1px solid var(--surface3,#f0f0f0)" }}>
        <button onClick={onCancel} className="bo-btn bo-btn-ghost">Cancel</button>
        <button onClick={save} disabled={saving} className="bo-btn bo-btn-primary" style={{ minWidth:200 }}>
          {saving?"Saving...": itemType==="sub"?"Save Recipe & Update Sub Cost":"Save Recipe & Update COGS"}
        </button>
      </div>
    </div>
  )
}

export default function RecipeEditor() {
  const [tab,         setTab]         = useState("dish")
  const [search,      setSearch]      = useState("")
  const [products,    setProducts]    = useState([])
  const [subRecipes,  setSubRecipes]  = useState([])
  const [ingredients, setIngredients] = useState([])
  const [selected,    setSelected]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [tick,        setTick]        = useState(0)
  const [syncing,     setSyncing]     = useState(false)

  // On mobile, the recipe detail is a full-screen sheet — make the phone's
  // back button/gesture close it instead of leaving the page entirely.
  const pushedHistory = useRef(false)
  const closingViaPop = useRef(false)
  useEffect(() => {
    function onPopState() {
      if (pushedHistory.current) {
        closingViaPop.current = true
        pushedHistory.current = false
        setSelected(null)
      }
    }
    window.addEventListener("popstate", onPopState)
    return () => {
      window.removeEventListener("popstate", onPopState)
      if (pushedHistory.current) { pushedHistory.current = false; window.history.back() }
    }
  }, [])
  useEffect(() => {
    if (selected && !pushedHistory.current) {
      window.history.pushState({ recipeSheet: true }, "")
      pushedHistory.current = true
    } else if (!selected && pushedHistory.current) {
      pushedHistory.current = false
      if (!closingViaPop.current) window.history.back()
    }
    closingViaPop.current = false
  }, [selected])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from("products").select("sku,name,icon,price,cogs,cat").order("name"),
      supabase.from("sub_recipes").select("id,name,unit,cost_per_unit,yield_qty,yield_unit,ingredient_id").order("name"),
      supabase.from("ingredients").select("id,name,unit,cost_per_unit,category,conversions").order("name"),
      supabase.from("sub_recipe_ingredients").select("sub_recipe_id"),
      supabase.from("market_prices").select("ingredient_id,price,conv_qty").order("checked_at", { ascending: false }),
    ]).then(async ([pRes, sRes, iRes, sriRes, mpRes]) => {
      // Build market-price cost map: latest price per ingredient (price / conv_qty = cost per base unit)
      const mpMap = {}
      ;(mpRes.data || []).forEach(p => {
        if (!mpMap[p.ingredient_id]) mpMap[p.ingredient_id] = p.price / (p.conv_qty || 1)
      })
      const allIngs = (iRes.data || []).map(i => ({
        ...i,
        market_cost: mpMap[i.id] || 0,
      }))
      let subs = sRes.data || []
      // Auto-sync: find Semi-finished ingredients that don't have a sub_recipe row yet
      const semiIngs = allIngs.filter(i => i.category === "Semi-finished")
      const existingIngIds = new Set(subs.map(s => s.ingredient_id).filter(Boolean))
      const missing = semiIngs.filter(i => !existingIngIds.has(i.id))
      if (missing.length > 0) {
        const newRows = missing.map(i => ({
          id: "SUB-" + i.id,
          name: i.name,
          unit: i.unit || "gr",
          cost_per_unit: i.cost_per_unit || 0,
          yield_qty: 1,
          yield_unit: i.unit || "gr",
          ingredient_id: i.id,
        }))
        await supabase.from("sub_recipes").upsert(newRows, { onConflict: "id" })
        subs = [...subs, ...newRows]
      }
      // Deduplicate by ingredient_id
      const seen = new Set()
      subs = subs.filter(s => {
        if (!s.ingredient_id) return true
        if (seen.has(s.ingredient_id)) return false
        seen.add(s.ingredient_id)
        return true
      })
      // Check which products have recipes
      const { data: recipeSkus } = await supabase.from("recipes").select("productSku")
      const hasRecipeSet = new Set((recipeSkus||[]).map(r=>r.productSku).filter(Boolean))
      const subIngSet = new Set((sriRes.data||[]).map(r=>r.sub_recipe_id))
      setProducts((pRes.data||[]).map(p=>({...p,id:p.sku,category:p.cat,_hasRecipe:hasRecipeSet.has(p.sku)})))
      subs = subs.map(s => ({...s, _hasIngredients: subIngSet.has(s.id)}))
      setSubRecipes(subs)
      setIngredients(allIngs)
      setLoading(false)
    })
  }, [tick])

  const onSaved = useCallback((patch) => {
    if (patch && selected) {
      setSelected(s => s ? {...s,...patch} : s)
      // Update the list item in-place for instant left panel refresh
      if (patch.cost_per_unit !== undefined || patch.yield_unit !== undefined) {
        setSubRecipes(prev => prev.map(s => s.id===selected.id ? {...s,...patch} : s))
      }
      if (patch.cogs !== undefined) {
        setProducts(prev => prev.map(p => p.id===selected.id ? {...p,...patch} : p))
      }
    }
    setTick(t => t+1)
  }, [selected])

  async function syncDishCogs() {
    setSyncing(true)
    const consignmentSkus = new Set(products.filter(p => p.category === "Consignment").map(p => p.id))
    const [recRes, iRes, srRes, mpRes] = await Promise.all([
      supabase.from("recipes").select("productSku,ingredient_id,qty,unit"),
      supabase.from("ingredients").select("id,name,unit,cost_per_unit,conversions"),
      supabase.from("sub_recipes").select("id,unit,cost_per_unit"),
      supabase.from("market_prices").select("ingredient_id,price,conv_qty").order("checked_at", { ascending: false }),
    ])
    const mpMap = {}
    ;(mpRes.data || []).forEach(p => { if (!mpMap[p.ingredient_id]) mpMap[p.ingredient_id] = p.price / (p.conv_qty || 1) })
    const lookup = {}
    ;(iRes.data || []).forEach(i => { lookup[i.id] = { unit: i.unit || "gr", cost_per_unit: i.cost_per_unit || 0, market_cost: mpMap[i.id] || 0, conversions: i.conversions } })
    ;(srRes.data || []).forEach(s => { lookup[s.id] = { unit: s.unit || "gr", cost_per_unit: s.cost_per_unit || 0, market_cost: 0 } })
    const byProduct = {}
    ;(recRes.data || []).forEach(r => {
      if (!r.productSku || !r.ingredient_id) return
      if (consignmentSkus.has(r.productSku)) return
      if (!byProduct[r.productSku]) byProduct[r.productSku] = []
      byProduct[r.productSku].push(r)
    })
    for (const [sku, lines] of Object.entries(byProduct)) {
      const cogs = lines.reduce((sum, row) => {
        const ing = lookup[row.ingredient_id]
        if (!ing) return sum
        const effectiveCost = ing.cost_per_unit || ing.market_cost || 0
        if (!effectiveCost) return sum
        return sum + unitPriceFor({ ...ing, cost_per_unit: effectiveCost }, row.unit) * (parseFloat(row.qty)||0)
      }, 0)
      const rounded = Math.round(cogs)
      if (rounded > 0) {
        await supabase.from("products").update({ cogs: rounded }).eq("sku", sku)
      }
    }
    setSyncing(false)
    setTick(t => t + 1)
  }

  async function syncSubCosts() {
    setSyncing(true)
    const [sriRes, iRes, srRes, mpRes] = await Promise.all([
      supabase.from("sub_recipe_ingredients").select("*"),
      supabase.from("ingredients").select("id,name,unit,cost_per_unit,conversions"),
      supabase.from("sub_recipes").select("id,ingredient_id,yield_qty,yield_unit"),
      supabase.from("market_prices").select("ingredient_id,price,conv_qty").order("checked_at", { ascending: false }),
    ])
    const mpMap = {}
    ;(mpRes.data || []).forEach(p => { if (!mpMap[p.ingredient_id]) mpMap[p.ingredient_id] = p.price / (p.conv_qty || 1) })
    const ingLookup = {}
    ;(iRes.data || []).forEach(i => { ingLookup[i.id] = { ...i, market_cost: mpMap[i.id] || 0 } })
    const srLookup = {}
    ;(srRes.data || []).forEach(s => { srLookup[s.id] = s })
    const bySubRecipe = {}
    ;(sriRes.data || []).forEach(row => {
      if (!bySubRecipe[row.sub_recipe_id]) bySubRecipe[row.sub_recipe_id] = []
      bySubRecipe[row.sub_recipe_id].push(row)
    })
    for (const [subId, rows] of Object.entries(bySubRecipe)) {
      const sr = srLookup[subId]
      if (!sr) continue
      const totalCost = rows.reduce((sum, row) => {
        const ing = ingLookup[row.ingredient_id]
        if (!ing) return sum
        const effectiveCost = ing.cost_per_unit || ing.market_cost || 0
        if (!effectiveCost) return sum
        return sum + unitPriceFor({ ...ing, cost_per_unit: effectiveCost }, row.unit) * (parseFloat(row.qty)||0)
      }, 0)
      const yieldBase = toBase(sr.yield_qty || 1, sr.yield_unit || "gr")
      const costPerUnit = yieldBase > 0 ? totalCost / yieldBase : 0
      if (costPerUnit > 0) {
        await supabase.from("sub_recipes").update({ cost_per_unit: costPerUnit }).eq("id", subId)
        if (sr.ingredient_id) {
          await supabase.from("ingredients").update({ cost_per_unit: costPerUnit }).eq("id", sr.ingredient_id)
        }
      }
    }
    setSyncing(false)
    setTick(t => t + 1)
  }

  const listItems = (tab==="dish" ? products : subRecipes)
    .filter(x => !search || x.name?.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div style={{ padding:40, textAlign:"center", color:"var(--ink4)" }}>Loading recipes...</div>

  return (
    <div style={{ display:"flex", height:"calc(100vh - 56px)", overflow:"hidden" }} className={"recipe-root"+(selected?" has-selected":"")}>
      {/* LEFT */}
      <div className="recipe-left" style={{ width:300, minWidth:260, borderRight:"1px solid var(--surface3,#e5e7eb)", display:"flex", flexDirection:"column", background:"var(--surface,#fafafa)" }}>
        {/* Tabs */}
        <div style={{ display:"flex", padding:"10px 10px 0", gap:6, borderBottom:"1px solid var(--surface3,#e5e7eb)" }}>
          {[["dish","🍽 Dishes",products.length],["sub","🥣 Sub-recipes",subRecipes.length]].map(([t,l,cnt])=>(
            <button key={t} onClick={()=>{setTab(t);setSelected(null);setSearch("")}}
              className={"bo-btn bo-btn-sm "+(tab===t?"bo-btn-primary":"bo-btn-ghost")}
              style={{ flex:1, marginBottom:8 }}>
              {l} ({cnt})
            </button>
          ))}
        </div>
        {/* Search */}
        <div style={{ padding:"10px 12px", borderBottom:"1px solid var(--surface2,#f0f0f0)", display:"flex", gap:6 }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
            className="bo-input" style={{ fontSize:13, flex:1 }} />
          <button onClick={tab === "sub" ? syncSubCosts : syncDishCogs} disabled={syncing}
            className="bo-btn bo-btn-ghost"
            style={{ fontSize:11, padding:"4px 8px", whiteSpace:"nowrap", flexShrink:0 }}
            title={tab === "sub" ? "Recalculate cost_per_unit for all sub-recipes" : "Recalculate COGS for all dishes"}>
            {syncing ? "..." : "Sync COGS"}
          </button>
        </div>
        {/* List */}
        <div style={{ flex:1, overflowY:"auto" }}>
          {listItems.map(item => {
            const hasCogs = (tab==="dish" ? (item.cogs||0) : (item.cost_per_unit||0)) > 0
            const hasRecipeFlag = tab==="dish" ? item._hasRecipe : item._hasIngredients
            const margin  = tab==="dish" && item.price>0 && item.cogs>0 ? pct(item.price-item.cogs,item.price) : null
            const isSel   = selected?.id===item.id
            return (
              <div key={item.id} onClick={()=>setSelected({...item,_type:tab})}
                style={{ padding:"10px 14px", cursor:"pointer", borderBottom:"1px solid var(--surface2,#f3f4f6)",
                  background:isSel?"var(--brand-lt,#eff6ff)":"transparent",
                  borderLeft:isSel?"3px solid var(--brand,#2563eb)":"3px solid transparent",
                  transition:"background 0.1s" }}
                onMouseEnter={e=>{ if(!isSel) e.currentTarget.style.background="var(--surface,#f9fafb)" }}
                onMouseLeave={e=>{ if(!isSel) e.currentTarget.style.background="transparent" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center", flex:1, minWidth:0 }}>
                    <span style={{ fontSize:18, flexShrink:0 }}>{item.icon||(tab==="sub"?"🥣":"🍴")}</span>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"var(--ink,#1f2937)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</div>
                      <div style={{ fontSize:11, marginTop:2 }}>
                        {tab==="dish" && item.category==="Consignment"
                          ? <span style={{ padding:"1px 6px", borderRadius:10, background:"#ede9fe", color:"#6d28d9", fontWeight:700 }}>📦 Consignment</span>
                          : hasCogs
                          ? <span style={{ padding:"1px 6px", borderRadius:10, background:"#d1fae5", color:"#065f46", fontWeight:700 }}>✓ Has recipe</span>
                          : hasRecipeFlag
                          ? <span style={{ padding:"1px 6px", borderRadius:10, background:"#fef3c7", color:"#92400e", fontWeight:700 }}>Has recipe · No price</span>
                          : <span style={{ color:"var(--ink4,#9ca3af)" }}>No recipe</span>}
                        {hasCogs && tab==="sub" && <span style={{ color:"var(--brand,#2563eb)", fontWeight:600, marginLeft:4 }}>· Rp {fmtUnit(item.cost_per_unit||0)}/{item.yield_unit||item.unit}</span>}
                        {tab==="dish" && item.category==="Consignment" && item.cogs>0 && <span style={{ color:"#6d28d9", fontWeight:600, marginLeft:4 }}>· COGS {Math.round(item.cogs||0).toLocaleString("id-ID")}</span>}
                        {hasCogs && tab==="dish" && item.category!=="Consignment" && <span style={{ color:"var(--brand,#2563eb)", fontWeight:600, marginLeft:4 }}>· COGS {Math.round(item.cogs||0).toLocaleString("id-ID")}</span>}
                      </div>
                    </div>
                  </div>
                  {margin!==null && (
                    <span style={{ fontSize:11, fontWeight:700, padding:"2px 6px", borderRadius:10, flexShrink:0, marginLeft:6,
                      background:margin>=65?"#d1fae5":margin>=45?"#fef3c7":"#fee2e2",
                      color:margin>=65?"#065f46":margin>=45?"#92400e":"#991b1b" }}>
                      {margin}%
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          {listItems.length===0 && <div style={{ padding:24, textAlign:"center", color:"var(--ink4)", fontSize:13 }}>No items found</div>}
        </div>
      </div>

      {/* MOBILE BOTTOM SHEET */}
      {selected && (
        <div className="recipe-sheet-overlay" onClick={()=>setSelected(null)} />
      )}
      {/* RIGHT */}
      <div className="recipe-right" style={{ flex:1, overflowY:"auto", background:"#fff" }}>
        {selected ? (
          <RecipePanel
            key={selected.id+selected._type}
            item={selected}
            itemType={selected._type}
            ingredients={ingredients}
            subRecipes={subRecipes}
            onSaved={onSaved}
            onCancel={()=>setSelected(null)}
          />
        ) : (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", color:"var(--ink4,#9ca3af)" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>📖</div>
            <div style={{ fontSize:14 }}>Select an item from the list to edit its recipe</div>
          </div>
        )}
      </div>
    </div>
  )
}
