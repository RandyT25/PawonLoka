const { createClient } = require("@supabase/supabase-js");
const supabase = createClient("https://fnfivhnisigfnbvojonz.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU");

async function run() {
  const { data: existing } = await supabase.from('staff_submissions').select('*').eq('type', 'daily_recon');
  
  for (const sub of existing) {
    const date = sub.data.date;
    const { data: movs } = await supabase.from('stock_movements').select('*').eq('date', date);
    
    sub.data.items.forEach(item => {
      let prodQty = 0;
      let wasteQty = 0;
      
      (movs || []).forEach(m => {
        if (m.ingredient_id === item.ingredient_id) {
           const q = parseFloat(m.qty) || 0;
           if (q < 0 && m.type === 'Production') {
              prodQty += Math.abs(q);
           } else if (q < 0 && m.type !== 'Sale' && m.type !== 'Production') {
              wasteQty += Math.abs(q);
           }
        }
      });
      
      item.production_qty = prodQty;
      item.waste_qty = wasteQty; // This overrides the previous combined waste_qty
    });
    
    await supabase.from('staff_submissions').update({ data: sub.data }).eq('id', sub.id);
    console.log(`Updated ${date}`);
  }
}
run();
