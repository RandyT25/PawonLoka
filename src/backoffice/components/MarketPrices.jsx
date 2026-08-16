import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import * as XLSX from "xlsx"

const fmt    = n => "Rp " + Number(Math.round(n||0)).toLocaleString("id-ID")
const fmtDec = n => "Rp " + Number(n||0).toLocaleString("id-ID", { minimumFractionDigits:2, maximumFractionDigits:2 })

const BUY_UNITS_FALLBACK = ["gr","kg","ml","L","galon","pcs","ekor","pack","bag","pouch","botol","can","ikat","tray","liter","sachet","custom"]
const STAFF_LIST = ["Claudy","Nita","Aisyah","Mahes","Meldy","Oji","Yudi","Alin"]

export default function MarketPrices() {
  const [ingredients, setIngredients] = useState([])
  const [rows,        setRows]        = useState([]) // editable state per ingredient
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [savedIds,    setSavedIds]    = useState(new Set())
  const [search,      setSearch]      = useState("")
  const [catFilter,   setCatFilter]   = useState("")
  const [checkedBy,   setCheckedBy]   = useState("")
  const [checkedAt,   setCheckedAt]   = useState(new Date().toISOString().slice(0,10))
  const [history,     setHistory]     = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [historyIng,  setHistoryIng]  = useState(null)
  const [buyUnitsList, setBuyUnitsList] = useState(BUY_UNITS_FALLBACK)

  useEffect(() => { load() }, [])

  useEffect(() => {
    supabase.from("app_settings").select("units").eq("id","main").maybeSingle()
      .then(({data}) => { if (data?.units?.length) setBuyUnitsList(data.units.map(u=>u.name)) })
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: ings }, { data: prices }] = await Promise.all([
      supabase.from("ingredients").select("*").order("name"),
      supabase.from("market_prices").select("*").order("checked_at", { ascending: false }).limit(500)
    ])

    const ingList = (ings||[]).filter(i => !i.name?.includes("(sub)") && i.category !== "Semi-finished" && !Array.isArray(i.category))
    setIngredients(ingList)

    // Build editable rows — one per ingredient
    const priceMap = {}
    ;(prices||[]).forEach(p => {
      if (!priceMap[p.ingredient_id]) priceMap[p.ingredient_id] = p
    })

    setRows(ingList.map(i => {
      const lastPrice = priceMap[i.id]
      const conv = (i.conversions||[])[0] // primary conversion
      return {
        ingredient_id:   i.id,
        name:            i.name,
        category:        i.category || "Uncategorized",
        base_unit:       i.unit || "gr",
        buy_unit:        lastPrice?.unit || conv?.unit || i.unit || "gr",
        conv_qty:        lastPrice?.conv_qty || conv?.qty || 1,
        market_price:    lastPrice?.price || "",
        last_po_price:   conv?.last_price || i.last_purchase_price || 0,
        current_wac:     i.cost_per_unit || 0,
        notes:           "",
        changed:         false,
      }
    }))
    setLoading(false)
  }

  function updateRow(id, patch) {
    setRows(prev => prev.map(r => r.ingredient_id === id ? { ...r, ...patch, changed: true } : r))
  }
  async function saveUnitOnly(row) {
    // Save buy_unit and conv_qty to ingredient conversions without needing a price
    try {
      const { data: ingData } = await supabase.from("ingredients").select("conversions,unit").eq("id", row.ingredient_id).maybeSingle()
      if (!ingData) return
      const convs = ingData.conversions || []
      let updated = false
      const newConvs = convs.map(c => {
        if (c.unit === row.buy_unit) { updated = true; return { ...c, qty: parseFloat(row.conv_qty)||c.qty } }
        return c
      })
      if (!updated) newConvs.push({ unit: row.buy_unit, qty: parseFloat(row.conv_qty)||1, last_price: 0, sku:"" })
      await supabase.from("ingredients").update({ conversions: newConvs }).eq("id", row.ingredient_id)
      setRows(prev => prev.map(r => r.ingredient_id === row.ingredient_id ? { ...r, changed: false } : r))
      setSavedIds(prev => new Set([...prev, row.ingredient_id]))
    } catch(e) { alert("Error: " + e.message) }
  }

  function costPerBase(row) {
    const price = parseFloat(row.market_price)
    const qty   = parseFloat(row.conv_qty)
    if (!price || !qty) return null
    return price / qty
  }

  function diffVsWac(row) {
    const cpb = costPerBase(row)
    if (!cpb || !row.current_wac) return null
    return ((cpb - row.current_wac) / row.current_wac * 100)
  }

  async function saveRow(row) {
    const price = parseFloat(row.market_price)
    if (!price) { alert("Enter a market price first"); return }
    setSaving(true)
    try {
      const { error } = await supabase.from("market_prices").insert({
        id: "MP-" + Date.now() + "-" + String(row.ingredient_id).slice(-4),
        ingredient_id:   row.ingredient_id,
        ingredient_name: row.name,
        price:           price,
        unit:            row.buy_unit,
        conv_qty:        parseFloat(row.conv_qty) || 1,
        source:          "Market Check",
        checked_by:      "Claudy",
        checked_at:      checkedAt,
        notes:           row.notes,
      })
      if (error) throw new Error(error.message)
      const { data: ingData } = await supabase.from("ingredients").select("conversions,cost_per_unit").eq("id", row.ingredient_id).maybeSingle()
      if (ingData) {
        const convs = ingData.conversions || []
        let updated = false
        const newConvs = convs.map(c => {
          if (c.unit === row.buy_unit) { updated = true; return { ...c, last_price: price, qty: parseFloat(row.conv_qty)||c.qty } }
          return c
        })
        if (!updated) newConvs.push({ unit: row.buy_unit, qty: parseFloat(row.conv_qty)||1, last_price: price, sku:"" })
        const patch = { conversions: newConvs }
        // Seed cost_per_unit from market price when ingredient has never been costed
        if (!ingData.cost_per_unit || ingData.cost_per_unit === 0) {
          patch.cost_per_unit = Math.round((price / (parseFloat(row.conv_qty) || 1)) * 100) / 100
        }
        await supabase.from("ingredients").update(patch).eq("id", row.ingredient_id)
      }
      setSavedIds(prev => new Set([...prev, row.ingredient_id]))
      setRows(prev => prev.map(r => r.ingredient_id === row.ingredient_id ? { ...r, changed: false } : r))
    } catch(e) { alert("Save error: " + e.message) }
    setSaving(false)
  }

  async function saveAll() {
    const toSave = filtered.filter(r => r.changed && parseFloat(r.market_price) > 0)
    if (!toSave.length) { alert("No changes to save"); return }
    setSaving(true)
    for (const row of toSave) await saveRow(row)
    setSaving(false)
    alert("Saved " + toSave.length + " price checks")
  }

  async function showIngHistory(row) {
    const { data } = await supabase.from("market_prices")
      .select("*").eq("ingredient_id", row.ingredient_id)
      .order("checked_at", { ascending: false }).limit(20)
    setHistory(data||[])
    setHistoryIng(row)
    setShowHistory(true)
  }

  function exportExcel() {
    const rows_exp = filtered.map(r => {
      const cpb  = costPerBase(r)
      const diff = diffVsWac(r)
      return {
        "Ingredient":     r.name,
        "Category":       r.category,
        "Recipe Unit":    r.base_unit,
        "Buy Unit":       r.buy_unit,
        "Conv Factor":    r.conv_qty + " " + r.base_unit + " per " + r.buy_unit,
        "Market Price":   parseFloat(r.market_price)||0,
        "Cost/Base Unit": cpb ? Math.round(cpb*100)/100 : "",
        "Current WAC":    r.current_wac,
        "Difference %":   diff ? diff.toLocaleString("id-ID",{minimumFractionDigits:1,maximumFractionDigits:1})+"%" : "",
        "Last PO Price":  r.last_po_price,
        "Date":           checkedAt,
        "Notes":          r.notes,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows_exp)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Market Prices")
    XLSX.writeFile(wb, "market_prices_" + checkedAt + ".xlsx")
  }

  const cats = [...new Set(ingredients.map(i => i.category).filter(Boolean))].sort()
  const filtered = rows.filter(r => {
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase())
    const matchCat    = !catFilter || r.category === catFilter
    return matchSearch && matchCat
  })

  const changedCount = filtered.filter(r => r.changed).length
  const filledCount  = filtered.filter(r => parseFloat(r.market_price) > 0).length

  return (
    <div style={{ padding:24, maxWidth:1200, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:900, color:"var(--ink1)", marginBottom:4 }}>Market Price List</div>
          <div style={{ fontSize:13, color:"var(--ink4)" }}>Record today's market prices and compare vs your current costs</div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button onClick={exportExcel} className="bo-btn bo-btn-ghost">Export Excel</button>
          {changedCount > 0 && (
            <button onClick={saveAll} disabled={saving} className="bo-btn bo-btn-primary">
              {saving ? "Saving..." : "Save All (" + changedCount + " changes)"}
            </button>
          )}
        </div>
      </div>

      {/* Session info */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:"14px 16px", marginBottom:16, display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ fontSize:13, fontWeight:700, color:"var(--ink3)" }}>Price Check Session:</div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <label className="bo-label" style={{ marginBottom:0, whiteSpace:"nowrap" }}>Date</label>
          <input type="date" value={checkedAt} onChange={e=>setCheckedAt(e.target.value)} className="bo-input" style={{ width:150 }} />
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <label className="bo-label" style={{ marginBottom:0, whiteSpace:"nowrap" }}>Checked by</label>
          <select value={checkedBy} onChange={e=>setCheckedBy(e.target.value)} className="bo-select" style={{ width:140 }}>
            <option value="">— Select —</option>
            {STAFF_LIST.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ marginLeft:"auto", fontSize:12, color:"var(--ink4)" }}>
          {filledCount} of {filtered.length} filled
          {changedCount > 0 && <span style={{ marginLeft:8, color:"var(--brand)", fontWeight:700 }}>{changedCount} unsaved</span>}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <input placeholder="Search ingredient..." value={search} onChange={e=>setSearch(e.target.value)} className="bo-input" style={{ flex:1, minWidth:180 }} />
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} className="bo-select" style={{ width:180 }}>
          <option value="">All Categories</option>
          {cats.map(c => <option key={c}>{c}</option>)}
        </select>
        <button onClick={()=>{setSearch("");setCatFilter("")}} className="bo-btn bo-btn-ghost bo-btn-sm">Clear</button>
      </div>

      {/* Table */}
      {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", overflow:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:900 }}>
            <thead>
              <tr style={{ background:"#F8FAFC" }}>
                {["Ingredient","Category","Recipe Unit","Buy Unit","Conv Factor","Market Price","Cost/Base Unit","Current WAC","Diff vs WAC",""].map(h => (
                  <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:10, fontWeight:700, color:"var(--ink4)", borderBottom:"1px solid #E8ECF0", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const cpb    = costPerBase(row)
                const diff   = diffVsWac(row)
                const saved  = savedIds.has(row.ingredient_id)
                const filled = parseFloat(row.market_price) > 0
                return (
                  <tr key={row.ingredient_id} style={{ borderBottom:"1px solid #F0F4F8", background: saved ? "#F0FFF4" : row.changed ? "#F0F7FF" : "#fff" }}>
                    {/* Name */}
                    <td style={{ padding:"8px 12px", fontWeight:700, fontSize:13 }}>
                      {row.name}
                      {row.notes !== undefined && (
                        <input value={row.notes} onChange={e=>updateRow(row.ingredient_id,{notes:e.target.value})}
                          placeholder="notes..." style={{ display:"block", fontSize:10, color:"var(--ink5)", border:"none", outline:"none", background:"transparent", width:"100%", marginTop:2 }} />
                      )}
                    </td>
                    {/* Category */}
                    <td style={{ padding:"8px 12px", fontSize:11, color:"var(--ink4)" }}>{row.category}</td>
                    {/* Base unit */}
                    <td style={{ padding:"8px 12px", fontSize:12, fontWeight:600, color:"#6554C0" }}>{row.base_unit}</td>
                    {/* Buy unit - editable */}
                    <td style={{ padding:"8px 12px" }}>
                      <select value={row.buy_unit} onChange={e=>updateRow(row.ingredient_id,{buy_unit:e.target.value})}
                        style={{ fontSize:12, border:"1px solid var(--surface3)", borderRadius:6, padding:"4px 6px", background:"#fff", width:80 }}>
                        {buyUnitsList.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    {/* Conv factor - editable */}
                    <td style={{ padding:"8px 12px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"var(--ink4)" }}>
                        <span>1 {row.buy_unit} =</span>
                        <input type="number" value={row.conv_qty} onChange={e=>updateRow(row.ingredient_id,{conv_qty:e.target.value})}
                          style={{ width:60, fontSize:12, border:"1px solid var(--surface3)", borderRadius:6, padding:"4px 6px", textAlign:"center" }} />
                        <span>{row.base_unit}</span>
                      </div>
                    </td>
                    {/* Market price - main input */}
                    <td style={{ padding:"8px 12px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <span style={{ fontSize:11, color:"var(--ink4)" }}>Rp</span>
                        <input type="number" value={row.market_price} onChange={e=>updateRow(row.ingredient_id,{market_price:e.target.value})}
                          placeholder="0" style={{ width:90, fontSize:13, fontWeight:700, border:"1.5px solid "+(filled?"var(--brand)":"var(--surface3)"), borderRadius:6, padding:"5px 8px", background: filled?"var(--brand-lt)":"#fff" }} />
                        <span style={{ fontSize:10, color:"var(--ink5)" }}>/{row.buy_unit}</span>
                      </div>
                    </td>
                    {/* Cost per base unit */}
                    <td style={{ padding:"8px 12px", fontSize:12, fontWeight:700, color:"var(--ink2)" }}>
                      {cpb ? fmtDec(cpb) + "/" + row.base_unit : <span style={{ color:"var(--ink5)" }}>—</span>}
                    </td>
                    {/* Current WAC */}
                    <td style={{ padding:"8px 12px", fontSize:12, color:"var(--ink4)" }}>
                      {row.current_wac > 0 ? fmtDec(row.current_wac) + "/" + row.base_unit : <span style={{ color:"var(--ink5)" }}>No WAC</span>}
                    </td>
                    {/* Diff vs WAC */}
                    <td style={{ padding:"8px 12px" }}>
                      {diff !== null ? (
                        <span style={{ fontSize:12, fontWeight:800, color: diff > 10 ? "var(--red)" : diff < -10 ? "var(--green)" : "var(--amber)" }}>
                          {diff > 0 ? "+" : ""}{diff.toLocaleString("id-ID",{minimumFractionDigits:1,maximumFractionDigits:1})}%
                          {diff > 10 ? " ⚠" : diff < -5 ? " ✓" : ""}
                        </span>
                      ) : <span style={{ color:"var(--ink5)", fontSize:11 }}>—</span>}
                    </td>
                    {/* Actions */}
                    <td style={{ padding:"8px 12px" }}>
                      <div style={{ display:"flex", gap:4 }}>
                        {row.changed && (
                          <button onClick={()=>{ filled ? saveRow(row) : saveUnitOnly(row) }} disabled={saving} className="bo-btn bo-btn-primary bo-btn-sm">Save</button>
                        )}
                        {saved && !row.changed && (
                          <span style={{ fontSize:11, color:"var(--green)", fontWeight:700 }}>Saved</span>
                        )}
                        <button onClick={()=>showIngHistory(row)} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ fontSize:10 }}>History</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* History Modal */}
      {showHistory && historyIng && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setShowHistory(false)}>
          <div className="bo-modal" style={{ maxWidth:520 }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">Price History — {historyIng.name}</div>
              <button className="bo-modal-close" onClick={()=>setShowHistory(false)}>x</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto", maxHeight:400 }}>
              {history.length === 0 ? (
                <div style={{ textAlign:"center", color:"var(--ink5)", padding:24 }}>No history yet</div>
              ) : (
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ background:"var(--surface)" }}>
                      {["Date","Price","Unit","Cost/Base","Checked By","Notes"].map(h => (
                        <th key={h} style={{ padding:"8px 10px", fontSize:11, fontWeight:700, color:"var(--ink4)", textAlign:"left", borderBottom:"1px solid var(--surface3)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => {
                      const cpb = h.conv_qty ? h.price / h.conv_qty : null
                      return (
                        <tr key={h.id} style={{ borderBottom:"1px solid var(--surface2)" }}>
                          <td style={{ padding:"8px 10px", fontSize:12 }}>{h.checked_at}</td>
                          <td style={{ padding:"8px 10px", fontSize:12, fontWeight:700 }}>{fmt(h.price)}/{h.unit}</td>
                          <td style={{ padding:"8px 10px", fontSize:11, color:"var(--ink4)" }}>{h.unit}</td>
                          <td style={{ padding:"8px 10px", fontSize:12 }}>{cpb ? fmtDec(cpb) : "—"}</td>
                          <td style={{ padding:"8px 10px", fontSize:11 }}>{h.checked_by||"—"}</td>
                          <td style={{ padding:"8px 10px", fontSize:11, color:"var(--ink4)" }}>{h.notes||"—"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setShowHistory(false)} className="bo-btn bo-btn-ghost">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
