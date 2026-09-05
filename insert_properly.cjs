const { createClient } = require("@supabase/supabase-js");
const supabase = createClient("https://fnfivhnisigfnbvojonz.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU");

const IDs = {
  ungkep: 'ING-1780245811602',
  taliwang: 'ING-007',
  sopAyam: 'ING-1781766220889',
  telor: 'ING-183',
  sateKambing: 'ING-154',
  sateAyam: 'ING-155',
  sopIga: 'ING-170'
};

async function run() {
  const { data: allIngredients } = await supabase.from('ingredients').select('*');
  
  // Clear previous Sept 2,3,4 recon
  const { data: existing } = await supabase.from('staff_submissions').select('id, data').eq('type', 'daily_recon');
  for (const ex of existing) {
    if (["2026-09-02", "2026-09-03", "2026-09-04"].includes(ex.data.date)) {
      await supabase.from('staff_submissions').delete().eq('id', ex.id);
    }
  }

  const daysData = [
    {
      date: "2026-09-02",
      notes: "Backdated from paper notes (Tgl 2) - Proper math applied",
      items: [
        { id: IDs.ungkep, awal: 40, masuk: 0, jual: 7, fisik: 33 },
        { id: IDs.taliwang, awal: 5, masuk: 10, jual: 1, fisik: 14 },
        { id: IDs.sopAyam, awal: 3, masuk: 8, jual: 2, fisik: 9 },
        { id: IDs.telor, awal: 150, masuk: 0, jual: 6, fisik: 146 },
        { id: IDs.sateKambing, awal: 119, masuk: 0, jual: 24, fisik: 92 },
        { id: IDs.sateAyam, awal: 59, masuk: 192, jual: 23, fisik: 228 },
        { id: IDs.sopIga, awal: 13, masuk: 0, jual: 1, fisik: 12 }
      ]
    },
    {
      date: "2026-09-03",
      notes: "Backdated from paper notes (Tgl 3) - Proper math applied",
      items: [
        { id: IDs.ungkep, awal: 33, masuk: 0, jual: 2, fisik: 31 },
        { id: IDs.taliwang, awal: 14, masuk: 0, jual: 1, fisik: 13 },
        { id: IDs.sopAyam, awal: 9, masuk: 0, jual: 0, fisik: 9 },
        { id: IDs.telor, awal: 146, masuk: 0, jual: 3, fisik: 143 },
        { id: IDs.sateKambing, awal: 92, masuk: 0, jual: 14, fisik: 78 },
        { id: IDs.sateAyam, awal: 228, masuk: 0, jual: 8, fisik: 220 },
        { id: IDs.sopIga, awal: 12, masuk: 0, jual: 1, fisik: 11 }
      ]
    },
    {
      date: "2026-09-04",
      notes: "Backdated from paper notes (Tgl 4) - Includes +305 Sate Kambing restock",
      items: [
        { id: IDs.ungkep, awal: 31, masuk: 0, jual: 5, fisik: 24 },
        { id: IDs.taliwang, awal: 13, masuk: 0, jual: 3, fisik: 9 },
        { id: IDs.sopAyam, awal: 9, masuk: 0, jual: 0, fisik: 10 },
        { id: IDs.telor, awal: 143, masuk: 0, jual: 14, fisik: 129 },
        { id: IDs.sateKambing, awal: 78, masuk: 305, jual: 5, fisik: 378 },
        { id: IDs.sateAyam, awal: 220, masuk: 0, jual: 3, fisik: 217 },
        { id: IDs.sopIga, awal: 11, masuk: 0, jual: 4, fisik: 5 }
      ]
    }
  ];

  for (const day of daysData) {
    const itemsPayload = day.items.map(it => {
      const ing = allIngredients.find(i => i.id === it.id);
      const expected = it.awal + it.masuk - it.jual;
      const diffQty = it.fisik - expected;
      const diffValue = diffQty < 0 ? Math.abs(diffQty) * (ing.cost_per_unit || 0) : 0;
      
      return {
        ingredient_id: ing.id,
        name: ing.name,
        unit: ing.unit,
        cost_per_unit: ing.cost_per_unit,
        opening_stock: it.awal,
        added_qty: it.masuk,
        sold_qty: it.jual,
        waste_qty: 0,
        expected_qty: expected,
        actual_qty: it.fisik,
        diff_qty: diffQty,
        diff_value: diffValue,
        sales_breakdown: []
      };
    });

    const totalVar = itemsPayload.reduce((sum, i) => sum + (i.diff_value || 0), 0);

    const payload = {
      id: 'SS-RECON-' + day.date.replace(/-/g, '') + '-' + Date.now(),
      type: 'daily_recon',
      status: 'approved',
      submitted_by: 'Randy',
      submitted_at: new Date(day.date + 'T23:59:00Z').toISOString(),
      reviewed_at: new Date(day.date + 'T23:59:00Z').toISOString(),
      reviewed_by: 'Randy',
      data: {
        date: day.date,
        shift_id: null,
        staff_name: 'Randy',
        notes: day.notes,
        total_variance_value: totalVar,
        items: itemsPayload
      }
    };

    const { error } = await supabase.from('staff_submissions').insert(payload);
    if (error) console.error("Error inserting", day.date, error);
    else console.log("Successfully inserted detailed math for", day.date);
  }
}
run();
