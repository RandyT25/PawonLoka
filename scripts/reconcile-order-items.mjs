// One-off diagnostic: find Paid dine-in orders (2026-07-01 through the a1ba49c fix
// deploy) whose stored `items` array likely doesn't reflect everything charged —
// the same pre-fix bug repaired for ORD-1784727671672. Read-only (no writes).
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(Boolean).map(l => {
  const i = l.indexOf('=')
  return [l.slice(0, i), l.slice(i + 1)]
}))
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const SCAN_FROM = '2026-05-01T00:00:00+07:00'
const FIX_DEPLOY_UTC = '2026-07-22T23:06:02Z'
const TOLERANCE = 500

const { data: iceCream } = await supabase.from('products').select('sku,name,price').eq('cat', 'Ice Cream').eq('active', true)

let all = []
let from = 0
const PAGE = 1000
while (true) {
  const { data, error } = await supabase.from('orders').select('*')
    .eq('status', 'Paid').not('table', 'is', null)
    .gte('created_at', SCAN_FROM).lte('created_at', FIX_DEPLOY_UTC)
    .order('created_at', { ascending: true })
    .range(from, from + PAGE - 1)
  if (error) { console.error(error); process.exit(1) }
  all = all.concat(data)
  if (data.length < PAGE) break
  from += PAGE
}

console.log(`Scanning ${all.length} Paid dine-in orders from ${SCAN_FROM} through fix deploy...\n`)

const flagged = []
for (const o of all) {
  const items = Array.isArray(o.items) ? o.items : []
  const itemsSubtotal = items.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0)
  const expectedTotal = itemsSubtotal - (o.discount || 0) + (o.tax || 0) + (o.delivery_fee || 0) - (o.refund_amount || 0)
  const discrepancy = (o.total || 0) - expectedTotal
  if (Math.abs(discrepancy) <= TOLERANCE) continue

  let iceCreamMatch = ''
  if (discrepancy > 0 && iceCream?.length) {
    for (const p of iceCream) {
      for (let n = 1; n <= 3; n++) {
        if (Math.abs(discrepancy - p.price * n) <= TOLERANCE) { iceCreamMatch = `${n}x ${p.name}`; break }
      }
      if (iceCreamMatch) break
    }
  }

  flagged.push({
    id: o.id, date: o.date, time: o.time, table: o.table, staff: o.staff,
    total: o.total, itemsSubtotal, discrepancy, iceCreamMatch,
  })
}

flagged.sort((a, b) => b.discrepancy - a.discrepancy)

console.log(`Flagged ${flagged.length} orders with items/total mismatch (> Rp ${TOLERANCE}):\n`)
console.table(flagged.map(f => ({
  order: f.id.slice(-10), date: f.date, time: f.time, table: f.table, staff: f.staff,
  total: f.total, itemsSubtotal: f.itemsSubtotal, discrepancy: f.discrepancy, iceCreamMatch: f.iceCreamMatch,
})))

const grandTotal = flagged.reduce((s, f) => s + f.discrepancy, 0)
const missingCount = flagged.filter(f => f.discrepancy > 0).length
const overcountCount = flagged.filter(f => f.discrepancy < 0).length
const iceCreamFlagged = flagged.filter(f => f.iceCreamMatch).length

console.log(`\nOrders with likely dropped item(s) (positive discrepancy): ${missingCount}`)
console.log(`Orders with unexplained overcounted items (negative discrepancy, separate anomaly): ${overcountCount}`)
console.log(`Orders with a discrepancy amount matching an ice cream product price: ${iceCreamFlagged}`)
console.log(`Total net discrepancy across all flagged orders: Rp ${grandTotal.toLocaleString('id-ID')}`)
console.log(`Sum of positive (likely-dropped-item) discrepancies: Rp ${flagged.filter(f=>f.discrepancy>0).reduce((s,f)=>s+f.discrepancy,0).toLocaleString('id-ID')}`)

const csvPath = '/private/tmp/claude-501/-Users-randy-PawonLoka-POS-Dashboard/f4696c37-59be-4027-be41-8b06047536b2/scratchpad/order-item-discrepancies-2026-07.csv'
const header = 'order_id,date,time,table,staff,total,items_subtotal,discrepancy,possible_ice_cream_match\n'
const rows = flagged.map(f => [f.id, f.date, f.time, f.table, f.staff, f.total, f.itemsSubtotal, f.discrepancy, f.iceCreamMatch].join(',')).join('\n')
fs.writeFileSync(csvPath, header + rows)
console.log(`\nCSV written to ${csvPath}`)
