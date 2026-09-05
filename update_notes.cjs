const { createClient } = require("@supabase/supabase-js");
const supabase = createClient("https://fnfivhnisigfnbvojonz.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU");

const notes = {
  "2026-09-02": `Analisa Sistem (True POS Math):
• Sop Ayam (-2 Selisih): Tidak ada penjualan Sop Ayam yang diinput di POS hari ini! Jika ada yang laku, kasir lupa input pesanan.
• Telor: Ada PO Masuk 105 pcs, lalu di-adjust manual (dibuang) -105 pcs karena "koreksi opname".
• Sate Kambing (-6 Selisih): Nita mencatat 24 terjual di kertas, tapi POS hanya mencatat 21. Selisih 3 ini menjadi kerugian.`,
  
  "2026-09-03": `Analisa Sistem (True POS Math):
• Telor (-2 Waste/Adj): Sistem otomatis memotong 2 telur karena Yudi membuat "Adonan Kremesan" di dapur.
• Sate Kambing (-6) & Sate Ayam (-3): Nita melaporkan selisih kurang di kertas, yang dimasukkan sebagai Adjustment.
• Surplus/Plus (+) pada Telor, Sate Kambing, Sate Ayam: Dapur memproduksi barang atau restock tetapi LUPA diinput ke POS, ATAU Nita salah hitung fisik.`,
  
  "2026-09-04": `Analisa Sistem (True POS Math):
• Ayam Bumbu Kuning: Berhasil melanjutkan stok 30 dari tanggal 3 (setelah waste 1), dan klop dengan sisa 24.
• Sop Iga: Penjualan 5 porsi tercatat dan sesuai.
• Sop Ayam (+3 Surplus): Fisik sisa 10, padahal seharusnya sisa 7 (Awal 9 - Jual 2). Dapur pasti memasak Sop Ayam tambahan hari ini tetapi LUPA lapor/input.`
};

async function run() {
  const { data: existing } = await supabase.from('staff_submissions').select('id, data').eq('type', 'daily_recon');
  for (const ex of existing) {
    if (notes[ex.data.date]) {
      ex.data.notes = notes[ex.data.date];
      await supabase.from('staff_submissions').update({ data: ex.data }).eq('id', ex.id);
      console.log(`Updated notes for ${ex.data.date}`);
    }
  }
}
run();
