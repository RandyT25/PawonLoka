// One-off repair: Detergen's conversions[] has {unit:"kg", qty:1} — i.e. the system thinks
// 1kg = 1gr, when it should be qty:1000 (base unit is "gr"). This has been silently inflating
// Detergen's WAC (cost_per_unit) every time it's purchased in kg. Fix the conversion factor and
// recompute cost_per_unit using the same weighted-average formula InvIngredients.jsx's own
// wacFromConvs() uses (avg of last_price across priced conversions, weighted by qty).
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(Boolean).map(l => {
  const i = l.indexOf('=')
  return [l.slice(0, i), l.slice(i + 1)]
}))
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const ING_ID = 'ING-1780241987065' // Detergen

const { data: ing, error } = await supabase.from('ingredients').select('*').eq('id', ING_ID).maybeSingle()
if (error || !ing) { console.error('Fetch failed', error); process.exit(1) }

const kgConv = (ing.conversions || []).find(c => c.unit === 'kg')
if (!kgConv || parseFloat(kgConv.qty) !== 1) {
  console.error('State has changed since diagnosis (kg conversion is', JSON.stringify(kgConv), ') — aborting, re-verify manually.')
  process.exit(1)
}

console.log('Before: conversions=', JSON.stringify(ing.conversions), ' cost_per_unit=', ing.cost_per_unit)

const fixedConvs = ing.conversions.map(c => c.unit === 'kg' ? { ...c, qty: 1000 } : c)
const priced = fixedConvs.filter(c => c.last_price > 0 && c.qty > 0)
const newWAC = priced.length
  ? priced.reduce((a, c) => a + c.last_price, 0) / priced.reduce((a, c) => a + parseFloat(c.qty), 0)
  : ing.cost_per_unit

const { error: updErr } = await supabase.from('ingredients').update({ conversions: fixedConvs, cost_per_unit: newWAC }).eq('id', ING_ID)
if (updErr) { console.error('Update failed', updErr); process.exit(1) }

console.log('After: conversions=', JSON.stringify(fixedConvs), ' cost_per_unit=', newWAC)
console.log('Repaired', ING_ID)
