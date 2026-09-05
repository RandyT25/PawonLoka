import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://fnfivhnisigfnbvojonz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU')
import fs from 'fs'
import crypto from 'crypto'

async function run() {
  console.log("Fetching current ingredients...")
  const { data: ingredients } = await supabase.from('ingredients').select('id, name, unit, stock')
  
  console.log("Fetching all stock movements before Sept 1...")
  let oldMovements = []
  let hasMore = true
  let page = 0
  while (hasMore) {
      const { data } = await supabase.from('stock_movements').select('*').lt('date', '2026-09-01').range(page*1000, (page+1)*1000 - 1)
      if (data && data.length > 0) {
          oldMovements = oldMovements.concat(data)
          page++
          hasMore = data.length === 1000
      } else {
          hasMore = false
      }
  }
  
  console.log(`Found ${oldMovements.length} old movements. Backing up...`)
  fs.writeFileSync('stock_movements_backup.json', JSON.stringify(oldMovements))
  
  console.log("Deleting old movements...")
  // Supabase delete in chunks
  for (let i = 0; i < oldMovements.length; i += 1000) {
      const chunk = oldMovements.slice(i, i+1000).map(m => m.id)
      await supabase.from('stock_movements').delete().in('id', chunk)
  }
  
  console.log("Inserting Initial Stock records for Sept 1...")
  const inserts = ingredients.map(ing => ({
      id: "MOV-" + crypto.randomUUID(),
      type: "Stock Reset",
      ingredient_id: ing.id,
      ingredient_name: ing.name,
      qty: ing.stock,
      unit: ing.unit,
      ref: "SEPT-1-BASELINE",
      note: "Initial Stock (Sept 1 Baseline)",
      date: "2026-09-01",
      time: "00:00"
  }))
  
  for (let i = 0; i < inserts.length; i += 500) {
      await supabase.from('stock_movements').insert(inserts.slice(i, i+500))
  }
  
  console.log("Zeroing out Opname Variance so it doesn't hurt P&L...")
  await supabase.from('stock_opname').update({ total_variance: 0 }).lt('date', '2026-09-01')
  
  console.log("Done! Clean slate achieved.")
}
run().catch(console.error)
