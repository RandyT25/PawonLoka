import { useState } from "react"
import { supabase } from "../../lib/supabase"
import * as XLSX from "xlsx"

function fmt(n) { return Number(n||0).toLocaleString("id-ID") }

const MODULES = {
  ingredients: {
    label: "Ingredients",
    icon: "🧂",
    table: "ingredients",
    exportCols: ["id","name","unit","category","stock","min_stock","cost_per_unit","supplier"],
    importKey: "id",
    headers: ["id*","name*","unit*","category*","stock","min_stock","cost_per_unit","supplier"],
  },
  products: {
    label: "Products",
    icon: "🍽",
    table: "products",
    exportCols: ["sku","name","cat","price","cogs","active","desc"],
    importKey: "sku",
    headers: ["sku*","name*","cat","price","cogs","active","desc"],
  },
  customers: {
    label: "Customers",
    icon: "⭐",
    table: "customers",
    exportCols: ["id","name","phone","email","tier","points","totalSpend","join_date","notes"],
    importKey: "phone",
    headers: ["name*","phone*","email","tier","points","notes"],
  },
}

export default function ImportExport() {
  const [active,    setActive]    = useState("ingredients")
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [result,    setResult]    = useState(null)

  const mod = MODULES[active]

  async function exportData() {
    setExporting(true)
    setResult(null)
    const { data, error } = await supabase.from(mod.table).select(mod.exportCols.join(",")).order("name", { ascending:true })
    if (error) { alert("Export error: "+error.message); setExporting(false); return }
    const ws = XLSX.utils.json_to_sheet(data||[])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, mod.label)
    XLSX.writeFile(wb, `PawonLoka_${mod.label}_${new Date().toISOString().slice(0,10)}.xlsx`)
    setExporting(false)
  }

  async function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setResult(null)
    e.target.value = ""

    const reader = new FileReader()
    reader.onload = async(ev) => {
      try {
        const wb   = XLSX.read(ev.target.result, { type:"array" })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval:"" })

        let inserted=0, updated=0, skipped=0, errors=0

        for (const row of rows) {
          const keyVal = row[mod.importKey] || row[mod.importKey+"*"]
          if (!keyVal) { skipped++; continue }

          // Check if exists
          const { data: existing } = await supabase
            .from(mod.table)
            .select("*")
            .eq(mod.importKey, String(keyVal).trim())
            .maybeSingle()

          // Build payload — only include non-empty values from row
          const payload = {}
          for (const [k, v] of Object.entries(row)) {
            const cleanKey = k.replace("*","").trim()
            if (v !== "" && v !== null && v !== undefined) {
              payload[cleanKey] = typeof v === "string" ? v.trim() : v
            }
          }

          if (existing) {
            // Check if anything changed
            let changed = false
            for (const [k,v] of Object.entries(payload)) {
              if (String(existing[k]||"") !== String(v||"")) { changed=true; break }
            }
            if (!changed) { skipped++; continue }
            const { error } = await supabase.from(mod.table).update(payload).eq(mod.importKey, String(keyVal).trim())
            if (error) errors++
            else updated++
          } else {
            // Insert new
            if (active==="ingredients") {
              // A blank category cell used to silently omit the field from the insert
              // entirely, leaving new ingredients with no category (they'd then show as
              // "General"/uncategorized everywhere) — reject instead, matching the "id*"/
              // "name*" required-field convention already used for this module.
              if (!payload.category) { errors++; continue }
              payload.id = payload.id || "ING-"+(payload.sku||"").replace(/[^a-zA-Z0-9]/g,"").slice(0,10)+"-"+Math.random().toString(36).slice(2,6)
              payload.conversions = payload.conversions || []
              payload.stock = parseFloat(payload.stock)||0
              payload.cost_per_unit = parseFloat(payload.cost_per_unit)||0
              payload.min_stock = parseFloat(payload.min_stock)||0
            }
            if (active==="customers") {
              payload.id = payload.id || "CUS-"+Date.now()+Math.random().toString(36).slice(2,5)
              payload.points = parseFloat(payload.points)||0
            }
            const { error } = await supabase.from(mod.table).insert(payload)
            if (error) errors++
            else inserted++
          }
        }
        setResult({ inserted, updated, skipped, errors, total:rows.length })
      } catch(err) {
        setResult({ error: err.message })
      }
      setImporting(false)
    }
    reader.readAsArrayBuffer(file)
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([mod.headers, mod.headers.map(()=>"")])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Template")
    XLSX.writeFile(wb, `PawonLoka_${mod.label}_Template.xlsx`)
  }

  return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {Object.entries(MODULES).map(([key,m])=>(
          <button key={key} onClick={()=>{setActive(key);setResult(null)}} className={"bo-btn bo-btn-sm "+(active===key?"bo-btn-primary":"bo-btn-ghost")}>
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
        {/* Export */}
        <div className="bo-card">
          <div style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>📤 Export</div>
          <div style={{ fontSize:13, color:"var(--ink4)", marginBottom:16 }}>Download all {mod.label.toLowerCase()} as Excel file</div>
          <button onClick={exportData} disabled={exporting} className="bo-btn bo-btn-primary" style={{ width:"100%" }}>
            {exporting ? "Exporting..." : `⬇ Export ${mod.label}`}
          </button>
        </div>

        {/* Import */}
        <div className="bo-card">
          <div style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>📥 Import</div>
          <div style={{ fontSize:13, color:"var(--ink4)", marginBottom:12 }}>
            Upload Excel to add/update {mod.label.toLowerCase()}.<br/>
            <span style={{ fontSize:11, color:"var(--ink5)" }}>Matched by: <b>{mod.importKey}</b>. Unchanged rows are skipped.</span>
          </div>
          <button onClick={downloadTemplate} className="bo-btn bo-btn-ghost" style={{ width:"100%", marginBottom:8, fontSize:12 }}>
            📋 Download Template
          </button>
          <label style={{ display:"block", width:"100%", padding:"11px", borderRadius:"var(--r)", background:"var(--brand)", color:"#fff", fontSize:14, fontWeight:700, textAlign:"center", cursor:"pointer", boxSizing:"border-box" }}>
            {importing ? "Importing..." : "⬆ Choose Excel File"}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} style={{ display:"none" }} disabled={importing} />
          </label>
        </div>
      </div>

      {/* Result */}
      {result && !result.error && (
        <div style={{ padding:"14px 18px", background:"var(--green-lt)", border:"1px solid rgba(0,135,90,0.2)", borderRadius:"var(--r)" }}>
          <div style={{ fontSize:14, fontWeight:800, color:"var(--green)", marginBottom:8 }}>✅ Import Complete</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
            {[["Total Rows",result.total],["Inserted",result.inserted],["Updated",result.updated],["Skipped",result.skipped]].map(([l,v])=>(
              <div key={l} style={{ textAlign:"center" }}>
                <div style={{ fontSize:22, fontWeight:900 }}>{v}</div>
                <div style={{ fontSize:11, color:"var(--ink4)" }}>{l}</div>
              </div>
            ))}
          </div>
          {result.errors > 0 && <div style={{ marginTop:8, fontSize:12, color:"var(--red)", fontWeight:600 }}>{result.errors} rows had errors (duplicate IDs or missing required fields)</div>}
        </div>
      )}
      {result?.error && (
        <div style={{ padding:"14px 18px", background:"var(--red-lt)", borderRadius:"var(--r)", fontSize:13, color:"var(--red)", fontWeight:700 }}>
          ❌ Error: {result.error}
        </div>
      )}

      {/* Column reference */}
      <div className="bo-card" style={{ marginTop:16 }}>
        <div style={{ fontSize:13, fontWeight:800, marginBottom:10 }}>📋 {mod.label} — Column Reference</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {mod.headers.map(h=>(
            <span key={h} style={{ fontSize:11, padding:"3px 9px", borderRadius:10, background:h.includes("*")?"var(--brand-lt)":"var(--surface)", color:h.includes("*")?"var(--brand)":"var(--ink4)", fontWeight:700, fontFamily:"monospace" }}>{h}</span>
          ))}
        </div>
        <div style={{ fontSize:11, color:"var(--ink5)", marginTop:8 }}>* = required field</div>
      </div>
    </div>
  )
}
