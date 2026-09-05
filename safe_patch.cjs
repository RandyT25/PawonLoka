const fs = require('fs');
let content = fs.readFileSync('src/backoffice/components/inventory/InvDailyRecon.jsx', 'utf8');

// The Notes UI
const oldNotes = `{viewDetail.data?.notes && (
                <div style={{ background: "#FEF3C7", padding: "12px 16px", borderRadius: 8, marginBottom: 20, color: "#92400E", fontWeight: 500, fontSize: 14 }}>
                  <span style={{ fontWeight: 700 }}>Catatan Kasir:</span> {viewDetail.data.notes}
                </div>
              )}`;

const newNotes = `{viewDetail.data?.notes && (
                <div style={{ background: "#F8FAFC", padding: "16px", borderRadius: 8, marginBottom: 24, border: "1px solid #E2E8F0" }}>
                  <div style={{ color: "#334155", fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 18 }}>📝</span> Analisis Sistem Otomatis
                  </div>
                  <div style={{ color: "#475569", fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {viewDetail.data.notes}
                  </div>
                </div>
              )}`;

// We replace just this exact chunk.
if (content.includes(oldNotes)) {
    content = content.replace(oldNotes, newNotes);
    console.log("Successfully replaced notes!");
} else {
    console.log("Notes not found! They might have different spacing.");
}

// The Missing TD
const oldTd = `<td style={{ textAlign: "center", color: it.sold_qty > 0 ? "#DE350B" : "var(--ink5)", fontWeight: 600 }}>
                          {it.sold_qty > 0 ? \`-\${it.sold_qty}\` : "0"}
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 700, background: "#F8FAFC" }}>`;

const newTd = `<td style={{ textAlign: "center", color: it.sold_qty > 0 ? "#DE350B" : "var(--ink5)", fontWeight: 600 }}>
                          {it.sold_qty > 0 ? \`-\${it.sold_qty}\` : "0"}
                        </td>
                        <td style={{ textAlign: "center", color: it.waste_qty > 0 ? "#9A3412" : "var(--ink5)", fontWeight: 600 }}>
                          {it.waste_qty > 0 ? \`-\${it.waste_qty}\` : "0"}
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 700, background: "#F8FAFC" }}>`;

if (content.includes(oldTd)) {
    content = content.replace(oldTd, newTd);
    console.log("Successfully replaced TD!");
} else {
    console.log("TD not found!");
}

fs.writeFileSync('src/backoffice/components/inventory/InvDailyRecon.jsx', content);
