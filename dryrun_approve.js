import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://fnfivhnisigfnbvojonz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU')

async function run() {
  const { data: ingredients } = await supabase.from('ingredients').select('*')
  
  const { data: sub } = await supabase.from('staff_submissions').select('*').eq('id', 'SS-1788193888828').single()
  
  try {
      const countDate = sub.data.date || (sub.submitted_at||new Date().toISOString()).slice(0,10)
      for (const item of sub.data.items||[]) {
        const { data:freshIng } = await supabase.from("ingredients").select("stock").eq("id",item.ingredient_id).maybeSingle()
        const newStock = Math.max(0, (freshIng?.stock ?? item.system_qty) + item.diff)
        const { error:updErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id",item.ingredient_id)
        if (updErr) throw updErr
        const { error:movErr } = await supabase.from("stock_movements").insert({
          id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
          type:"Adjustment", ingredient_id:item.ingredient_id, ingredient_name:item.name,
          qty:item.diff, unit:item.unit, ref:sub.id,
          note:"Staff opname by "+sub.submitted_by,
          date:countDate,
          time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
        })
        if (movErr) throw movErr
      }
      
      const { error:opnErr } = await supabase.from("stock_opname").insert({
        id:"OPN-"+Date.now(), date:countDate,
        status:"Completed",
        items:sub.data.items.map(i=>{
          const cost = ingredients.find(x=>x.id===i.ingredient_id)?.cost_per_unit||0
          return { ...i, ingredient_name: i.ingredient_name || i.name, value_diff: i.diff*cost }
        }),
        total_variance:sub.data.items.reduce((a,i)=>a+(i.diff*(ingredients.find(x=>x.id===i.ingredient_id)?.cost_per_unit||0)),0)
      })
      if (opnErr) throw opnErr
      
      console.log("No errors thrown!")
  } catch(e) {
      console.log("Caught Error:", e)
  }
}
run().catch(console.error)
