const { createClient } = require("@supabase/supabase-js");
const supabase = createClient("https://fnfivhnisigfnbvojonz.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU");

const IDs = {
  ungkep: 'ING-1780245811602', taliwang: 'ING-007', sopAyam: 'ING-1781766220889',
  telor: 'ING-183', sateKambing: 'ING-154', sateAyam: 'ING-155', sopIga: 'ING-170'
};

const fisik = {
  "2026-09-01": { [IDs.ungkep]:40, [IDs.taliwang]:5, [IDs.sopAyam]:3, [IDs.telor]:150, [IDs.sateKambing]:119, [IDs.sateAyam]:59, [IDs.sopIga]:13 },
};

async function run() {
  const { data: allIngredients } = await supabase.from('ingredients').select('*');
  const { data: recipes } = await supabase.from('recipes').select('*');

  // Delete Sept 1 recon
  const { data: existing } = await supabase.from('staff_submissions').select('id, data').eq('type', 'daily_recon');
  for (const ex of existing) {
    if (ex.data?.date === "2026-09-01") {
      await supabase.from('staff_submissions').delete().eq('id', ex.id);
    }
  }

  const date = "2026-09-01";
  
  // True sales
  const { data: orders } = await supabase.from('orders').select('items').eq('date', date).eq('status', 'Paid');
  const salesUsage = {};
  (orders || []).forEach(o => {
    (o.items || []).forEach(item => {
      const qty = item.qty || 1;
      const recs = recipes.filter(r => r.product_id === item.sku);
      recs.forEach(r => {
        if (!salesUsage[r.ingredient_id]) salesUsage[r.ingredient_id] = 0;
        salesUsage[r.ingredient_id] += (parseFloat(r.qty) || 0) * qty;
      });
    });
  });

  // True Masuk / Waste
  const { data: movs } = await supabase.from('stock_movements').select('*').eq('date', date);
  const masuk = {};
  const waste = {};
  (movs || []).forEach(m => {
    if (m.type === 'Sale') return;
    const q = parseFloat(m.qty) || 0;
    if (q > 0) masuk[m.ingredient_id] = (masuk[m.ingredient_id] || 0) + q;
    if (q < 0) waste[m.ingredient_id] = (waste[m.ingredient_id] || 0) + Math.abs(q);
  });

  const itemsPayload = Object.values(IDs).map(ingId => {
    const ing = allIngredients.find(i => i.id === ingId);
    
    // Nita's paper on Sept 1:
    // Ayam: Awal 40. Fisik 40.
    // Taliwang: Awal 7. Fisik 5.
    // Sop Ayam: Awal 4. Fisik 3.
    // Telor: Awal 150. Fisik 150.
    // Sate Kambing: Awal 146. Fisik 119.
    // Sate Ayam: Awal 70. Fisik 59.
    // Sop Iga: Awal 15. Fisik 13.
    const awal_map = {
      [IDs.ungkep]:40, [IDs.taliwang]:7, [IDs.sopAyam]:4, [IDs.telor]:150,
      [IDs.sateKambing]:146, [IDs.sateAyam]:70, [IDs.sopIga]:15
    };
    
    const awal = awal_map[ingId];
    const j = salesUsage[ingId] || 0;
    const m = masuk[ingId] || 0;
    const w = waste[ingId] || 0;
    const teori = awal + m - j - w;
    const fis = fisik[date][ingId] || 0;
    const diffQty = fis - teori;
    const diffVal = diffQty < 0 ? Math.abs(diffQty) * (ing.cost_per_unit || 0) : 0;
    
    return {
      ingredient_id: ing.id, name: ing.name, unit: ing.unit, cost_per_unit: ing.cost_per_unit,
      opening_stock: awal, added_qty: m, sold_qty: j, waste_qty: w,
      expected_qty: teori, actual_qty: fis, diff_qty: diffQty, diff_value: diffVal, sales_breakdown: []
    };
  });

  const totalVar = itemsPayload.reduce((sum, i) => sum + (i.diff_value || 0), 0);
  const payload = {
    id: 'SS-RECON-' + date.replace(/-/g, '') + '-' + Date.now(),
    type: 'daily_recon', status: 'approved', submitted_by: 'Randy',
    submitted_at: new Date(date + 'T23:59:00Z').toISOString(),
    reviewed_at: new Date(date + 'T23:59:00Z').toISOString(), reviewed_by: 'Randy',
    data: { 
      date: date, staff_name: 'Randy', 
      notes: "Analisa Sistem (True POS Math):\n• Laporan Awal Opname bulan September.\n• Selisih yang terjadi adalah selisih antara Fisik vs Penjualan POS.", 
      total_variance_value: totalVar, items: itemsPayload 
    }
  };
  await supabase.from('staff_submissions').insert(payload);
  console.log(`Recon for ${date} inserted with true POS math.`);
}
run();
