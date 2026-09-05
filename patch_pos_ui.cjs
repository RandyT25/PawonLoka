const fs = require('fs');
const file = 'src/pos/components/DailyStockModal.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace("style={{ width: '90%', maxWidth: 900, ", "style={{ width: '90%', maxWidth: 1050, ");

const thRegex = /<th style=\{\{\s*\.\.\.styles\.th,\s*textAlign:\s*'center'\s*\}\}>-Waste\/Adj<\/th>/;
if (content.match(thRegex)) {
  content = content.replace(thRegex, `<th style={{ ...styles.th, textAlign: 'center', whiteSpace: 'nowrap' }}>-Produksi</th>
                      <th style={{ ...styles.th, textAlign: 'center', whiteSpace: 'nowrap' }}>-Waste/Adj</th>`);
  console.log("POS Headers updated!");
} else {
  console.log("POS TH not found!");
}

const tdRegex = /<td style=\{\{\s*\.\.\.styles\.td,\s*textAlign:\s*'center',\s*color:\s*item\.waste_qty > 0 \? '#9A3412' : '#94A3B8',\s*fontWeight:\s*600\s*\}\}>\s*\{item\.waste_qty > 0 \? `-\$\{item\.waste_qty\}` : '0'\}\s*<\/td>/s;
if (content.match(tdRegex)) {
  content = content.replace(tdRegex, `<td style={{ ...styles.td, textAlign: 'center', color: (item.production_qty || 0) > 0 ? '#D97706' : '#94A3B8', fontWeight: 600 }}>
                            {(item.production_qty || 0) > 0 ? \`-\${item.production_qty}\` : '0'}
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center', color: item.waste_qty > 0 ? '#9A3412' : '#94A3B8', fontWeight: 600 }}>
                            {item.waste_qty > 0 ? \`-\${item.waste_qty}\` : '0'}
                          </td>`);
  console.log("POS TD updated!");
} else {
  console.log("POS TD not found!");
}

// Update expected calculation to include both (since they are now split)
// Wait, the API still returns the combined waste_qty, no wait, the DB returns stock_movements!
// In DailyStockModal.jsx, `waste_qty` is calculated from stock_movements directly inside the modal load!
// Let's check how `DailyStockModal.jsx` calculates `waste_qty`.
