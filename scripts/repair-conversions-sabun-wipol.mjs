// One-off repair: Sabun Cuci Tangan and Wipol both have conversions[] like {unit:"pack", qty:1}
// — i.e. the system thinks 1 pack = 1 gram, when the owner confirmed the real pack sizes are:
//   - Sabun Cuci Tangan: 400g per pack, at Rp 7,500 (correcting the stored last_price of 11,900)
//   - Wipol: 750g per pack, at Rp 12,900 (matches the stored last_price already)
// Recompute cost_per_unit using the same weighted-average formula InvIngredients.jsx's own
// wacFromConvs() uses (avg of last_price across priced conversions, weighted by qty).
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(Boolean).map(l => {
  const i = l.indexOf('=')
  return [l.slice(0, i), l.slice(i + 1)]
}))
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const FIXES = [
  { id: 'ING-1780241973482', name: 'Sabun Cuci Tangan', packQty: 400, packPrice: 7500 },
  { id: 'ING-1780241949348', name: 'Wipol', packQty: 750, packPrice: 12900 },
]

for (const fix of FIXES) {
  const { data: ing, error } = await supabase.from('ingredients').select('*').eq('id', fix.id).maybeSingle()
  if (error || !ing) { console.error('Fetch failed for', fix.id, error); continue }

  const packConv = (ing.conversions || []).find(c => c.unit === 'pack')
  if (!packConv || parseFloat(packConv.qty) !== 1) {
    console.error(`State has changed since diagnosis for ${fix.name} (pack conversion is`, JSON.stringify(packConv), ') — skipping, re-verify manually.')
    continue
  }

  console.log(`Before (${fix.name}): conversions=`, JSON.stringify(ing.conversions), ' cost_per_unit=', ing.cost_per_unit)

  const fixedConvs = ing.conversions.map(c => c.unit === 'pack' ? { ...c, qty: fix.packQty, last_price: fix.packPrice } : c)
  const priced = fixedConvs.filter(c => c.last_price > 0 && c.qty > 0)
  const newWAC = priced.length
    ? priced.reduce((a, c) => a + c.last_price, 0) / priced.reduce((a, c) => a + parseFloat(c.qty), 0)
    : ing.cost_per_unit

  const { error: updErr } = await supabase.from('ingredients').update({ conversions: fixedConvs, cost_per_unit: newWAC }).eq('id', fix.id)
  if (updErr) { console.error('Update failed for', fix.id, updErr); continue }

  console.log(`After (${fix.name}): conversions=`, JSON.stringify(fixedConvs), ' cost_per_unit=', newWAC)
  console.log('Repaired', fix.id)
}
