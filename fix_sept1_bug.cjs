const { createClient } = require("@supabase/supabase-js");
const supabase = createClient("https://fnfivhnisigfnbvojonz.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU");

async function run() {
  const { data: existing } = await supabase.from('staff_submissions').select('id, data').eq('type', 'daily_recon');
  const sept1 = existing.find(e => e.data.date === "2026-09-01");
  if (!sept1) return console.log("Not found");
  
  // Need to get the actual stock movements to recalculate WITHOUT Stock Reset
  const { data: movs } = await supabase.from('stock_movements').select('*').eq('date', "2026-09-01");
  const trueMasuk = {};
  (movs || []).forEach(m => {
    if (m.type === 'Sale' || m.type === 'Stock Reset') return; // IGNORE INITIAL SETUP!
    const q = parseFloat(m.qty) || 0;
    if (q > 0) trueMasuk[m.ingredient_id] = (trueMasuk[m.ingredient_id] || 0) + q;
  });

  sept1.data.items.forEach(item => {
    // Re-assign +Masuk without the Stock Reset
    item.added_qty = trueMasuk[item.ingredient_id] || 0;
    // Recompute
    item.expected_qty = Math.max(0, item.opening_stock + item.added_qty - item.sold_qty - item.waste_qty);
    item.diff_qty = item.actual_qty - item.expected_qty;
    item.diff_value = item.diff_qty < 0 ? Math.abs(item.diff_qty) * (item.cost_per_unit || 0) : 0;
  });
  
  const totalVar = sept1.data.items.reduce((sum, i) => sum + (i.diff_value || 0), 0);
  sept1.data.total_variance_value = totalVar;
  
  await supabase.from('staff_submissions').update({ data: sept1.data }).eq('id', sept1.id);
  console.log("Fixed Sept 1 double-counting bug.");
}
run();
