const fs = require('fs');
let content = fs.readFileSync('src/backoffice/components/inventory/InvDailyRecon.jsx', 'utf8');

const oldNotes = `{viewDetail.data?.notes && (
                <div style={{ background: "#FEF3C7", padding: "10px 14px", borderRadius: 8, fontSize: 12.5, color: "#92400E", marginBottom: 14 }}>
                  <b>Catatan Kasir:</b> {viewDetail.data.notes}
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

if (content.includes(oldNotes)) {
    content = content.replace(oldNotes, newNotes);
    console.log("Successfully replaced notes!");
} else {
    console.log("Notes still not found!");
}

fs.writeFileSync('src/backoffice/components/inventory/InvDailyRecon.jsx', content);
