const fs = require('fs');

// --- 1. BACKOFFICE ---
let file = 'src/backoffice/components/inventory/InvDailyRecon.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace("style={{ maxWidth: 1100 }}", "style={{ maxWidth: 1200 }}"); // Widen more
content = content.replace(
  '<th style={{ textAlign: "center", whiteSpace: "nowrap" }}>-Waste/Adj</th>',
  '<th style={{ textAlign: "center", whiteSpace: "nowrap" }}>-Waste</th>\n                    <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>+/- Adj</th>'
);
content = content.replace(
  /<td style=\{\{\s*textAlign:\s*"center",\s*color:\s*it\.waste_qty > 0 \? "#9A3412" : "var\(--ink5\)",\s*fontWeight:\s*600\s*\}\}>\s*\{it\.waste_qty > 0 \? `-\$\{it\.waste_qty\}` : "0"\}\s*<\/td>/s,
  `<td style={{ textAlign: "center", color: (it.waste_qty || 0) > 0 ? "#9A3412" : "var(--ink5)", fontWeight: 600 }}>
                          {(it.waste_qty || 0) > 0 ? \`-\${it.waste_qty}\` : "0"}
                        </td>
                        <td style={{ textAlign: "center", color: (it.adj_qty || 0) !== 0 ? "#475569" : "var(--ink5)", fontWeight: 600 }}>
                          {(it.adj_qty || 0) > 0 ? \`+\${it.adj_qty}\` : (it.adj_qty || 0) < 0 ? it.adj_qty : "0"}
                        </td>`
);
fs.writeFileSync(file, content);


// --- 2. POS ---
file = 'src/pos/components/DailyStockModal.jsx';
content = fs.readFileSync(file, 'utf8');

content = content.replace("style={{ width: '90%', maxWidth: 1050, ", "style={{ width: '90%', maxWidth: 1150, ");
content = content.replace(
  "<th style={{ ...styles.th, textAlign: 'center', whiteSpace: 'nowrap' }}>-Waste/Adj</th>",
  "<th style={{ ...styles.th, textAlign: 'center', whiteSpace: 'nowrap' }}>-Waste</th>\n                      <th style={{ ...styles.th, textAlign: 'center', whiteSpace: 'nowrap' }}>+/- Adj</th>"
);
content = content.replace(
  /<td style=\{\{\s*\.\.\.styles\.td,\s*textAlign:\s*'center',\s*color:\s*item\.waste_qty > 0 \? '#9A3412' : '#94A3B8',\s*fontWeight:\s*600\s*\}\}>\s*\{item\.waste_qty > 0 \? `-\$\{item\.waste_qty\}` : '0'\}\s*<\/td>/s,
  `<td style={{ ...styles.td, textAlign: 'center', color: (item.waste_qty || 0) > 0 ? '#9A3412' : '#94A3B8', fontWeight: 600 }}>
                            {(item.waste_qty || 0) > 0 ? \`-\${item.waste_qty}\` : '0'}
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center', color: (item.adj_qty || 0) !== 0 ? '#475569' : '#94A3B8', fontWeight: 600 }}>
                            {(item.adj_qty || 0) > 0 ? \`+\${item.adj_qty}\` : (item.adj_qty || 0) < 0 ? item.adj_qty : '0'}
                          </td>`
);

// Fix loop logic
const oldLoop = `const waste = {}
      const production_deductions = {}
      ;(todayMovements || []).forEach(mov => {
        const ingId = mov.ingredient_id
        const qty = parseFloat(mov.qty) || 0
        if (mov.type === 'Sale') return
        
        if (qty > 0) {
          additions[ingId] = (additions[ingId] || 0) + Math.abs(qty)
        } else if (qty < 0 && mov.type === 'Production') {
          production_deductions[ingId] = (production_deductions[ingId] || 0) + Math.abs(qty)
        } else if (qty < 0) {
          waste[ingId] = (waste[ingId] || 0) + Math.abs(qty)
        }
      })`;

const newLoop = `const waste = {}
      const production_deductions = {}
      const adjustments = {}
      ;(todayMovements || []).forEach(mov => {
        const ingId = mov.ingredient_id
        const qty = parseFloat(mov.qty) || 0
        if (mov.type === 'Sale' || mov.type === 'Stock Reset' || mov.type === 'Void') return
        
        if (mov.type === 'Adjustment') {
           adjustments[ingId] = (adjustments[ingId] || 0) + qty
        } else if (qty > 0) {
          additions[ingId] = (additions[ingId] || 0) + Math.abs(qty)
        } else if (qty < 0 && mov.type === 'Production') {
          production_deductions[ingId] = (production_deductions[ingId] || 0) + Math.abs(qty)
        } else if (qty < 0 && mov.type === 'Waste') {
          waste[ingId] = (waste[ingId] || 0) + Math.abs(qty)
        }
      })`;
content = content.replace(oldLoop, newLoop);

content = content.replace("const wasted = waste[ingId] || 0\n        const prodDed = production_deductions[ingId] || 0",
"const wasted = waste[ingId] || 0\n        const prodDed = production_deductions[ingId] || 0\n        const adj = adjustments[ingId] || 0");

content = content.replace(
  "Math.max(0, currentLiveStock + sold + wasted + prodDed - added)",
  "Math.max(0, currentLiveStock + sold + wasted + prodDed - added - adj)"
);
content = content.replace(
  "Math.max(0, openingStock + added - sold - wasted - prodDed)",
  "Math.max(0, openingStock + added + adj - sold - wasted - prodDed)"
);
content = content.replace(
  "waste_qty: Math.round(wasted * 100) / 100,\n          production_qty: Math.round(prodDed * 100) / 100,",
  "waste_qty: Math.round(wasted * 100) / 100,\n          production_qty: Math.round(prodDed * 100) / 100,\n          adj_qty: Math.round(adj * 100) / 100,"
);
content = content.replace(
  "item.opening_stock + item.auto_added_qty - item.sold_qty - item.waste_qty - (item.production_qty||0)",
  "item.opening_stock + item.auto_added_qty + (item.adj_qty||0) - item.sold_qty - item.waste_qty - (item.production_qty||0)"
);
content = content.replace(
  "waste_qty: item.waste_qty,\n          production_qty: item.production_qty,",
  "waste_qty: item.waste_qty,\n          production_qty: item.production_qty,\n          adj_qty: item.adj_qty,"
);

fs.writeFileSync(file, content);
console.log("POS and BO updated for adjustments!");
