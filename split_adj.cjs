const { createClient } = require("@supabase/supabase-js");
const supabase = createClient("https://fnfivhnisigfnbvojonz.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU");

async function run() {
  const { data: existing } = await supabase.from('staff_submissions').select('*').eq('type', 'daily_recon');
  
  for (const sub of existing) {
    const date = sub.data.date;
    const { data: movs } = await supabase.from('stock_movements').select('*').eq('date', date);
    
    sub.data.items.forEach(item => {
      let wasteQty = 0;
      let adjQty = 0;
      
      (movs || []).forEach(m => {
        if (m.ingredient_id === item.ingredient_id) {
           const q = parseFloat(m.qty) || 0;
           // We only want to process negative adjustments here because positive adjustments were technically 
           // caught by added_qty, wait! If added_qty caught positive Adjustments, we need to fix that too!
           // The user expects +Masuk to be Production or Purchase.
        }
      });
      
      // Let's re-calculate all of it to be safe
      let trueMasuk = 0;
      let trueWaste = 0;
      let trueAdj = 0;
      let trueProd = 0;
      
      (movs || []).forEach(m => {
        if (m.ingredient_id !== item.ingredient_id) return;
        const q = parseFloat(m.qty) || 0;
        
        if (m.type === 'Sale' || m.type === 'Stock Reset' || m.type === 'Void') return;
        
        if (m.type === 'Purchase' || m.type === 'PO Receive' || (m.type === 'Production' && q > 0)) {
           trueMasuk += Math.abs(q);
        } else if (m.type === 'Production' && q < 0) {
           trueProd += Math.abs(q);
        } else if (m.type === 'Waste' && q < 0) {
           trueWaste += Math.abs(q);
        } else if (m.type === 'Adjustment') {
           trueAdj += q; // can be positive or negative
        }
      });
      
      item.added_qty = trueMasuk;
      item.production_qty = trueProd;
      item.waste_qty = trueWaste;
      item.adj_qty = trueAdj;
      
      item.expected_qty = Math.max(0, item.opening_stock + item.added_qty + item.adj_qty - item.sold_qty - item.waste_qty - item.production_qty);
      item.diff_qty = item.actual_qty - item.expected_qty;
      item.diff_value = item.diff_qty < 0 ? Math.abs(item.diff_qty) * (item.cost_per_unit || 0) : 0;
    });
    
    await supabase.from('staff_submissions').update({ data: sub.data }).eq('id', sub.id);
    console.log(`Updated Adjs on ${date}`);
  }
}
run();
