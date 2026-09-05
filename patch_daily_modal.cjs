const fs = require('fs');
const file = 'src/pos/components/DailyStockModal.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove the movementsToInsert injection
const autoInjectRegex = /const extraMasuk = finalAdded - item\.auto_added_qty;\s*if \(extraMasuk !== 0\) \{[\s\S]*?stockUpdates\.push\(\{ id: item\.id, qty: extraMasuk \}\);\s*\}/s;
content = content.replace(autoInjectRegex, `
      // REMOVED AUTO-INJECTION: We no longer magically create stock movements based on Nita's input.
      // Her input is just a CLAIM that will be cross-checked against true system production.
      const extraMasuk = finalAdded - item.auto_added_qty;
`);

// 2. Add visual flag on the input cell if there is a mismatch
const inputCellRegex = /<td style=\{\{\s*\.\.\.styles\.td,\s*textAlign:\s*'center'\s*\}\}>\s*<input[\s\S]*?\/>\s*<\/td>/s;
const newInputCell = `<td style={{ ...styles.td, textAlign: 'center', position: 'relative' }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={manualAdded[item.id] !== undefined ? manualAdded[item.id] : item.added_qty}
                              onChange={e => setManualAdded(prev => ({...prev, [item.id]: e.target.value}))}
                              style={{ 
                                ...styles.input, 
                                width: 60, 
                                padding: '4px', 
                                borderColor: (manualAdded[item.id] !== undefined && parseFloat(manualAdded[item.id]||0) !== item.auto_added_qty) ? '#DE350B' : '#86EFAC', 
                                color: (manualAdded[item.id] !== undefined && parseFloat(manualAdded[item.id]||0) !== item.auto_added_qty) ? '#DE350B' : '#166534', 
                                background: (manualAdded[item.id] !== undefined && parseFloat(manualAdded[item.id]||0) !== item.auto_added_qty) ? '#FEE2E2' : '#DCFCE7' 
                              }}
                              placeholder={String(item.auto_added_qty)}
                            />
                            {manualAdded[item.id] !== undefined && parseFloat(manualAdded[item.id]||0) !== item.auto_added_qty && (
                              <div style={{ fontSize: 10, color: '#DE350B', fontWeight: 'bold', marginTop: 2, lineHeight: 1 }}>
                                ⚠️ Sys: {item.auto_added_qty}
                              </div>
                            )}
                          </td>`;
content = content.replace(inputCellRegex, newInputCell);

// 3. Make sure expected_sisa still correctly alerts the user if Teori mismatches.
// Should Teori be calculated using Nita's claim or the System's true production?
// The user wants the system to cross-check. If Nita claims 8, but system is 0, Teori should use System!
// Because if Teori uses Nita's fake 8, the Diff becomes 0 and looks "Normal", hiding the error.
const expectedRegex = /const expected_sisa = Math\.max\(0, item\.opening_stock \+ finalAdded - item\.sold_qty - item\.waste_qty\);/;
content = content.replace(expectedRegex, `
      // expected_sisa MUST use auto_added_qty (True System Math), NOT finalAdded (Nita's claim)!
      // This ensures that if Nita fakes a +Masuk to hide a shortage, the Teori still catches it!
      const expected_sisa = Math.max(0, item.opening_stock + item.auto_added_qty - item.sold_qty - item.waste_qty);
`);

// 4. Record Nita's claim in the JSON
const payloadRegex = /added_qty: finalAdded,\s*auto_added_qty: item\.auto_added_qty,/s;
content = content.replace(payloadRegex, `added_qty: item.auto_added_qty, // Keep true system math
          claimed_added_qty: finalAdded, // What Nita claims she got
          auto_added_qty: item.auto_added_qty,`);

fs.writeFileSync(file, content);
console.log("DailyStockModal cross-check logic applied!");
