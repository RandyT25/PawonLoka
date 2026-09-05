import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
const supabase = createClient('https://fnfivhnisigfnbvojonz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU')

async function run() {
  const { data: ings } = await supabase.from('ingredients').select('*').lt('stock', 0)
  
  for (const ing of ings) {
      // Set to 0 in ingredients table
      await supabase.from('ingredients').update({ stock: 0 }).eq('id', ing.id)
      
      // Update or insert Stock Reset in stock_movements
      const { data: existing } = await supabase.from('stock_movements').select('id').eq('ingredient_id', ing.id).eq('type', 'Stock Reset').eq('date', '2026-09-01')
      if (existing && existing.length > 0) {
          await supabase.from('stock_movements').update({ qty: 0 }).eq('id', existing[0].id)
      } else {
          await supabase.from('stock_movements').insert({
              id: "MOV-" + crypto.randomUUID(),
              type: "Stock Reset",
              ingredient_id: ing.id,
              ingredient_name: ing.name,
              qty: 0,
              unit: ing.unit,
              ref: "SEPT-1-BASELINE",
              note: "Initial Stock (Sept 1 Baseline) - Forced to 0 from uncounted negative",
              date: "2026-09-01",
              time: "00:00"
          })
      }
  }
  console.log("Fixed the 6 negative items!")
}
run()
