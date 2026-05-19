import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }

export default function Recipes() {
  const [products,    setProducts]    = useState([])
  const [ingredients, setIngredients] = useState([])
  const [recipes,     setRecipes]     = useState([])
  const [selected,    setSelected]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [lines,       setLines]       = useState([])
  const [search,      setSearch]      = useState("")

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{data:p},{data:i},{data:r}] = await Promise.all([
      supabase.from("products").select("id,name,price,category").order("name"),
      supabase.from("ingredients").select("*").order("name"),
      supabase.from("recipes").select("*"),
    ])
    setProducts(p||[]); setIngredients(i||[]); setRecipes(r||[])
    setLoading(false)
  }

  function selectProduct(p) {
    setSelected(p)
    const existing = recipes.filter(r=>r.product_id===p.id)
    setLines(existing.length?existing.map(r=>({...r})):[{ingredient_id:"",qty:0,unit:""}])
  }

  function addLine()       { setLines(l=>[...l,{ingredient_id:"",qty:0,unit:""}]) }
  function removeLine(i)   { setLines(l=>l.filter((_,idx)=>idx!==i)) }
  function updateLine(i,k,v){ setLines(l=>l.map((x,idx)=>idx===i?{...x,[k]:v}:x)) }

  function calcCogs() {
    return lines.reduce((sum,line)=>{
      const ing = ingredients.find(i=>i.id===line.ingredient_id)
      if (!ing||!line.qty) return sum
      return sum+(ing.cost_per_unit||0)*parseFloat(line.qty||0)
    },0)
  }

  async function saveRecipe() {
    if (!selected) return
    setSaving(true)
    await supabase.from("recipes").delete().eq("product_id",selected.id)
    const valid = lines.filter(l=>l.ingredient_id&&l.qty>0)
    if (valid.length) await supabase.from("recipes").insert(valid.map((l,i)=>({id:`RCP-${selected.id}-${i}-${Date.now()}`,product_id:selected.id,ingredient_id:l.ingredient_id,qty:parseFloat(l.qty),unit:l.unit||""})))
    const cogs = calcCogs()
    await supabase.from("products").update({cogs}).eq("id",selected.id)
    await load(); setSaving(false)
    alert("Recipe saved! COGS updated to "+fmt(cogs))
  }

  const filtered = products.filter(p=>!search||p.name.toLowerCase().includes(search.toLowerCase()))
  const cogs     = calcCogs()
  const margin   = selected?Math.round((selected.price-cogs)/selected.price*100):0

  return (
    <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:16,height:"calc(100vh - 140px)"}}>
      <div className="bo-card" style={{marginBottom:0,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div className="bo-card-title">Products</div>
        <input value={search} onChange={e=>setSearch(e.target.value)} className="bo-input" placeholder="Search..." style={{marginBottom:10}} />
        <div style={{overflowY:"auto",flex:1}}>
          {loading?<div style={{textAlign:"center",color:"var(--ink5)",padding:20}}>Loading...</div>
          :filtered.map(p=>{
            const hasRecipe = recipes.some(r=>r.product_id===p.id)
            return (
              <div key={p.id} onClick={()=>selectProduct(p)} style={{padding:"10px 12px",borderRadius:8,cursor:"pointer",marginBottom:4,background:selected?.id===p.id?"var(--brand-lt)":"transparent",border:selected?.id===p.id?"1.5px solid var(--brand)":"1.5px solid transparent"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--ink)"}}>{p.name}</div>
                <div style={{fontSize:11,color:"var(--ink5)",display:"flex",gap:6,marginTop:2}}>
                  <span>{fmt(p.price)}</span>
                  {hasRecipe&&<span className="bo-badge bo-badge-green" style={{fontSize:9}}>Has Recipe</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="bo-card" style={{marginBottom:0,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {!selected?(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",flex:1,color:"var(--ink5)",fontSize:14}}>← Select a product to edit its recipe</div>
        ):(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <div>
                <div className="bo-card-title" style={{marginBottom:4}}>{selected.name}</div>
                <div style={{fontSize:12,color:"var(--ink4)"}}>Selling price: {fmt(selected.price)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:"var(--ink4)"}}>Est. COGS</div>
                <div style={{fontSize:22,fontWeight:900,color:cogs>selected.price*0.5?"var(--red)":"var(--green)"}}>{fmt(cogs)}</div>
                <div style={{fontSize:11,color:"var(--ink5)"}}>Margin {margin}%</div>
              </div>
            </div>
            <div style={{flex:1,overflowY:"auto"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 100px 80px 36px",gap:8,marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--ink4)"}}>INGREDIENT</div>
                <div style={{fontSize:11,fontWeight:700,color:"var(--ink4)"}}>QTY</div>
                <div style={{fontSize:11,fontWeight:700,color:"var(--ink4)"}}>UNIT</div>
                <div/>
              </div>
              {lines.map((line,i)=>(
                <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 100px 80px 36px",gap:8,marginBottom:8}}>
                  <select value={line.ingredient_id} onChange={e=>updateLine(i,"ingredient_id",e.target.value)} className="bo-select">
                    <option value="">-- Select --</option>
                    {ingredients.map(ing=><option key={ing.id} value={ing.id}>{ing.name} ({fmt(ing.cost_per_unit||0)}/{ing.unit})</option>)}
                  </select>
                  <input type="number" value={line.qty} onChange={e=>updateLine(i,"qty",e.target.value)} className="bo-input" placeholder="0" min={0} step={0.1} />
                  <input value={line.unit} onChange={e=>updateLine(i,"unit",e.target.value)} className="bo-input" placeholder="g/ml" />
                  <button onClick={()=>removeLine(i)} className="bo-btn bo-btn-danger bo-btn-sm" style={{padding:"0 10px"}}>✕</button>
                </div>
              ))}
              <button onClick={addLine} className="bo-btn bo-btn-ghost bo-btn-sm" style={{marginTop:4}}>+ Add Ingredient</button>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16,paddingTop:16,borderTop:"1px solid var(--surface3)"}}>
              <button onClick={saveRecipe} disabled={saving} className="bo-btn bo-btn-primary">{saving?"Saving...":"Save Recipe & Update COGS"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
