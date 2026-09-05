const fs = require('fs');
const file = 'src/backoffice/components/inventory/InvDailyRecon.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Fix the Notes Box
content = content.replace(
  /<div style=\{\{ background: "#FFFBEB", padding: "12px 16px", borderRadius: 8, marginBottom: 20, color: "#92400E", fontSize: 14 \}\}>\n\s*<b>Catatan Kasir:<\/b> \{viewDetail\.data\.notes\}\n\s*<\/div>/g,
  `<div style={{ background: "#F8FAFC", padding: "16px", borderRadius: 8, marginBottom: 24, border: "1px solid #E2E8F0" }}>
                <div style={{ color: "#334155", fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 18 }}>📝</span> Catatan Kasir / Analisis Otomatis
                </div>
                <div style={{ color: "#475569", fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {viewDetail.data.notes}
                </div>
              </div>`
);

// In case the background color string was different:
content = content.replace(
  /<div style=\{\{ background: "#FEF3C7".*?<\/div>\s*<\/div>/s,
  `<div style={{ background: "#F8FAFC", padding: "16px", borderRadius: 8, marginBottom: 24, border: "1px solid #E2E8F0" }}>
                <div style={{ color: "#334155", fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 18 }}>📝</span> Catatan Kasir / Analisis Otomatis
                </div>
                <div style={{ color: "#475569", fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {viewDetail.data.notes}
                </div>
              </div>`
);

// Just replace using simpler string replacement for notes
let notesOld = `<div style={{ background: "#FFFBEB", padding: "12px 16px", borderRadius: 8, marginBottom: 20, color: "#92400E", fontSize: 14 }}>
                  <b>Catatan Kasir:</b> {viewDetail.data.notes}
                </div>`;
let notesNew = `<div style={{ background: "#F8FAFC", padding: "16px", borderRadius: 8, marginBottom: 24, border: "1px solid #E2E8F0" }}>
                <div style={{ color: "#334155", fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 18 }}>📝</span> Catatan Kasir / Analisis Otomatis
                </div>
                <div style={{ color: "#475569", fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {viewDetail.data.notes}
                </div>
              </div>`;
content = content.replace(notesOld, notesNew);

// 2. Fix the missing TD cell
const tdRegex = /<td style=\{\{ textAlign: "center", color: it\.sold_qty > 0 \? "#DE350B" : "var\(--ink5\)", fontWeight: 600 \}\}>\s*\{it\.sold_qty > 0 \? `-\$\{it\.sold_qty\}` : "0"\}\s*<\/td>/g;

content = content.replace(tdRegex, 
`<td style={{ textAlign: "center", color: it.sold_qty > 0 ? "#DE350B" : "var(--ink5)", fontWeight: 600 }}>
                          {it.sold_qty > 0 ? \`-\${it.sold_qty}\` : "0"}
                        </td>
                        <td style={{ textAlign: "center", color: it.waste_qty > 0 ? "#9A3412" : "var(--ink5)", fontWeight: 600 }}>
                          {it.waste_qty > 0 ? \`-\${it.waste_qty}\` : "0"}
                        </td>`
);

fs.writeFileSync(file, content);
console.log('Fixed layout and missing TD');
