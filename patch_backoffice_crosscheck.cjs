const fs = require('fs');
const file = 'src/backoffice/components/inventory/InvDailyRecon.jsx';
let content = fs.readFileSync(file, 'utf8');

const oldMasukTd = /<td style=\{\{\s*textAlign:\s*"center",\s*color:\s*it\.added_qty\s*>\s*0\s*\?\s*"#00875A"\s*:\s*"var\(--ink5\)"\s*\}\}>\s*\{it\.added_qty\s*>\s*0\s*\?\s*`\+\$\{it\.added_qty\}`\s*:\s*"0"\}\s*<\/td>/s;

const newMasukTd = `<td style={{ textAlign: "center", color: it.added_qty > 0 ? "#00875A" : "var(--ink5)" }}>
                          {it.added_qty > 0 ? \`+\${it.added_qty}\` : "0"}
                          {it.claimed_added_qty !== undefined && it.claimed_added_qty !== it.added_qty && (
                            <div style={{ color: "#DE350B", fontSize: 10, fontWeight: 700, marginTop: 2, background: "#FEE2E2", padding: "2px 4px", borderRadius: 4 }}>
                              Klaim Kasir: +{it.claimed_added_qty}
                            </div>
                          )}
                        </td>`;

if (content.match(oldMasukTd)) {
  content = content.replace(oldMasukTd, newMasukTd);
  console.log("Backoffice cross-check UI applied!");
} else {
  console.log("Could not match Backoffice TD regex!");
}

fs.writeFileSync(file, content);
