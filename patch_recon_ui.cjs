const fs = require('fs');
const file = 'src/backoffice/components/inventory/InvDailyRecon.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<th style=\{\{ textAlign: "center" \}\}>-Terjual<\/th>/g,
  `<th style={{ textAlign: "center" }}>-Terjual</th>\n                    <th style={{ textAlign: "center" }}>-Waste/Adj</th>`
);

content = content.replace(
  /<td style=\{\{ textAlign: "center", color: "#B91C1C", fontWeight: 700 \}\}>\n\s*-\{it.sold_qty\}\n\s*<\/td>/g,
  `<td style={{ textAlign: "center", color: "#B91C1C", fontWeight: 700 }}>
                          -{it.sold_qty}
                        </td>
                        <td style={{ textAlign: "center", color: "#9A3412", fontWeight: 700 }}>
                          {it.waste_qty > 0 ? \`-\${it.waste_qty}\` : "0"}
                        </td>`
);

fs.writeFileSync(file, content);
console.log('InvDailyRecon patched');
