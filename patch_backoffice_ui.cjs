const fs = require('fs');
const file = 'src/backoffice/components/inventory/InvDailyRecon.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Widen the modal
content = content.replace('style={{ maxWidth: 840 }}', 'style={{ maxWidth: 1100 }}');

// 2. Fix the headers (1 line via nowrap) and add -Produksi
const thRegex = /<th style=\{\{\s*textAlign:\s*"center"\s*\}\}>Awal<\/th>[\s\S]*?<th style=\{\{\s*textAlign:\s*"center"\s*\}\}>-Waste\/Adj<\/th>/s;
if (content.match(thRegex)) {
  content = content.replace(thRegex, `<th style={{ textAlign: "center", whiteSpace: "nowrap" }}>Awal</th>
                    <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>+Masuk</th>
                    <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>-Terjual</th>
                    <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>-Produksi</th>
                    <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>-Waste/Adj</th>`);
  console.log("Headers updated!");
} else {
  console.log("Could not match TH headers!");
}

// Ensure Sisa Teori, Sisa Fisik, Selisih, Nilai Selisih also have nowrap
content = content.replace(
  /<th style=\{\{\s*textAlign:\s*"center",\s*background:\s*"#F1F5F9"\s*\}\}>Sisa Teori<\/th>/,
  '<th style={{ textAlign: "center", background: "#F1F5F9", whiteSpace: "nowrap" }}>Sisa Teori</th>'
);
content = content.replace(
  /<th style=\{\{\s*textAlign:\s*"center",\s*background:\s*"#EFF6FF"\s*\}\}>Sisa Fisik<\/th>/,
  '<th style={{ textAlign: "center", background: "#EFF6FF", whiteSpace: "nowrap" }}>Sisa Fisik</th>'
);
content = content.replace(
  /<th style=\{\{\s*textAlign:\s*"center"\s*\}\}>Selisih<\/th>/,
  '<th style={{ textAlign: "center", whiteSpace: "nowrap" }}>Selisih</th>'
);
content = content.replace(
  /<th style=\{\{\s*textAlign:\s*"right"\s*\}\}>Nilai Selisih<\/th>/,
  '<th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Nilai Selisih</th>'
);

// 3. Insert the -Produksi TD in the table body
const tdRegex = /<td style=\{\{\s*textAlign:\s*"center",\s*color:\s*it\.waste_qty > 0 \? "#9A3412" : "var\(--ink5\)",\s*fontWeight:\s*600\s*\}\}>\s*\{it\.waste_qty > 0 \? `-\$\{it\.waste_qty\}` : "0"\}\s*<\/td>/s;
if (content.match(tdRegex)) {
  content = content.replace(tdRegex, `<td style={{ textAlign: "center", color: (it.production_qty || 0) > 0 ? "#D97706" : "var(--ink5)", fontWeight: 600 }}>
                          {(it.production_qty || 0) > 0 ? \`-\${it.production_qty}\` : "0"}
                        </td>
                        <td style={{ textAlign: "center", color: it.waste_qty > 0 ? "#9A3412" : "var(--ink5)", fontWeight: 600 }}>
                          {it.waste_qty > 0 ? \`-\${it.waste_qty}\` : "0"}
                        </td>`);
  console.log("TD updated!");
} else {
  console.log("Could not match TD!");
}

// 4. Add padding bottom to modal body so nothing gets cut off
content = content.replace(
  '<div className="bo-modal-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>',
  '<div className="bo-modal-body" style={{ maxHeight: "75vh", overflowY: "auto", paddingBottom: "40px" }}>'
);

fs.writeFileSync(file, content);
