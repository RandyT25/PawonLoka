// Read-only audit for unit-conversion / cost anomalies in the inventory system.
// Run with: node scripts/audit-unit-anomalies.mjs
// Makes no writes — SELECT only.
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(Boolean).map(l => {
  const i = l.indexOf('=')
  return [l.slice(0, i), l.slice(i + 1)]
}))
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const BIG_UNITS = ["kg","L","Galon","dus","karung","box","sack","pack","sachet","bungkus","botol","ikat"]
const SMALL_BASE = ["gr","ml","pcs"]

const { data: ingredients } = await supabase.from('ingredients').select('*')
const ingMap = Object.fromEntries((ingredients||[]).map(i => [i.id, i]))

console.log('=== 1. Production batches deviating >50x / <0.02x from recipe yield_qty ===')
const { data: subRecipes } = await supabase.from('sub_recipes').select('id,ingredient_id,yield_qty,yield_unit')
const srByIngId = Object.fromEntries((subRecipes||[]).filter(s=>s.ingredient_id).map(s => [s.ingredient_id, s]))
const { data: batches } = await supabase.from('production_batches').select('id,item_id,item_name,batch_qty,unit,date')
let flagged1 = 0
for (const b of batches||[]) {
  const sr = srByIngId[b.item_id]
  if (!sr || !sr.yield_qty) continue
  const ratio = (parseFloat(b.batch_qty)||0) / parseFloat(sr.yield_qty)
  if (ratio > 50 || ratio < 0.02) {
    console.log(`  ${b.id} (${b.date}) ${b.item_name}: batch_qty=${b.batch_qty}${b.unit} vs recipe yield=${sr.yield_qty}${sr.yield_unit} (ratio ${ratio.toFixed(1)}x)`)
    flagged1++
  }
}
if (!flagged1) console.log('  (none found)')

console.log('\n=== 2. Ingredients with a large-unit conversion factor <= 1 ===')
let flagged2 = 0
for (const ing of ingredients||[]) {
  if (!SMALL_BASE.includes(ing.unit)) continue
  for (const c of ing.conversions||[]) {
    if (BIG_UNITS.includes(c.unit) && (parseFloat(c.qty)||0) <= 1) {
      console.log(`  ${ing.id} ${ing.name}: 1 ${c.unit} = ${c.qty} ${ing.unit} (last_price=${c.last_price})`)
      flagged2++
    }
  }
}
if (!flagged2) console.log('  (none found)')

console.log('\n=== 3. Ingredients with negative stock or cost_per_unit ===')
let flagged3 = 0
for (const ing of ingredients||[]) {
  if ((ing.stock||0) < 0 || (ing.cost_per_unit||0) < 0) {
    console.log(`  ${ing.id} ${ing.name}: stock=${ing.stock} cost_per_unit=${ing.cost_per_unit}`)
    flagged3++
  }
}
if (!flagged3) console.log('  (none found)')

console.log('\n=== 4. Purchase orders with total<=0 or outlier line unit_cost (>5x / <0.2x ingredient\'s current cost, same unit basis) ===')
function toBaseUnit(ing, qty, unit) {
  if (!ing || unit === ing.unit) return qty
  const conv = (ing.conversions||[]).find(c => c.unit === unit)
  if (conv && parseFloat(conv.qty) > 0) return qty * parseFloat(conv.qty)
  const fallbacks = { kg:1000, L:1000, Galon:19000 }
  if ((ing.unit === "gr" || ing.unit === "ml") && fallbacks[unit]) return qty * fallbacks[unit]
  return qty
}
const { data: pos } = await supabase.from('purchase_orders').select('id,total,items,date')
let flagged4 = 0
for (const po of pos||[]) {
  if ((po.total||0) <= 0) { console.log(`  ${po.id} (${po.date}): total=${po.total}`); flagged4++ }
  for (const item of po.items||[]) {
    const ing = ingMap[item.ingredient_id]
    if (!ing || !ing.cost_per_unit) continue
    // Price ing.cost_per_unit (per base unit) on the SAME basis as item.unit_cost (per purchase unit).
    const ref = ing.cost_per_unit * toBaseUnit(ing, 1, item.unit)
    if (ref > 0 && item.unit_cost && (item.unit_cost > ref*5 || item.unit_cost < ref*0.2)) {
      console.log(`  ${po.id} (${po.date}): ${ing.name} unit_cost=${item.unit_cost}/${item.unit} vs ref=${ref.toFixed(2)}/${item.unit}`)
      flagged4++
    }
  }
}
if (!flagged4) console.log('  (none found)')

console.log('\n=== 5. Stock opname entries with |total_variance| > 500,000 ===')
const { data: opnames } = await supabase.from('stock_opname').select('id,date,status,total_variance')
let flagged5 = 0
for (const o of (opnames||[]).sort((a,b)=>Math.abs(b.total_variance||0)-Math.abs(a.total_variance||0))) {
  if (Math.abs(o.total_variance||0) > 500000) {
    console.log(`  ${o.id} (${o.date}) ${o.status}: total_variance=${o.total_variance}`)
    flagged5++
  }
}
if (!flagged5) console.log('  (none found)')

console.log(`\nTotal flags: ${flagged1+flagged2+flagged3+flagged4+flagged5}`)
