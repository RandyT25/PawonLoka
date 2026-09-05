const { createClient } = require("@supabase/supabase-js");
const supabase = createClient("https://fnfivhnisigfnbvojonz.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU");

const IDs = { ungkep: 'ING-1780245811602', sopIga: 'ING-170' };

async function run() {
  const { data: existing } = await supabase.from('staff_submissions').select('id, data').eq('type', 'daily_recon');
  
  for (const ex of existing) {
    let changed = false;
    
    if (ex.data.date === "2026-09-03") {
      const item = ex.data.items.find(i => i.ingredient_id === IDs.ungkep);
      if (item) {
        // Fix Sept 3 Ungkep
        item.opening_stock = 33;
        item.added_qty = 0; // Remove the fake positive masuk
        item.sold_qty = 2;
        item.waste_qty = 1; // User confirmed waste
        item.expected_qty = 30; // 33 - 2 - 1 = 30
        item.actual_qty = 30; // 30
        item.diff_qty = 0;
        item.diff_value = 0;
        changed = true;
      }
    }
    
    if (ex.data.date === "2026-09-04") {
      // Fix Sept 4 Ungkep
      const itemU = ex.data.items.find(i => i.ingredient_id === IDs.ungkep);
      if (itemU) {
        itemU.opening_stock = 30; // Carry over from 30
        itemU.added_qty = 0;
        itemU.sold_qty = 6;
        itemU.waste_qty = 0;
        itemU.expected_qty = 24; // 30 - 6 = 24
        itemU.actual_qty = 24; 
        itemU.diff_qty = 0;
        itemU.diff_value = 0;
        changed = true;
      }
      
      // Ensure Sup Iga is exactly 5
      const itemS = ex.data.items.find(i => i.ingredient_id === IDs.sopIga);
      if (itemS) {
        itemS.sold_qty = 5; 
        itemS.expected_qty = itemS.opening_stock + itemS.added_qty - itemS.sold_qty - itemS.waste_qty;
        itemS.diff_qty = itemS.actual_qty - itemS.expected_qty;
        itemS.diff_value = itemS.diff_qty < 0 ? Math.abs(itemS.diff_qty) * (itemS.cost_per_unit || 0) : 0;
        changed = true;
      }
    }

    if (changed) {
      const totalVar = ex.data.items.reduce((sum, i) => sum + (i.diff_value || 0), 0);
      ex.data.total_variance_value = totalVar;
      await supabase.from('staff_submissions').update({ data: ex.data }).eq('id', ex.id);
      console.log(`Updated ${ex.data.date}`);
    }
  }
}
run();
