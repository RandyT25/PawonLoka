const fs = require('fs');
const file = 'src/backoffice/components/inventory/InvDailyRecon.jsx';
let content = fs.readFileSync(file, 'utf8');

// The Notes might not have been matched either because of exact whitespace.
const notesRegex = /\{\s*viewDetail\.data\?\.notes && \(\s*<div style=\{\{ background: "[^"]+", padding: "[^"]+", borderRadius: \d+, marginBottom: \d+, color: "[^"]+", fontSize: 14 \}\}>\s*<b>Catatan Kasir:<\/b> \{viewDetail\.data\.notes\}\s*<\/div>\s*\)\s*\}/s;

content = content.replace(notesRegex, 
`{viewDetail.data?.notes && (
              <div style={{ background: "#F8FAFC", padding: "16px", borderRadius: 8, marginBottom: 24, border: "1px solid #E2E8F0" }}>
                <div style={{ color: "#334155", fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 18 }}>📝</span> Catatan Kasir / Analisis Otomatis
                </div>
                <div style={{ color: "#475569", fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {viewDetail.data.notes}
                </div>
              </div>
            )}`);

const soldRegex = /<td style=\{\{\s*textAlign:\s*"center",\s*color:\s*it\.sold_qty\s*>\s*0\s*\?\s*"#DE350B"\s*:\s*"var\(--ink5\)",\s*fontWeight:\s*600\s*\}\}>\s*\{it\.sold_qty\s*>\s*0\s*\?\s*`-\$\{it\.sold_qty\}`\s*:\s*"0"\}\s*<\/td>/s;

if (content.match(soldRegex)) {
  content = content.replace(soldRegex, 
  `<td style={{ textAlign: "center", color: it.sold_qty > 0 ? "#DE350B" : "var(--ink5)", fontWeight: 600 }}>
                          {it.sold_qty > 0 ? \`-\${it.sold_qty}\` : "0"}
                        </td>
                        <td style={{ textAlign: "center", color: it.waste_qty > 0 ? "#9A3412" : "var(--ink5)", fontWeight: 600 }}>
                          {it.waste_qty > 0 ? \`-\${it.waste_qty}\` : "0"}
                        </td>`);
  console.log("Successfully replaced TD");
} else {
  console.log("Could not match TD regex");
}

fs.writeFileSync(file, content);
