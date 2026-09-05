const { createClient } = require("@supabase/supabase-js");
const supabase = createClient("https://fnfivhnisigfnbvojonz.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU");

async function run() {
  const dates = ["2026-09-02", "2026-09-03", "2026-09-04"];
  const { data: existing } = await supabase.from('staff_submissions').select('id, data').eq('type', 'daily_recon').order("data->>date", { ascending: true });

  const missingMovements = [];

  for (const ex of existing) {
    if (dates.includes(ex.data.date)) {
      const day = ex.data.date;
      const itemsPayload = [...ex.data.items];

      for (let i = 0; i < itemsPayload.length; i++) {
        let it = itemsPayload[i];
        if (it.diff_qty > 0) {
          console.log(`${day} - ${it.name} has positive diff of ${it.diff_qty}. Converting to +Masuk.`);
          
          // Inject movement
          missingMovements.push({
            id: `MOV-FIX-POS-${day.replace(/-/g,'')}-${it.ingredient_id}`,
            type: "PO Receive", 
            ingredient_id: it.ingredient_id,
            ingredient_name: it.name,
            qty: it.diff_qty,
            unit: it.unit,
            date: day,
            time: "10.00",
            note: "Auto-converted from positive daily audit discrepancy"
          });

          // Update item math
          it.added_qty += it.diff_qty;
          it.expected_qty += it.diff_qty;
          it.diff_qty = 0;
          it.diff_value = 0;
        }
      }

      // Re-calculate total variance
      const totalVar = itemsPayload.reduce((sum, i) => sum + (i.diff_value || 0), 0);
      
      const payload = {
        ...ex,
        data: {
          ...ex.data,
          total_variance_value: totalVar,
          items: itemsPayload
        }
      };

      await supabase.from('staff_submissions').update({ data: payload.data }).eq('id', ex.id);
    }
  }

  // Insert the missing movements
  if (missingMovements.length > 0) {
    // Delete any old ones first just in case
    for (const m of missingMovements) {
      await supabase.from('stock_movements').delete().eq('id', m.id);
    }
    await supabase.from('stock_movements').insert(missingMovements);
    console.log(`Inserted ${missingMovements.length} +Masuk movements to fix positive discrepancies.`);
  } else {
    console.log("No positive discrepancies found to fix.");
  }
}
run();
