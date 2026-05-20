import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n)    { return "Rp " + Number(n||0).toLocaleString("id-ID") }
function fmtD(n)   { return "Rp " + Number(n||0).toLocaleString("id-ID", { minimumFractionDigits:2, maximumFractionDigits:2 }) }
function fmtPct(n) { return Math.round(n||0) + "%" }

// Get cost per base unit of an ingredient (handles sub-recipes too)
function getCostPerUnit(ing) {
  return ing?.cost_per_unit || 0
}

export default function Recipes() {
  const [tab,         setTab]         = useState("dishes")   // dishes | sub-recipes
  const [products,    setProducts]    = useState([])
  const [ingredients, setIngredients] = useState([])
  const [recipes,     setRecipes]     = useState([])          // { id, type, product_id|ingredient_id, lines[], yield_qty, yield_unit }
  const [selected,    setSelected]    = useState(null)        // selected product or sub
  const [lines,       setLines]       = useState([])          // recipe lines
  const [yieldQty,    setYieldQty]    = useState(1)
  const [yieldUnit,   setYieldUnit]   = useState("portion")
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [search,      setSearch]      = useState("")

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data:prods }, { data:ings }, { data:recs }] = await Promise.all([
      supabase.from("products").select("id,sku,name,price,cogs,cat").order("name"),
      supabase.from("ingredients").select("*").order("name"),
      supabase.from("recipes").select("*"),
    ])
    setProducts(prods||[])
    setIngredients(ings||[])
    setRecipes(recs||[])
    setLoading(false)
  }

  // All items that can BE a recipe target
  const dishList = products
  const subList  = ingredients.filter(i => i.category === "Semi-finished" || i.name?.toLowerCase().includes("(sub)"))

  // Items that can be used AS ingredients in a recipe
  const allIngredients = [
    ...ingredients.map(i => ({ ...i, _type:"ingredient" })),
  ]

  function hasRecipe(id, type) {
    return recipes.some(r => type==="dish" ? r.product_id===id : r.ingredient_id===id)
  }

  function getRecipe(id, type) {
    return recipes.find(r => type==="dish" ? r.product_id===id : r.ingredient_id===id)
  }

  function selectItem(item, type) {
    setSelected({ ...item, _type: type })
    const rec = getRecipe(type==="dish" ? item.id||item.sku : item.id, type)
    if (rec) {
      setLines(rec.lines || [])
      setYieldQty(rec.yield_qty || 1)
      setYieldUnit(rec.yield_unit || (type==="dish"?"portion":item.unit||"gr"))
    } else {
      setLines([{ ingredient_id:"", qty:0, unit:"gr" }])
      setYieldQty(1)
      setYieldUnit(type==="dish" ? "portion" : item.unit || "gr")
    }
  }

  function addLine()       { setLines(l => [...l, { ingredient_id:"", qty:0, unit:"gr" }]) }
  function removeLine(i)   { setLines(l => l.filter((_,idx)=>idx!==i)) }
  function updateLine(i,k,v){
    setLines(l => l.map((x,idx) => {
      if (idx!==i) return x
      const up = {...x,[k]:v}
      if (k==="ingredient_id") {
        const ing = allIngredients.find(a=>a.id===v)
        if (ing) up.unit = ing.unit
      }
      return up
    }))
  }

  // Calculate total COGS for current lines
  function calcCOGS() {
    return lines.reduce((sum, line) => {
      if (!line.ingredient_id || !line.qty) return sum
      const ing  = allIngredients.find(a => a.id === line.ingredient_id)
      if (!ing) return sum
      const cost = getCostPerUnit(ing)
      // Handle unit conversion
      let qty = parseFloat(line.qty) || 0
      if (line.unit !== ing.unit) {
        const conv = (ing.conversions||[]).find(c=>c.unit===line.unit)
        if (conv && conv.qty) qty = qty * parseFloat(conv.qty)
      }
      return sum + (qty * cost)
    }, 0)
  }

  const cogs      = calcCOGS()
  const yieldN    = parseFloat(yieldQty) || 1
  const cogsPerUnit = cogs / yieldN
  const selPrice  = selected?._type==="dish" ? (selected.price||0) : 0
  const margin    = selPrice > 0 ? ((selPrice - cogsPerUnit) / selPrice * 100) : null

  // Get cost per unit if saving a sub-recipe
  async function saveRecipe() {
    if (!selected) return
    setSaving(true)

    const isDish = selected._type === "dish"
    const targetId = isDish ? (selected.id||selected.sku) : selected.id
    const validLines = lines.filter(l => l.ingredient_id && parseFloat(l.qty) > 0)

    const recipePayload = {
      type:          isDish ? "dish" : "sub",
      product_id:    isDish ? targetId : null,
      ingredient_id: isDish ? null : targetId,
      lines:         validLines,
      yield_qty:     yieldN,
      yield_unit:    yieldUnit,
      cogs:          cogs,
      cogs_per_unit: cogsPerUnit,
    }

    // Upsert recipe
    const existing = getRecipe(targetId, selected._type)
    if (existing) {
      await supabase.from("recipes").update(recipePayload).eq("id", existing.id)
    } else {
      await supabase.from("recipes").insert({ ...recipePayload, id:"RCP-"+Date.now() })
    }

    // Update COGS on product or cost_per_unit on sub-ingredient
    if (isDish) {
      await supabase.from("products").update({ cogs: Math.round(cogsPerUnit) }).eq("id", targetId)
        .then(() => supabase.from("products").update({ cogs: Math.round(cogsPerUnit) }).eq("sku", targetId))
    } else {
      await supabase.from("ingredients").update({ cost_per_unit: cogsPerUnit }).eq("id", targetId)
    }

    await load()
    setSaving(false)
    alert(`✅ Recipe saved! ${isDish ? "Product COGS" : "Ingredient cost"} updated to ${fmtD(cogsPerUnit)}/${yieldUnit}`)
  }

  const filteredDishes = dishList.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
  const filteredSubs   = subList.filter(i  => !search || i.name.toLowerCase().includes(search.toLowerCase()))
  const listItems      = tab==="dishes" ? filteredDishes : filteredSubs

  return (
    <div style={{ display:"grid", gridTemplateColumns:"300px 1fr", gap:16, height:"calc(100vh - 140px)" }}>

      {/* Left panel — item list */}
      <div className="bo-card" style={{ marginBottom:0, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Tabs */}
        <div style={{ display:"flex", gap:4, marginBottom:12 }}>
          <button onClick={()=>{setTab("dishes");setSelected(null)}} className={"bo-btn bo-btn-sm "+(tab==="dishes"?"bo-btn-primary":"bo-btn-ghost")} style={{ flex:1 }}>🍽 Dishes ({dishList.length})</button>
          <button onClick={()=>{setTab("sub");setSelected(null)}} className={"bo-btn bo-btn-sm "+(tab==="sub"?"bo-btn-primary":"bo-btn-ghost")} style={{ flex:1 }}>⚗️ Sub-recipes ({subList.length})</button>
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} className="bo-input" placeholder="Search..." style={{ marginBottom:10 }} />

        <div style={{ overflowY:"auto", flex:1 }}>
          {loading ? <div style={{ textAlign:"center", color:"var(--ink5)", padding:20 }}>Loading...</div>
          : listItems.map(item => {
            const id   = tab==="dishes" ? (item.id||item.sku) : item.id
            const type = tab==="dishes" ? "dish" : "sub"
            const rec  = hasRecipe(id, type)
            const isSel = selected?.id===item.id || selected?.sku===item.sku
            const itemCogs = tab==="dishes" ? item.cogs : item.cost_per_unit
            const margin   = tab==="dishes" && item.price > 0 && itemCogs > 0
              ? Math.round((item.price - itemCogs) / item.price * 100) : null

            return (
              <div key={id} onClick={()=>selectItem(item, type)}
                style={{ padding:"10px 12px", borderRadius:8, cursor:"pointer", marginBottom:4,
                  background:isSel?"var(--brand-lt)":"transparent",
                  border:isSel?"1.5px solid var(--brand)":"1.5px solid transparent" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"var(--ink)", flex:1, marginRight:8 }}>{item.name}</div>
                  {rec
                    ? <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:8, background:"var(--green-lt)", color:"var(--green)", flexShrink:0 }}>✓ Recipe</span>
                    : <span style={{ fontSize:10, color:"var(--ink5)", flexShrink:0 }}>No recipe</span>
                  }
                </div>
                <div style={{ fontSize:11, color:"var(--ink5)", marginTop:2, display:"flex", gap:8 }}>
                  {tab==="dishes" && <span>{fmt(item.price)}</span>}
                  {itemCogs > 0 && <span style={{ color:"var(--ink4)" }}>COGS: {fmt(itemCogs)}</span>}
                  {margin !== null && (
                    <span style={{ fontWeight:700, color:margin>=60?"var(--green)":margin>=40?"var(--amber)":"var(--red)" }}>{margin}% margin</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right panel — recipe editor */}
      <div className="bo-card" style={{ marginBottom:0, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {!selected ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flex:1, color:"var(--ink5)", gap:8 }}>
            <div style={{ fontSize:32 }}>📒</div>
            <div style={{ fontSize:14, fontWeight:600 }}>Select a dish or sub-recipe to edit</div>
            <div style={{ fontSize:12 }}>Dishes use ingredients + sub-recipes · Sub-recipes are intermediate preparations</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <div>
                <div className="bo-card-title" style={{ marginBottom:2 }}>
                  {selected._type==="dish" ? "🍽" : "⚗️"} {selected.name}
                </div>
                <div style={{ fontSize:12, color:"var(--ink4)" }}>
                  {selected._type==="dish"
                    ? `Selling price: ${fmt(selected.price)} · Category: ${selected.cat||"—"}`
                    : `Semi-finished ingredient · Base unit: ${selected.unit}`
                  }
                </div>
              </div>
              {/* COGS summary */}
              <div style={{ textAlign:"right", background:"var(--surface)", padding:"10px 16px", borderRadius:"var(--r-lg)", minWidth:180 }}>
                <div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Recipe COGS</div>
                <div style={{ fontSize:22, fontWeight:900, color: cogs===0?"var(--ink5)":margin!==null&&margin<30?"var(--red)":"var(--green)" }}>
                  {fmtD(cogs)}
                </div>
                {yieldN > 1 && (
                  <div style={{ fontSize:11, color:"var(--ink5)" }}>{fmtD(cogsPerUnit)} / {yieldUnit}</div>
                )}
                {margin !== null && (
                  <div style={{ fontSize:13, fontWeight:800, color:margin>=60?"var(--green)":margin>=40?"var(--amber)":"var(--red)", marginTop:2 }}>
                    {fmtPct(margin)} margin
                  </div>
                )}
              </div>
            </div>

            {/* Yield (for sub-recipes) */}
            {selected._type === "sub" && (
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, padding:"10px 14px", background:"var(--brand-lt)", borderRadius:"var(--r)", border:"1px solid rgba(0,102,255,0.2)" }}>
                <span style={{ fontSize:12, fontWeight:700, color:"var(--brand)" }}>This recipe produces:</span>
                <input type="number" value={yieldQty} onChange={e=>setYieldQty(e.target.value)} style={{ width:80, padding:"5px 8px", border:"1.5px solid var(--surface3)", borderRadius:"var(--r)", fontSize:13 }} />
                <input value={yieldUnit} onChange={e=>setYieldUnit(e.target.value)} style={{ width:80, padding:"5px 8px", border:"1.5px solid var(--surface3)", borderRadius:"var(--r)", fontSize:13 }} placeholder="gr / ml / pcs" />
                <span style={{ fontSize:11, color:"var(--brand)" }}>→ cost per {yieldUnit}: {fmtD(cogsPerUnit)}</span>
              </div>
            )}

            {/* Recipe lines */}
            <div style={{ flex:1, overflowY:"auto" }}>
              {/* Column headers */}
              <div style={{ display:"grid", gridTemplateColumns:"2.5fr 90px 100px 130px 36px", gap:8, marginBottom:8 }}>
                {["INGREDIENT / SUB-RECIPE","QTY","UNIT","COST",""].map((h,i)=>(
                  <div key={i} style={{ fontSize:10, fontWeight:700, color:"var(--ink4)", letterSpacing:"0.5px" }}>{h}</div>
                ))}
              </div>

              {lines.map((line, i) => {
                const ing = allIngredients.find(a=>a.id===line.ingredient_id)
                const cost = ing ? (() => {
                  let qty = parseFloat(line.qty)||0
                  if (line.unit !== ing.unit) {
                    const conv = (ing.conversions||[]).find(c=>c.unit===line.unit)
                    if (conv && conv.qty) qty = qty * parseFloat(conv.qty)
                  }
                  return qty * getCostPerUnit(ing)
                })() : 0

                return (
                  <div key={i} style={{ display:"grid", gridTemplateColumns:"2.5fr 90px 100px 130px 36px", gap:8, marginBottom:8, alignItems:"center" }}>
                    <select value={line.ingredient_id} onChange={e=>updateLine(i,"ingredient_id",e.target.value)} className="bo-select">
                      <option value="">— Select ingredient or sub-recipe —</option>
                      <optgroup label="🧂 Raw Ingredients">
                        {ingredients.filter(x=>x.category!=="Semi-finished"&&!x.name?.includes("(sub)")).map(x=>(
                          <option key={x.id} value={x.id}>{x.name} ({x.unit}) {x.cost_per_unit>0?`· ${fmtD(x.cost_per_unit)}/${x.unit}`:""}</option>
                        ))}
                      </optgroup>
                      <optgroup label="⚗️ Sub-recipes">
                        {ingredients.filter(x=>x.category==="Semi-finished"||x.name?.includes("(sub)")).map(x=>(
                          <option key={x.id} value={x.id}>{x.name} ({x.unit}) {x.cost_per_unit>0?`· ${fmtD(x.cost_per_unit)}/${x.unit}`:""}</option>
                        ))}
                      </optgroup>
                    </select>

                    <input type="number" value={line.qty} onChange={e=>updateLine(i,"qty",e.target.value)}
                      className="bo-input" placeholder="0" min={0} step={0.1} />

                    <select value={line.unit} onChange={e=>updateLine(i,"unit",e.target.value)} className="bo-select">
                      {ing ? [ing.unit, ...(ing.conversions||[]).map(c=>c.unit)].map(u=><option key={u}>{u}</option>)
                           : ["gr","kg","ml","L","pcs","portion"].map(u=><option key={u}>{u}</option>)}
                    </select>

                    <div style={{ fontSize:12, fontWeight:700, color:cost>0?"var(--ink2)":"var(--ink5)", display:"flex", alignItems:"center" }}>
                      {cost>0 ? fmtD(cost) : "—"}
                    </div>

                    <button onClick={()=>removeLine(i)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize:18 }}>✕</button>
                  </div>
                )
              })}

              <button onClick={addLine} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ marginTop:4 }}>+ Add Ingredient</button>

              {/* COGS breakdown */}
              {lines.some(l=>l.ingredient_id&&l.qty>0) && (
                <div style={{ marginTop:16, padding:"12px 14px", background:"var(--surface)", borderRadius:"var(--r-lg)", border:"1px solid var(--surface3)" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"var(--ink4)", textTransform:"uppercase", marginBottom:8 }}>Cost Breakdown</div>
                  {lines.filter(l=>l.ingredient_id&&l.qty>0).map((line,i) => {
                    const ing = allIngredients.find(a=>a.id===line.ingredient_id)
                    if (!ing) return null
                    let qty = parseFloat(line.qty)||0
                    if (line.unit !== ing.unit) {
                      const conv = (ing.conversions||[]).find(c=>c.unit===line.unit)
                      if (conv && conv.qty) qty = qty * parseFloat(conv.qty)
                    }
                    const cost = qty * getCostPerUnit(ing)
                    const pct  = cogs > 0 ? Math.round(cost/cogs*100) : 0
                    return (
                      <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:"var(--ink)" }}>{ing.name}</div>
                          <div style={{ height:3, background:"var(--surface2)", borderRadius:2, marginTop:3, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:pct+"%", background:"var(--brand)", borderRadius:2 }} />
                          </div>
                        </div>
                        <div style={{ textAlign:"right", marginLeft:12 }}>
                          <div style={{ fontSize:12, fontWeight:700 }}>{fmtD(cost)}</div>
                          <div style={{ fontSize:10, color:"var(--ink5)" }}>{pct}%</div>
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ borderTop:"1px solid var(--surface3)", paddingTop:8, marginTop:4, display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:13, fontWeight:700 }}>Total COGS</span>
                    <span style={{ fontSize:15, fontWeight:900, color:"var(--brand)" }}>{fmtD(cogs)}</span>
                  </div>
                  {selected._type==="dish" && selPrice > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                      <span style={{ fontSize:12, color:"var(--ink4)" }}>Selling price</span>
                      <span style={{ fontSize:12, fontWeight:700 }}>{fmt(selPrice)}</span>
                    </div>
                  )}
                  {margin !== null && (
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                      <span style={{ fontSize:12, color:"var(--ink4)" }}>Gross Margin</span>
                      <span style={{ fontSize:13, fontWeight:900, color:margin>=60?"var(--green)":margin>=40?"var(--amber)":"var(--red)" }}>{fmtPct(margin)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Save button */}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:16, paddingTop:16, borderTop:"1px solid var(--surface3)" }}>
              <button onClick={()=>setSelected(null)} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={saveRecipe} disabled={saving} className="bo-btn bo-btn-primary">
                {saving ? "Saving..." : `Save Recipe & Update ${selected._type==="dish"?"Product COGS":"Sub Cost"}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
