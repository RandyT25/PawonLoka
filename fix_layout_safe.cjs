const fs = require('fs');
const file = 'src/backoffice/components/inventory/InvDailyRecon.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Safely replace the notes div
const oldNotes = `{viewDetail.data?.notes && (
                <div style={{ background: "#FEF3C7", padding: "12px 16px", borderRadius: 8, marginBottom: 20, color: "#92400E", fontWeight: 500, fontSize: 14 }}>
                  <span style={{ fontWeight: 700 }}>Catatan Kasir:</span> {viewDetail.data.notes}
                </div>
              )}`;

const newNotes = `{viewDetail.data?.notes && (
                <div style={{ background: "#F8FAFC", padding: "16px", borderRadius: 8, marginBottom: 24, border: "1px solid #E2E8F0" }}>
                  <div style={{ color: "#334155", fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 18 }}>📝</span> Catatan Kasir / Analisis Otomatis
                  </div>
                  <div style={{ color: "#475569", fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {viewDetail.data.notes}
                  </div>
                </div>
              )}`;

if (content.includes(oldNotes)) {
  content = content.replace(oldNotes, newNotes);
  console.log("Notes UI updated!");
} else {
  console.log("Could not find the exact oldNotes string, falling back to split");
  // fallback split strategy
  const parts = content.split('{viewDetail.data?.notes && (');
  if (parts.length > 1) {
    const endPart = parts[1].split(')}')[1];
    content = parts[0] + newNotes.replace('{viewDetail.data?.notes && (', '') + ')}' + endPart;
    console.log("Notes UI updated via split!");
  }
}

// 2. Safely replace the missing TD
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
  console.log("TD inserted successfully!");
} else {
  console.log("Could not find oldTd!");
}

fs.writeFileSync(file, content);
