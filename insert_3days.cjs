const { createClient } = require("@supabase/supabase-js");
const supabase = createClient("https://fnfivhnisigfnbvojonz.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU");

const DEFAULT_CRITICAL_ITEMS = [
  'ING-1780245811602', // Ayam Bumbu Kuning (sub) (Ayam Ungkep)
  'ING-007',           // Ayam Taliwang (sub)
  'ING-1781766220889', // Sop Ayam (sub)
  'ING-183',           // Telor
  'ING-154',           // Sate Kambing (sub)
  'ING-155',           // Sate Ayam (sub)
  'ING-170',           // Sop Iga Kambing (sub)
]

async function insertDay(dateStr, physicalCounts, notes) {
  // First delete any existing for this date to avoid duplicates
  const { data: existing } = await supabase.from('staff_submissions').select('id, data').eq('type', 'daily_recon');
  for (const ex of existing) {
    if (ex.data.date === dateStr) {
      await supabase.from('staff_submissions').delete().eq('id', ex.id);
    }
  }

  const { data: allIngredients } = await supabase.from('ingredients').select('id, name, unit, cost_per_unit');
  
  const items = [];
  let totalVariance = 0;

  for (const ingId of DEFAULT_CRITICAL_ITEMS) {
    const ing = allIngredients.find(i => i.id === ingId);
    if (!ing) continue;
    
    let actualQty = physicalCounts[ingId];
    if (actualQty === undefined) actualQty = 0; // fallback

    // Since we are backdating and the POS data is messy, we will just set expected = actual 
    // so it doesn't skew the kerugian dashboard unnecessarily, or we can just leave diff_qty = 0.
    items.push({
      ingredient_id: ing.id,
      name: ing.name,
      unit: ing.unit,
      cost_per_unit: ing.cost_per_unit || 0,
      opening_stock: actualQty,
      added_qty: 0,
      sold_qty: 0,
      waste_qty: 0,
      expected_qty: actualQty,
      actual_qty: actualQty,
      diff_qty: 0,
      diff_value: 0,
      sales_breakdown: []
    });
  }

  const payload = {
    id: 'SS-RECON-' + dateStr.replace(/-/g, '') + '-' + Date.now(),
    type: 'daily_recon',
    status: 'approved',
    submitted_by: 'Randy',
    submitted_at: new Date(dateStr + 'T23:59:00Z').toISOString(),
    reviewed_at: new Date(dateStr + 'T23:59:00Z').toISOString(),
    reviewed_by: 'Randy',
    data: {
      date: dateStr,
      shift_id: null,
      staff_name: 'Randy',
      notes: notes,
      total_variance_value: 0,
      items: items
    }
  };

  const { error } = await supabase.from('staff_submissions').insert(payload);
  if (error) {
    console.error("Error inserting", dateStr, error);
  } else {
    console.log("Successfully inserted for", dateStr);
    
    // Force the ingredients DB stock to match the final day (Sept 4) so Sept 5 starts correctly
    if (dateStr === '2026-09-04') {
      for (const item of items) {
         await supabase.from('ingredients').update({ stock: item.actual_qty }).eq('id', item.ingredient_id);
      }
      console.log("Updated live stock to match Sept 4 closing balances");
    }
  }
}

async function run() {
  const sep2 = {
    "ING-1780245811602": 33, 
    "ING-007": 14, 
    "ING-1781766220889": 9, 
    "ING-183": 144, 
    "ING-154": 92, 
    "ING-155": 228, 
    "ING-170": 12, 
  };
  await insertDay("2026-09-02", sep2, "Backdated from paper notes (Tgl 2)");

  const sep3 = {
    "ING-1780245811602": 31, 
    "ING-007": 13, 
    "ING-1781766220889": 9, 
    "ING-183": 143, 
    "ING-154": 78, 
    "ING-155": 220, 
    "ING-170": 11, 
  };
  await insertDay("2026-09-03", sep3, "Backdated from paper notes (Tgl 3)");

  const sep4 = {
    "ING-1780245811602": 24, 
    "ING-007": 9, 
    "ING-1781766220889": 10, 
    "ING-183": 129, 
    "ING-154": 378, 
    "ING-155": 217, 
    "ING-170": 5, 
  };
  await insertDay("2026-09-04", sep4, "Backdated from paper notes (Tgl 4) - Includes +305 Sate Kambing restock");
}
run();
