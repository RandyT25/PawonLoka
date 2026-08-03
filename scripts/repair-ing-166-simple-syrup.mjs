// One-off repair: production batch PRD-1785032118268 (Simple Syrup, 2026-07-10) recorded
// batch_qty=7,500,000ml — a 1000x fat-finger for 7,500ml (the very next batch, 2026-07-13,
// is exactly 7,500ml; the ratio to this recipe's yield_qty of 1,500ml is a clean 5x like every
// other batch, whereas 7,500,000 is a 5000x outlier). ingredients_used for this batch was scaled
// by the same erroneous factor (Air 2,500,000ml, Gula Pasir 5,000,000gr instead of 2,500/5,000).
// Verified: ING-166's stock is purely additive (sum of all production_batches.batch_qty for this
// item + one opname backfill diff of +1000 == current stock exactly, 7,531,500 + 1,000 = 7,532,500),
// so subtracting the excess is a clean, mathematically safe correction — nothing else has ever
// touched this ingredient's stock.
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(Boolean).map(l => {
  const i = l.indexOf('=')
  return [l.slice(0, i), l.slice(i + 1)]
}))
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const BATCH_ID = 'PRD-1785032118268'
const ING_ID = 'ING-166'

const { data: batch, error: e1 } = await supabase.from('production_batches').select('*').eq('id', BATCH_ID).maybeSingle()
const { data: ing, error: e2 } = await supabase.from('ingredients').select('*').eq('id', ING_ID).maybeSingle()
if (e1 || e2 || !batch || !ing) { console.error('Fetch failed', e1, e2); process.exit(1) }

if (batch.batch_qty !== 7500000 || ing.stock !== 7532500) {
  console.error('State has changed since diagnosis (batch_qty=', batch.batch_qty, ', ing.stock=', ing.stock, ') — aborting, re-verify manually.')
  process.exit(1)
}

console.log('Before: batch_qty=', batch.batch_qty, ' ingredients_used=', JSON.stringify(batch.ingredients_used), ' ING-166 stock=', ing.stock)

const correctedIngredientsUsed = batch.ingredients_used.map(u => ({ ...u, qty: u.qty / 1000 }))
const { error: e3 } = await supabase.from('production_batches')
  .update({ batch_qty: 7500, ingredients_used: correctedIngredientsUsed })
  .eq('id', BATCH_ID)
if (e3) { console.error('Batch update failed', e3); process.exit(1) }

const correctedStock = ing.stock - 7500000 + 7500 // = 40000
const { error: e4 } = await supabase.from('ingredients').update({ stock: correctedStock }).eq('id', ING_ID)
if (e4) { console.error('Ingredient stock update failed', e4); process.exit(1) }

const { error: e5 } = await supabase.from('stock_movements').insert({
  id: 'MOV-' + Date.now() + '-fix',
  type: 'Correction', ingredient_id: ING_ID, ingredient_name: ing.name,
  qty: correctedStock - ing.stock, unit: ing.unit, ref: BATCH_ID,
  note: 'Manual data-repair: original batch entry 7,500,000ml was a 1000x fat-finger for 7,500ml (matches the immediately following batch and the recipe\'s normal scaling pattern).',
  date: new Date().toISOString().slice(0, 10),
  time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
})
if (e5) { console.error('Movement log failed', e5); process.exit(1) }

console.log('After: batch_qty=7500, ingredients_used=', JSON.stringify(correctedIngredientsUsed), ' ING-166 stock=', correctedStock)
console.log('Repaired', BATCH_ID, 'and', ING_ID)
