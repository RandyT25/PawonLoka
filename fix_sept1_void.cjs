const { createClient } = require("@supabase/supabase-js");
const supabase = createClient("https://fnfivhnisigfnbvojonz.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU");

async function run() {
  const { data: existing } = await supabase.from('staff_submissions').select('id, data').eq('type', 'daily_recon');
  
  // Let's run this for all days just to be absolutely sure Voids aren't counted as +Masuk anywhere!
  for (const sub of existing) {
    const date = sub.data.date;
    const { data: movs } = await supabase.from('stock_movements').select('*').eq('date', date);
    
    sub.data.items.forEach(item => {
      let trueMasuk = 0;
      (movs || []).forEach(m => {
        // IGNORE Sale, Stock Reset, AND Void!
        if (m.type === 'Sale' || m.type === 'Stock Reset' || m.type === 'Void') return;
        if (m.ingredient_id === item.ingredient_id) {
           const q = parseFloat(m.qty) || 0;
           if (q > 0) trueMasuk += q;
        }
      });
      
      item.added_qty = trueMasuk;
      item.expected_qty = Math.max(0, item.opening_stock + item.added_qty - item.sold_qty - item.waste_qty - (item.production_qty || 0));
      item.diff_qty = item.actual_qty - item.expected_qty;
      item.diff_value = item.diff_qty < 0 ? Math.abs(item.diff_qty) * (item.cost_per_unit || 0) : 0;
    });
    
    const totalVar = sub.data.items.reduce((sum, i) => sum + (i.diff_value || 0), 0);
    sub.data.total_variance_value = totalVar;
    
    await supabase.from('staff_submissions').update({ data: sub.data }).eq('id', sub.id);
    console.log(`Fixed Voids on ${date}`);
  }
}
run();
