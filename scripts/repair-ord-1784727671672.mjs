// One-off repair: restore the "Sate Kambing" item dropped from ORD-1784727671672's
// stored items array by the pre-a1ba49c items-not-rewritten-at-charge bug.
// Ground truth: photographed receipt showing 6 items totaling Rp 128.000, incl. 1x Sate Kambing Rp 38.000.
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(Boolean).map(l => {
  const i = l.indexOf('=')
  return [l.slice(0, i), l.slice(i + 1)]
}))
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const ORDER_ID = 'ORD-1784727671672'
const { data: order, error } = await supabase.from('orders').select('*').eq('id', ORDER_ID).maybeSingle()
if (error || !order) { console.error('Could not fetch order', error); process.exit(1) }

if (order.items.some(i => i.sku === 'SAT045')) {
  console.log('Sate Kambing already present — no repair needed.')
  process.exit(0)
}

const itemsSum = order.items.reduce((s, i) => s + i.price * i.qty, 0)
console.log('Before: items sum =', itemsSum, ' stored total =', order.total, ' stored subtotal =', order.subtotal)

const newItems = [...order.items, {
  cat: 'Sate', qty: 1, sku: 'SAT045', name: 'Sate Kambing', note: '',
  _sent: false, price: 38000, _station: 'kitchen',
  isBundle: false, modifiers: {}, bundleItems: null,
}]
const newSubtotal = newItems.reduce((s, i) => s + i.price * i.qty, 0)

const { data: updated, error: updErr } = await supabase.from('orders')
  .update({ items: newItems, subtotal: newSubtotal })
  .eq('id', ORDER_ID)
  .select()
  .maybeSingle()

if (updErr) { console.error('Update failed', updErr); process.exit(1) }

console.log('After: items sum =', updated.items.reduce((s, i) => s + i.price * i.qty, 0), ' stored total =', updated.total, ' stored subtotal =', updated.subtotal)
console.log('Repaired', ORDER_ID)
