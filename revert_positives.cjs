const { createClient } = require("@supabase/supabase-js");
const supabase = createClient("https://fnfivhnisigfnbvojonz.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU");

const IDs = {
  ungkep: 'ING-1780245811602', taliwang: 'ING-007', sopAyam: 'ING-1781766220889',
  telor: 'ING-183', sateKambing: 'ING-154', sateAyam: 'ING-155', sopIga: 'ING-170'
};

const fisik = {
  "2026-09-01": { [IDs.ungkep]:40, [IDs.taliwang]:5, [IDs.sopAyam]:3, [IDs.telor]:150, [IDs.sateKambing]:119, [IDs.sateAyam]:59, [IDs.sopIga]:13 },
  "2026-09-02": { [IDs.ungkep]:33, [IDs.taliwang]:14, [IDs.sopAyam]:9, [IDs.telor]:144, [IDs.sateKambing]:92, [IDs.sateAyam]:228, [IDs.sopIga]:12 },
  "2026-09-03": { [IDs.ungkep]:30, [IDs.taliwang]:13, [IDs.sopAyam]:9, [IDs.telor]:143, [IDs.sateKambing]:78, [IDs.sateAyam]:220, [IDs.sopIga]:11 },
  "2026-09-04": { [IDs.ungkep]:24, [IDs.taliwang]:9, [IDs.sopAyam]:10, [IDs.telor]:129, [IDs.sateKambing]:378, [IDs.sateAyam]:217, [IDs.sopIga]:5 }
};

async function run() {
  const { data: allIngredients } = await supabase.from('ingredients').select('*');
  const { data: recipes } = await supabase.from('recipes').select('*');

  // 1. Delete all auto-generated MOV-FIX-POS movements
  const { data: toDelete } = await supabase.from('stock_movements').select('id').like('id', 'MOV-FIX-POS-%');
  if (toDelete && toDelete.length > 0) {
    for (const d of toDelete) {
      await supabase.from('stock_movements').delete().eq('id', d.id);
    }
    console.log(`Deleted ${toDelete.length} auto-generated +Masuk movements.`);
  }

  // 2. Clear current recon reports
  const { data: existing } = await supabase.from('staff_submissions').select('id, data').eq('type', 'daily_recon');
  for (const ex of existing) {
    if (["2026-09-02", "2026-09-03", "2026-09-04"].includes(ex.data?.date)) {
      await supabase.from('staff_submissions').delete().eq('id', ex.id);
    }
  }

  // 3. Process each day from scratch
  for (const date of ["2026-09-02", "2026-09-03", "2026-09-04"]) {
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

    // True Masuk / Waste (including user-confirmed ones like Meldy's 305)
    const { data: movs } = await supabase.from('stock_movements').select('*').eq('date', date);
    const masuk = {};
    const waste = {};
    (movs || []).forEach(m => {
      if (m.type === 'Sale') return;
      const q = parseFloat(m.qty) || 0;
      if (q > 0) masuk[m.ingredient_id] = (masuk[m.ingredient_id] || 0) + q;
      if (q < 0) waste[m.ingredient_id] = (waste[m.ingredient_id] || 0) + Math.abs(q);
    });

    const prevDate = date === "2026-09-02" ? "2026-09-01" : date === "2026-09-03" ? "2026-09-02" : "2026-09-03";
    
    const itemsPayload = Object.values(IDs).map(ingId => {
      const ing = allIngredients.find(i => i.id === ingId);
      const awal = fisik[prevDate][ingId] || 0;
      
      let j = salesUsage[ingId] || 0;
      // Hardcode manual overrides confirmed by user
      if (date === "2026-09-04" && ingId === IDs.sopIga) j = 5;

      const m = masuk[ingId] || 0;
      const w = waste[ingId] || 0;
      const teori = awal + m - j - w;
      const fis = fisik[date][ingId] || 0;
      const diffQty = fis - teori;
      
      // We will show both positive and negative variances
      // Note: Value calculation usually only penalizes negative variance as "Kerugian", 
      // but let's keep diff_value for negative, or just simple math.
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
      data: { date: date, staff_name: 'Randy', notes: `Backdated with TRUE POS Math (${date}) - Real Mismatches`, total_variance_value: totalVar, items: itemsPayload }
    };
    await supabase.from('staff_submissions').insert(payload);
    console.log(`Recon for ${date} inserted with true POS math & real mismatches.`);
  }
}
run();
