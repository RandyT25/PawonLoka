const fs = require('fs');
const file = 'src/pos/components/DailyStockModal.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Fix date
content = content.replace(
  /const today = useMemo\(\(\) => new Date\(\)\.toISOString\(\)\.slice\(0, 10\), \[\]\)/,
  `const today = useMemo(() => {
    const d = new Date()
    return \`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,'0')}-\${String(d.getDate()).padStart(2,'0')}\`
  }, [])`
);

// 2. Add states
content = content.replace(
  /const \[savedSuccess, setSavedSuccess\] = useState\(false\)/,
  `const [savedSuccess, setSavedSuccess] = useState(false)
  const [manualAdded, setManualAdded] = useState({})
  const [onlineWarningChecked, setOnlineWarningChecked] = useState(false)`
);

// 3. Increase existingRecon limit
content = content.replace(
  /\.limit\(10\)/g,
  `.limit(30)`
);

// 4. Update expectedSisa math in loadData
content = content.replace(
  /const expectedSisa = openingStock \+ added - sold - wasted/g,
  `const auto_added_qty = added
        // The manualAdded dictionary holds the currently inputted +Masuk
        // For loadData, we just compute it raw to be safe, but later we will use it from state
        const expectedSisa = openingStock + added - sold - wasted`
);

// We need to initialize manualAdded in loadData
content = content.replace(
  /setItems\(recordedItems\)/g,
  `const mAdded = {}; recordedItems.forEach(r => { mAdded[r.id] = String(r.added_qty) }); setManualAdded(mAdded); setItems(recordedItems)`
);

content = content.replace(
  /added_qty: Math\.round\(added \* 100\) \/ 100,/g,
  `auto_added_qty: Math.round(added * 100) / 100,
        added_qty: Math.round(added * 100) / 100,`
);

// 5. Update render logic to use manualAdded
content = content.replace(
  /const diff = counts\[item\.id\] \!== undefined \? counts\[item\.id\] - item\.expected_sisa : 0/g,
  `const finalAdded = manualAdded[item.id] !== undefined ? (parseFloat(manualAdded[item.id]) || 0) : item.added_qty
            const expected_sisa = Math.max(0, item.opening_stock + finalAdded - item.sold_qty - item.waste_qty)
            const diff = counts[item.id] !== undefined ? counts[item.id] - expected_sisa : 0`
);

// 6. Change expected_sisa render variables in the map
content = content.replace(
  /item\.expected_sisa/g,
  `expected_sisa`
);

// Fix bug: `expected_sisa` wasn't correctly declared for all usages in render
content = content.replace(
  /\{item\.expected_sisa\} \{item\.unit\}/g,
  `{expected_sisa} {item.unit}`
);

// 7. Update input for +Masuk
content = content.replace(
  /\{item\.added_qty > 0 \? \`\+\$\{item\.added_qty\}\` : '—'\}/g,
  `<input 
                              type="number" 
                              value={manualAdded[item.id] !== undefined ? manualAdded[item.id] : item.added_qty}
                              onChange={e => setManualAdded(prev => ({...prev, [item.id]: e.target.value}))}
                              style={{ ...styles.input, width: 60, padding: '4px', borderColor: '#86EFAC', color: '#166534', background: '#DCFCE7' }}
                              placeholder={String(item.auto_added_qty)}
                            />`
);

// 8. Update handleSubmit to check warning & update DB
content = content.replace(
  /async function handleSubmit\(\) \{/g,
  `async function handleSubmit() {
    if (!onlineWarningChecked) {
      alert("⚠️ Tunggu! Pastikan Anda sudah mencentang konfirmasi bahwa semua pesanan online sudah diinput.");
      return;
    }`
);

// 9. Check for extraMasuk in handleSubmit
content = content.replace(
  /const recordedItems = items\.map\(item => \{/g,
  `const movementsToInsert = [];
    let stockUpdates = [];
    const recordedItems = items.map(item => {
      const finalAdded = manualAdded[item.id] !== undefined ? (parseFloat(manualAdded[item.id]) || 0) : item.added_qty;
      const expected_sisa = Math.max(0, item.opening_stock + finalAdded - item.sold_qty - item.waste_qty);
      const extraMasuk = finalAdded - item.auto_added_qty;
      if (extraMasuk !== 0) {
        movementsToInsert.push({
          id: "MOV-" + Date.now() + "-" + Math.random().toString(36).slice(2,6),
          type: extraMasuk > 0 ? "PO Receive" : "Adjustment",
          ingredient_id: item.id,
          ingredient_name: item.name,
          qty: extraMasuk,
          unit: item.unit,
          note: "Manual Restock input from Daily Audit",
          date: today,
          time: new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
        });
        stockUpdates.push({ id: item.id, qty: extraMasuk });
      }`
);

// 10. Fix expected_qty in payload
content = content.replace(
  /expected_qty: item\.expected_sisa/g,
  `expected_qty: expected_sisa`
);
content = content.replace(
  /added_qty: item\.added_qty/g,
  `added_qty: finalAdded`
);

// 11. Process stockUpdates and movementsToInsert
content = content.replace(
  /const payload = \{/g,
  `
      // Update missing movements if any
      if (movementsToInsert.length > 0) {
        await supabase.from("stock_movements").insert(movementsToInsert);
        for (const up of stockUpdates) {
          const { data: ingData } = await supabase.from("ingredients").select("stock").eq("id", up.id).maybeSingle();
          if (ingData) {
            await supabase.from("ingredients").update({ stock: (parseFloat(ingData.stock)||0) + up.qty }).eq("id", up.id);
          }
        }
      }
      
      const payload = {`
);

// 12. Render the warning checkbox right above footer
content = content.replace(
  /\{!\(savedSuccess\) && !loading && \(/g,
  `{!savedSuccess && !loading && (
          <div style={{ padding: '12px 20px', background: '#FEF2F2', borderTop: '2px solid #FCA5A5' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#991B1B' }}>
              <input type="checkbox" checked={onlineWarningChecked} onChange={e => setOnlineWarningChecked(e.target.checked)} style={{ transform: 'scale(1.3)' }} />
              <div>
                ⚠️ TUNGGU! Apakah Anda yakin semua pesanan dari online (GoFood, GrabFood, ShopeeFood) hari ini sudah diketik/dimasukkan ke POS? 
                <div style={{ fontSize: 11.5, fontWeight: 500, color: '#B91C1C', marginTop: 2 }}>Order yang terlewat akan menyebabkan stok selisih. Centang ini jika Anda sudah mengecek tablet merchant.</div>
              </div>
            </label>
          </div>
        )}
        {!savedSuccess && !loading && (`
);

fs.writeFileSync(file, content);
console.log('DailyStockModal.jsx patched');
