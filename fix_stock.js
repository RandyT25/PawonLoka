import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://fnfivhnisigfnbvojonz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU')

async function run() {
  console.log("Fetching latest completed opnames...")
  const { data: opnames } = await supabase.from('stock_opname').select('*').eq('status', 'Completed').gte('created_at', '2026-08-31')
  
  let trueStock = {}
  for (const op of opnames) {
      if (!op.items) continue;
      for (const item of op.items) {
          trueStock[item.ingredient_id] = item.actual_qty
      }
  }
  
  console.log(`Found true opname counts for ${Object.keys(trueStock).length} ingredients.`)
  
  console.log("Fetching all ingredients to apply the fix...")
  const { data: ings } = await supabase.from('ingredients').select('id, name, stock')
  
  let updates = []
  for (const ing of ings) {
      if (trueStock[ing.id] !== undefined && Math.abs(trueStock[ing.id] - ing.stock) > 0.001) {
          updates.push({ id: ing.id, name: ing.name, old: ing.stock, new: trueStock[ing.id] })
      }
  }
  
  console.log(`Need to correct ${updates.length} ingredients...`)
  
  for (const u of updates) {
      // 1. Update the ingredients table
      await supabase.from('ingredients').update({ stock: u.new }).eq('id', u.id)
      
      // 2. Update the 'Stock Reset' movement I created earlier
      await supabase.from('stock_movements')
          .update({ qty: u.new })
          .eq('ingredient_id', u.id)
          .eq('type', 'Stock Reset')
          .eq('date', '2026-09-01')
  }
  
  console.log("Done! Live stock now perfectly matches what was actually counted.")
}
run()
