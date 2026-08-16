import { useState, useEffect, useRef } from "react"
import { supabase } from "../../lib/supabase"
import { toBaseUnit, unitPriceFor } from "../../shared/unitConversion"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }

const TYPE_COLORS = { opname:"var(--brand)", waste:"var(--red)", consumption:"#F59E0B", production:"var(--green)", requisition:"#6554C0" }
const TYPE_ICONS  = { opname:"📋", waste:"🗑️", consumption:"🍽️", production:"🏭", requisition:"🛒" }
const TYPE_LABELS = { opname:"Stock Count", waste:"Waste", consumption:"Staff Meal", production:"Production", requisition:"Request" }

// The stock_movements.type value that approveOne() writes for each stock-affecting
// submission type when it actually runs. Used to detect submissions marked "approved"
// whose data never went through approveOne() (e.g. a manual DB edit) — requisition is
// intentionally excluded since it never touches stock.
const EXPECTED_MOVEMENT_TYPE = { opname:"Adjustment", waste:"Waste", consumption:"Staff Meal", production:"Production" }

function IngSearchEdit({ ingredients, onSelect }) {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const filtered = ingredients.filter(i => !q || i.name.toLowerCase().includes(q.toLowerCase())).slice(0,20)
  return (
    <div style={{ position:"relative" }}>
      <input value={q} onChange={e=>{ setQ(e.target.value); setOpen(true) }} onFocus={()=>setOpen(true)}
        className="bo-input" style={{ fontSize:12 }} placeholder="Search ingredient..." />
      {open && filtered.length > 0 && (
        <div style={{ position:"absolute", zIndex:999, top:"100%", left:0, right:0, background:"#fff", border:"1px solid var(--surface3)", borderRadius:8, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", maxHeight:180, overflowY:"auto" }}>
          {filtered.map(ing => (
            <div key={ing.id} onClick={()=>{ onSelect(ing); setQ(ing.name); setOpen(false) }}
              style={{ padding:"8px 12px", fontSize:13, cursor:"pointer", borderBottom:"1px solid var(--surface)" }}
              onMouseEnter={e=>e.currentTarget.style.background="var(--brand-lt)"}
              onMouseLeave={e=>e.currentTarget.style.background=""}>
              {ing.name} <span style={{ fontSize:11, color:"var(--ink4)" }}>{ing.unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StaffSubmissions() {
  const [submissions, setSubmissions] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [subRecipes,  setSubRecipes]  = useState([])
  const [subRecipeIngs, setSubRecipeIngs] = useState([])
  const [suppliers,   setSuppliers]   = useState([])
  const [reqSelected, setReqSelected] = useState(new Set())
  const [typeFilter,  setTypeFilter]  = useState("all")
  const [statusFilter,setStatusFilter]= useState("all")
  const [viewModal,   setViewModal]   = useState(null)
  const [liveStock,   setLiveStock]   = useState({}) // ingredient_id -> fresh stock, fetched when opening an opname review
  const [editModal,   setEditModal]   = useState(null)
  const [editData,    setEditData]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState(null)
  const [processing,  setProcessing]  = useState(false)
  const [newCount,    setNewCount]    = useState(0)
  const [selected,    setSelected]    = useState(new Set())
  const [confirmState, setConfirmState] = useState(null) // {message, resolve}
  const [orphanApprovedIds, setOrphanApprovedIds] = useState(new Set()) // approved sub IDs missing their expected stock_movements
  // Acknowledged orphans — stored server-side as data._orphanAck on the submission itself
  // (not localStorage), so dismissing shows the same on every device/browser instead of
  // only the one that clicked it.
  const [dismissedOrphanIds, setDismissedOrphanIds] = useState(new Set())
  const audioRef = useRef(null)
  const channelRef = useRef(null)

  // Custom in-app confirm, replacing window.confirm() — Chrome silently auto-suppresses
  // native confirm()/alert() after a page triggers several in one session, which makes
  // Approve/Reject/Delete silently do nothing with zero feedback. This can't be suppressed.
  function askConfirm(message) {
    return new Promise(resolve => setConfirmState({ message, resolve }))
  }
  function resolveConfirm(result) {
    confirmState?.resolve(result)
    setConfirmState(null)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    channelRef.current = supabase
      .channel("staff_submissions_realtime")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"staff_submissions" }, payload => {
        setSubmissions(prev => [payload.new, ...prev])
        setNewCount(n => n + 1)
        // Play notification sound
        try {
          const ctx = new AudioContext()
          const o = ctx.createOscillator()
          const g = ctx.createGain()
          o.connect(g); g.connect(ctx.destination)
          o.frequency.value = 880; g.gain.value = 0.3
          o.start(); o.stop(ctx.currentTime + 0.15)
          setTimeout(() => { o.frequency.value = 1100; o.start(ctx.currentTime + 0.2); o.stop(ctx.currentTime + 0.35) }, 200)
        } catch(e) {}
      })
      .subscribe()
    return () => { supabase.removeChannel(channelRef.current) }
  }, [])

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const [subRes, ingRes, srRes, sriRes, supRes] = await Promise.all([
        supabase.from("staff_submissions").select("*").order("submitted_at", { ascending:false }),
        supabase.from("ingredients").select("*"),
        supabase.from("sub_recipes").select("id,name,ingredient_id,yield_qty,yield_unit"),
        supabase.from("sub_recipe_ingredients").select("*"),
        supabase.from("suppliers").select("id,name,phone"),
      ])
      // Each query resolves with {data,error} rather than throwing — a rejected/RLS'd query
      // was previously silently treated as "no data" instead of surfacing anything.
      const failed = [subRes, ingRes, srRes, sriRes, supRes].find(r => r.error)
      if (failed) throw failed.error
      const { data:s } = subRes, { data:i } = ingRes, { data:sr } = srRes, { data:sri } = sriRes, { data:sup } = supRes
      setSubmissions(s||[]); setIngredients(i||[]); setSubRecipes(sr||[]); setSubRecipeIngs(sri||[]); setSuppliers(sup||[])
      setNewCount(0)
      setDismissedOrphanIds(new Set((s||[]).filter(sub => sub.data?._orphanAck).map(sub => sub.id)))
      checkOrphanedApprovals(s||[]) // non-blocking; fills in the "not applied" badges once ready
    } catch (e) {
      // A rejected Promise.all (network/fetch failure) used to skip every line below it —
      // including setLoading(false) — leaving the page stuck on "Loading..." forever with
      // no feedback. Always resolve loading state and show what went wrong instead.
      setLoadError(e.message || "Failed to load staff reports")
    }
    setLoading(false)
  }

  // Detects approved submissions whose data never actually reached ingredients.stock —
  // i.e. status:"approved" with no corresponding stock_movements row of the expected
  // type. Fetches every stock_movements row whose ref looks like a submission id (all
  // submission ids are "SS-<timestamp>") via a single LIKE query, paginated with .range()
  // — not chunked .in() with hundreds of ids per call, which was silently truncating on
  // some batches (a too-long query URL failing without visibly breaking the page) and
  // making healthy submissions show up as false-positive orphans. Does NOT reconcile
  // exact quantities (e.g. per-line diff matching) — presence of at least one movement of
  // the right type is enough to catch the true-orphan case (the dangerous one); tighter
  // reconciliation is deliberately left out as lower-value/higher-complexity.
  async function checkOrphanedApprovals(subs) {
    const candidates = subs.filter(s => s.status === "approved" && EXPECTED_MOVEMENT_TYPE[s.type])
    if (!candidates.length) { setOrphanApprovedIds(new Set()); return }

    const typesByRef = new Map() // submission id -> Set of stock_movements.type seen for it
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from("stock_movements").select("ref,type").like("ref", "SS-%").range(from, from + PAGE - 1)
      if (error) { console.error("Orphan-approval check failed:", error); break }
      for (const row of data || []) {
        if (!typesByRef.has(row.ref)) typesByRef.set(row.ref, new Set())
        typesByRef.get(row.ref).add(row.type)
      }
      if (!data || data.length < PAGE) break
    }

    const orphans = new Set()
    for (const sub of candidates) {
      const seen = typesByRef.get(sub.id)
      if (!seen || !seen.has(EXPECTED_MOVEMENT_TYPE[sub.type])) orphans.add(sub.id)
    }
    setOrphanApprovedIds(orphans)
  }

  function isOrphanApproved(sub) {
    return sub?.status === "approved" && orphanApprovedIds.has(sub.id)
  }

  async function dismissOrphan(id) {
    const sub = submissions.find(s => s.id === id)
    if (!sub) return
    const nextData = { ...(sub.data||{}), _orphanAck: true }
    const { error } = await supabase.from("staff_submissions").update({ data: nextData }).eq("id", id)
    if (error) { alert("Gagal menyimpan acknowledge: " + error.message); return }
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, data: nextData } : s))
    setDismissedOrphanIds(prev => new Set(prev).add(id))
  }

  async function dismissAllOrphans() {
    const idsToAck = [...orphanApprovedIds].filter(id => !dismissedOrphanIds.has(id))
    if (!idsToAck.length) return
    const results = await Promise.all(idsToAck.map(async id => {
      const sub = submissions.find(s => s.id === id)
      if (!sub) return null
      const nextData = { ...(sub.data||{}), _orphanAck: true }
      const { error } = await supabase.from("staff_submissions").update({ data: nextData }).eq("id", id)
      return error ? null : { id, nextData }
    }))
    const succeeded = results.filter(Boolean)
    setSubmissions(prev => prev.map(s => {
      const hit = succeeded.find(r => r.id === s.id)
      return hit ? { ...s, data: hit.nextData } : s
    }))
    setDismissedOrphanIds(prev => {
      const next = new Set(prev)
      for (const r of succeeded) next.add(r.id)
      return next
    })
    const failedCount = idsToAck.length - succeeded.length
    if (failedCount > 0) alert(failedCount + " gagal di-acknowledge, coba lagi.")
  }

  // Re-applies an orphaned (approved-but-never-written) submission's stock effect, using
  // the exact same live-stock-diff logic approveOne() uses — fresh-fetch current stock,
  // then add the originally-recorded diff on top, so a retry weeks later still doesn't
  // erase any sales/production that happened in between. Only "opname" gets the extra
  // guard: if some OTHER Adjustment already landed on the same ingredient after this
  // submission was taken, applying the old diff again on top would double-count it, so
  // that ingredient line is skipped and reported instead of silently applied.
  async function retryOrphan(sub) {
    if (!EXPECTED_MOVEMENT_TYPE[sub.type]) return
    setProcessing(true)
    try {
      const nowTime = () => new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
      const movId = () => "MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6)

      if (sub.type === "opname") {
        const items = sub.data.items || []
        const countDate = sub.data.date || (sub.submitted_at||new Date().toISOString()).slice(0,10)
        const skipped = []
        const applied = []
        for (const item of items) {
          const { data:laterAdj } = await supabase.from("stock_movements")
            .select("id").eq("ingredient_id", item.ingredient_id).eq("type","Adjustment")
            .gt("created_at", sub.submitted_at).limit(1)
          if (laterAdj && laterAdj.length) { skipped.push(item.name); continue }
          const { data:freshIng } = await supabase.from("ingredients").select("stock").eq("id",item.ingredient_id).maybeSingle()
          const newStock = Math.max(0, (freshIng?.stock ?? item.system_qty ?? 0) + item.diff)
          const { error:updErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id",item.ingredient_id)
          if (updErr) throw updErr
          const { error:movErr } = await supabase.from("stock_movements").insert({
            id: movId(), type:"Adjustment", ingredient_id:item.ingredient_id, ingredient_name:item.name,
            qty:item.diff, unit:item.unit, ref:sub.id,
            note:"Retry (orphan backfill) — staff opname by "+sub.submitted_by,
            date:countDate, time:nowTime(),
          })
          if (movErr) throw movErr
          applied.push(item.name)
        }
        if (skipped.length) alert("Diterapkan: "+applied.length+" item.\nDilewati (sudah ada Adjustment lain setelahnya): "+skipped.join(", "))
      } else if (sub.type === "production") {
        const d = sub.data
        const outputIngredientId = d.item_id || subRecipes.find(sr=>sr.id===d.sub_recipe_id)?.ingredient_id
        const item = outputIngredientId ? ingredients.find(i=>i.id===outputIngredientId) : null
        const producedQty = d.actual_yield ?? d.batch_qty
        const producedDate = d.date || (sub.submitted_at||new Date().toISOString()).slice(0,10)
        for (const u of d.ingredients_used||[]) {
          const ing = ingredients.find(i=>i.id===u.ingredient_id)
          if (!ing) continue
          const qtyBase = toBaseUnit(ing, u.qty||0, u.unit)
          const { data:freshIng } = await supabase.from("ingredients").select("stock").eq("id",ing.id).maybeSingle()
          const newStock = Math.max(0, (freshIng?.stock ?? ing.stock ?? 0) - qtyBase)
          const { error:stockErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id",ing.id)
          if (stockErr) throw stockErr
          const { error:movErr } = await supabase.from("stock_movements").insert({
            id: movId(), type:"Production", ingredient_id:ing.id, ingredient_name:ing.name,
            qty:-qtyBase, unit:ing.unit, ref:sub.id,
            note:"Retry (orphan backfill) — production: "+d.item_name+" by "+sub.submitted_by,
            date:producedDate, time:nowTime(),
          })
          if (movErr) throw movErr
        }
        if (item) {
          const producedQtyBase = toBaseUnit(item, producedQty||0, d.yield_unit||d.unit||item.unit)
          const { data:freshItem } = await supabase.from("ingredients").select("stock").eq("id",item.id).maybeSingle()
          const newItemStock = (freshItem?.stock ?? item.stock ?? 0) + producedQtyBase
          const { error:itemErr } = await supabase.from("ingredients").update({ stock:newItemStock }).eq("id",item.id)
          if (itemErr) throw itemErr
          const { error:movErr2 } = await supabase.from("stock_movements").insert({
            id: movId(), type:"Production", ingredient_id:item.id, ingredient_name:item.name,
            qty:producedQtyBase, unit:item.unit, ref:sub.id,
            note:"Retry (orphan backfill) — production output: "+d.item_name+" by "+sub.submitted_by,
            date:producedDate, time:nowTime(),
          })
          if (movErr2) throw movErr2
        }
      } else if (sub.type === "waste") {
        const d = sub.data
        const ing = ingredients.find(i=>i.id===d.ingredient_id)
        const wasteDate = d.date || (sub.submitted_at||new Date().toISOString()).slice(0,10)
        if (ing) {
          const { data:freshIng } = await supabase.from("ingredients").select("stock").eq("id",ing.id).maybeSingle()
          const newStock = Math.max(0, (freshIng?.stock ?? ing.stock ?? 0) - d.qty)
          const { error:stockErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id",ing.id)
          if (stockErr) throw stockErr
          await supabase.from("stock_movements").insert({
            id: movId(), type:"Waste", ingredient_id:d.ingredient_id, ingredient_name:d.ingredient_name,
            qty:-d.qty, unit:d.unit, ref:sub.id,
            note:"Retry (orphan backfill) — waste by "+sub.submitted_by+": "+d.reason,
            date:wasteDate, time:nowTime(),
          })
        }
      } else if (sub.type === "consumption") {
        const d = sub.data
        const ing = ingredients.find(i=>i.id===d.ingredient_id)
        const consumedDate = d.date || (sub.submitted_at||new Date().toISOString()).slice(0,10)
        if (ing) {
          const { data:freshIng } = await supabase.from("ingredients").select("stock").eq("id",ing.id).maybeSingle()
          const newStock = Math.max(0, (freshIng?.stock ?? ing.stock ?? 0) - d.qty)
          const { error:stockErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id",ing.id)
          if (stockErr) throw stockErr
          await supabase.from("stock_movements").insert({
            id: movId(), type:"Staff Meal", ingredient_id:d.ingredient_id, ingredient_name:d.ingredient_name,
            qty:-d.qty, unit:d.unit, ref:sub.id,
            note:"Retry (orphan backfill) — staff meal by "+sub.submitted_by,
            date:consumedDate, time:nowTime(),
          })
        }
      }
      // A movement of the expected type now exists for this ref — re-mark acknowledged
      // and let the next orphan check drop it from the flagged set entirely.
      await dismissOrphan(sub.id)
      await load()
    } catch (e) {
      alert("Retry gagal: " + (e.message || e))
    }
    setProcessing(false)
  }

  const byStatus = (st) => submissions.filter(s => s.status === st)
  const pending  = byStatus("pending")
  const approved = byStatus("approved")
  const rejected = byStatus("rejected")

  const filtered = submissions.filter(s => {
    const matchStatus = statusFilter === "all" || s.status === statusFilter
    const matchType   = typeFilter === "all" || s.type === typeFilter
    return matchStatus && matchType
  })

  useEffect(() => {
    if (viewModal?.type === "requisition") {
      setReqSelected(new Set((viewModal.data.items||[]).map((_,i)=>i)))
    }
  }, [viewModal?.id])

  function openEdit(sub) {
    setEditData(JSON.parse(JSON.stringify(sub.data)))
    setEditModal(sub)
    setViewModal(null)
  }

  async function saveEdit() {
    let cleaned = editData
    if (editModal.type === "opname") {
      cleaned = { ...editData, items: (editData.items||[]).map(x => {
        const val = parseFloat(x.actual_qty)||0
        return { ...x, actual_qty: val, diff: val - x.system_qty }
      }) }
    } else if (editModal.type === "waste") {
      cleaned = { ...editData, qty: parseFloat(editData.qty)||0 }
    } else if (editModal.type === "consumption") {
      cleaned = { ...editData, qty: parseFloat(editData.qty)||0 }
    } else if (editModal.type === "requisition") {
      cleaned = { ...editData, items: (editData.items||[]).map(x => ({...x, qty: parseFloat(x.qty)||0})) }
    } else if (editModal.type === "production") {
      cleaned = { ...editData, batch_qty: parseFloat(editData.batch_qty)||0,
        actual_yield: parseFloat(editData.actual_yield)||0,
        ingredients_used: (editData.ingredients_used||[]).map(x => ({...x, qty: parseFloat(x.qty)||0})) }
    }

    if (editModal.type === "production" && editModal.status === "approved") {
      if (!(await askConfirm(
        "This submission was already approved and applied to inventory. Saving this edit will " +
        "immediately adjust live ingredient stock and the linked production record to match the " +
        "new amounts. Continue?"
      ))) return
      setProcessing(true)
      try {
        await reconcileApprovedProduction(editModal, cleaned)
      } catch(e) {
        alert("Error: "+e.message)
        setProcessing(false)
        return // bail out without writing staff_submissions.data — reconciliation failed before any mutation
      }
    }

    await supabase.from("staff_submissions").update({ data: cleaned }).eq("id", editModal.id)
    setSubmissions(prev => prev.map(s => s.id === editModal.id ? { ...s, data: cleaned } : s))
    const wasApprovedProduction = editModal.type === "production" && editModal.status === "approved"
    setEditModal(null); setEditData(null)
    if (wasApprovedProduction) { setProcessing(false); await load() } // refresh ingredient stock in the UI
  }

  // Core apply logic, shared by the single-submission Approve button and bulk approve.
  // Throws on error — callers decide how to surface it (alert vs. collecting into a batch summary).
  async function approveOne(sub) {
      if (sub.type==="opname") {
        // Use the date staff picked when counting (falls back to submission date for
        // older submissions predating the picker) — not today's date, since approval
        // can happen well after the count was actually taken.
        const countDate = sub.data.date || (sub.submitted_at||new Date().toISOString()).slice(0,10)
        for (const item of sub.data.items||[]) {
          // Apply the counted DIFFERENCE on top of current live stock (not an overwrite) — approvals
          // often happen days after the physical count, and sales/production in between must not be erased.
          const { data:freshIng } = await supabase.from("ingredients").select("stock").eq("id",item.ingredient_id).maybeSingle()
          const newStock = Math.max(0, (freshIng?.stock ?? item.system_qty) + item.diff)
          const { error:updErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id",item.ingredient_id)
          if (updErr) throw updErr
          const { error:movErr } = await supabase.from("stock_movements").insert({
            id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
            type:"Adjustment", ingredient_id:item.ingredient_id, ingredient_name:item.name,
            qty:item.diff, unit:item.unit, ref:sub.id,
            note:"Staff opname by "+sub.submitted_by,
            date:countDate,
            time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
          })
          if (movErr) throw movErr
        }
        const { error:opnErr } = await supabase.from("stock_opname").insert({
          id:"OPN-"+Date.now(), date:countDate,
          status:"Completed",
          items:sub.data.items.map(i=>{
            const cost = ingredients.find(x=>x.id===i.ingredient_id)?.cost_per_unit||0
            return { ...i, ingredient_name: i.ingredient_name || i.name, value_diff: i.diff*cost }
          }),
          total_variance:sub.data.items.reduce((a,i)=>a+(i.diff*(ingredients.find(x=>x.id===i.ingredient_id)?.cost_per_unit||0)),0)
        })
        if (opnErr) throw opnErr
      } else if (sub.type==="waste") {
        const d = sub.data
        const ing = ingredients.find(i=>i.id===d.ingredient_id)
        // Use the date staff picked when reporting (falls back to submission date for
        // older submissions predating the picker) — not today's date, since approval
        // can happen well after the waste actually happened.
        const wasteDate = d.date || (sub.submitted_at||new Date().toISOString()).slice(0,10)
        if (ing) {
          // Fresh-fetch stock right before writing — approval can happen long after
          // submission, and sales/production in between shouldn't be silently clobbered.
          const { data:freshIng } = await supabase.from("ingredients").select("stock").eq("id",ing.id).maybeSingle()
          const newStock = Math.max(0, (freshIng?.stock ?? ing.stock ?? 0) - d.qty)
          const { error:stockErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id",ing.id)
          if (stockErr) throw stockErr
          const { error:wstErr } = await supabase.from("waste_records").insert({
            id:"WST-"+Date.now(), date:wasteDate,
            ingredient_id:d.ingredient_id, ingredient_name:d.ingredient_name,
            qty:d.qty, unit:d.unit, reason:d.reason, cost:d.estimated_cost,
            recorded_by:sub.submitted_by, notes:d.notes||null
          })
          if (wstErr) throw wstErr
          await supabase.from("stock_movements").insert({
            id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
            type:"Waste", ingredient_id:d.ingredient_id, ingredient_name:d.ingredient_name,
            qty:-d.qty, unit:d.unit, ref:sub.id,
            note:"Staff waste by "+sub.submitted_by+": "+d.reason,
            date:wasteDate,
            time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
          })
        }
      } else if (sub.type==="consumption") {
        const d = sub.data
        const ing = ingredients.find(i=>i.id===d.ingredient_id)
        if (ing) {
          // Use the date staff picked when logging the meal (falls back to submission
          // date for older submissions predating the picker) — not today's date, since
          // approval can happen well after the meal was actually consumed.
          const consumedDate = d.date || (sub.submitted_at||new Date().toISOString()).slice(0,10)
          // Fresh-fetch stock right before writing — approval can happen long after
          // submission, and sales/production in between shouldn't be silently clobbered.
          const { data:freshIng } = await supabase.from("ingredients").select("stock").eq("id",ing.id).maybeSingle()
          const newStock = Math.max(0, (freshIng?.stock ?? ing.stock ?? 0) - d.qty)
          const { error:stockErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id",ing.id)
          if (stockErr) throw stockErr
          const { error:csmErr } = await supabase.from("staff_consumption").insert({
            id:"CSM-"+Date.now(), date:consumedDate,
            ingredient_id:d.ingredient_id, ingredient_name:d.ingredient_name,
            qty:d.qty, unit:d.unit, cost:d.estimated_cost,
            consumed_by:sub.submitted_by, notes:d.notes||null,
            submission_id:sub.id
          })
          if (csmErr) throw csmErr
          await supabase.from("stock_movements").insert({
            id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
            type:"Staff Meal", ingredient_id:d.ingredient_id, ingredient_name:d.ingredient_name,
            qty:-d.qty, unit:d.unit, ref:sub.id,
            note:"Staff meal by "+sub.submitted_by+(d.notes?": "+d.notes:""),
            date:consumedDate,
            time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
          })
        }
      } else if (sub.type==="production") {
        const d = sub.data
        const outputIngredientId = d.item_id || subRecipes.find(sr=>sr.id===d.sub_recipe_id)?.ingredient_id
        const item = outputIngredientId ? ingredients.find(i=>i.id===outputIngredientId) : null
        const producedQty = d.actual_yield ?? d.batch_qty
        // Use the date staff picked when producing (falls back to submission date for
        // older submissions predating the picker) — not today's date, since approval
        // can happen well after the batch was actually made.
        const producedDate = d.date || (sub.submitted_at||new Date().toISOString()).slice(0,10)
        for (const u of d.ingredients_used||[]) {
          const ing = ingredients.find(i=>i.id===u.ingredient_id)
          if (ing) {
            const qtyBase = toBaseUnit(ing, u.qty||0, u.unit)
            // Fresh-fetch stock right before writing — approval can happen long after
            // submission, and sales/production in between shouldn't be silently clobbered.
            const { data:freshIng } = await supabase.from("ingredients").select("stock").eq("id",ing.id).maybeSingle()
            const newStock = Math.max(0, (freshIng?.stock ?? ing.stock ?? 0) - qtyBase)
            const { error:stockErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id",ing.id)
            if (stockErr) throw stockErr
            const { error:movErr } = await supabase.from("stock_movements").insert({
              id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
              type:"Production", ingredient_id:ing.id, ingredient_name:ing.name,
              qty:-qtyBase, unit:ing.unit, ref:sub.id,
              note:"Production: "+d.item_name+" by "+sub.submitted_by,
              date:producedDate,
              time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
            })
            if (movErr) throw movErr
          }
        }
        if (item) {
          const producedQtyBase = toBaseUnit(item, producedQty||0, d.yield_unit||d.unit||item.unit)
          const { data:freshItem } = await supabase.from("ingredients").select("stock").eq("id",item.id).maybeSingle()
          const newItemStock = (freshItem?.stock ?? item.stock ?? 0) + producedQtyBase
          const { error:itemErr } = await supabase.from("ingredients").update({ stock:newItemStock }).eq("id",item.id)
          if (itemErr) throw itemErr
          const { error:prodErr } = await supabase.from("production_batches").insert({
            id:"PRD-"+Date.now(), item_id:item.id, item_name:d.item_name,
            batch_qty:producedQty, unit:d.yield_unit||d.unit, date:producedDate,
            produced_by:sub.submitted_by, notes:d.notes||null,
            ingredients_used:d.ingredients_used, status:"Completed",
            submission_id: sub.id,
          })
          if (prodErr) throw prodErr
        }
      }
      const { error:statusErr } = await supabase.from("staff_submissions").update({ status:"approved", reviewed_at:new Date().toISOString() }).eq("id",sub.id)
      if (statusErr) throw statusErr
  }

  // Reconciles real inventory (ingredient stock + stock_movements + the linked production_batches
  // row) after a manager edits an ALREADY-APPROVED production submission's batch_qty/ingredients.
  // Unlike a pending edit (which only rewrites staff_submissions.data, with no live-inventory
  // effect until approval), this mutates stock immediately since the original approval already
  // deducted/credited stock once — we apply the DELTA between old and new, not the full new amount.
  async function reconcileApprovedProduction(sub, newData) {
    // Resolve the matching production_batches row FIRST, before touching any stock, so a failed
    // reconciliation can't leave stock partially adjusted with no batch-record update.
    const { data:batchRow, error:batchErr } = await supabase
      .from("production_batches").select("*").eq("submission_id", sub.id).maybeSingle()
    if (batchErr) throw batchErr
    if (!batchRow) {
      throw new Error(
        "Can't reconcile inventory: no linked production batch record found for this submission " +
        "(it was likely approved before this feature shipped). Reject this edit, or manually adjust " +
        "stock/production_batches instead of editing this approved submission's batch quantity."
      )
    }

    const oldUsed = sub.data.ingredients_used || []
    const newUsed = newData.ingredients_used || []

    // Net delta per ingredient (new - old), in each ingredient's base/stock unit.
    const deltaByIng = new Map()
    function addDelta(ingredient_id, qty, unit, sign) {
      const ing = ingredients.find(i => i.id === ingredient_id)
      if (!ing) return
      const base = toBaseUnit(ing, qty || 0, unit) * sign
      const cur = deltaByIng.get(ingredient_id) || { deltaBase: 0, ing }
      cur.deltaBase += base
      deltaByIng.set(ingredient_id, cur)
    }
    for (const u of oldUsed) addDelta(u.ingredient_id, u.qty, u.unit, -1)
    for (const u of newUsed) addDelta(u.ingredient_id, u.qty, u.unit, +1)

    for (const [ingredient_id, { deltaBase, ing }] of deltaByIng) {
      if (!deltaBase) continue
      const { data:fresh } = await supabase.from("ingredients").select("stock").eq("id", ingredient_id).maybeSingle()
      const newStock = Math.max(0, (fresh?.stock ?? ing.stock ?? 0) - deltaBase)
      const { error:updErr } = await supabase.from("ingredients").update({ stock:newStock }).eq("id", ingredient_id)
      if (updErr) throw updErr
      const { error:movErr } = await supabase.from("stock_movements").insert({
        id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
        type:"Production Adjustment", ingredient_id, ingredient_name:ing.name,
        qty:-deltaBase, unit:ing.unit, ref:sub.id,
        note:"Production edit adjustment: "+(newData.item_name||sub.data.item_name)+" by "+sub.submitted_by,
        date:new Date().toISOString().slice(0,10),
        time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
      })
      if (movErr) throw movErr
    }

    // Adjust the output ingredient's stock by the yield delta.
    const outputIngredientId = sub.data.item_id || subRecipes.find(sr=>sr.id===sub.data.sub_recipe_id)?.ingredient_id
    const item = outputIngredientId ? ingredients.find(i=>i.id===outputIngredientId) : null
    const oldYield = sub.data.actual_yield ?? sub.data.batch_qty ?? 0
    const newYield = newData.actual_yield ?? newData.batch_qty ?? 0
    if (item) {
      // Convert each side to base unit before diffing — the yield unit could have changed between edits.
      const oldYieldBase = toBaseUnit(item, oldYield, sub.data.yield_unit || sub.data.unit || item.unit)
      const newYieldBase = toBaseUnit(item, newYield, newData.yield_unit || newData.unit || item.unit)
      const yieldDeltaBase = newYieldBase - oldYieldBase
      if (yieldDeltaBase) {
        const { data:freshItem } = await supabase.from("ingredients").select("stock").eq("id", item.id).maybeSingle()
        await supabase.from("ingredients").update({ stock: Math.max(0, (freshItem?.stock ?? item.stock ?? 0) + yieldDeltaBase) }).eq("id", item.id)
      }
    }

    // Update the linked production_batches row to match the new (post-edit) values.
    const { error:prodUpdErr } = await supabase.from("production_batches").update({
      batch_qty: newYield,
      unit: newData.yield_unit || newData.unit || batchRow.unit,
      ingredients_used: newUsed,
      notes: newData.notes ?? batchRow.notes,
      date: newData.date || batchRow.date,
    }).eq("id", batchRow.id)
    if (prodUpdErr) throw prodUpdErr
  }

  async function approve(sub) {
    if (!(await askConfirm("Approve and apply this " + sub.type + " report?"))) return
    setProcessing(true)
    try {
      await approveOne(sub)
      await load(); setViewModal(null)
    } catch(e) { alert("Error: "+e.message) }
    setProcessing(false)
  }

  async function reject(sub) {
    if (!(await askConfirm("Reject this submission?"))) return
    const { error } = await supabase.from("staff_submissions").update({ status:"rejected", reviewed_at:new Date().toISOString() }).eq("id",sub.id)
    if (error) { alert("Error: "+error.message); return }
    await load(); setViewModal(null)
  }

  async function deleteSubmission(sub) {
    const warning = sub.status==="approved"
      ? "This submission was already approved — deleting it only removes this record, it will NOT undo any stock/ingredient changes it already applied. Delete anyway?"
      : "Delete this submission? This cannot be undone."
    if (!(await askConfirm(warning))) return
    await supabase.from("staff_submissions").delete().eq("id",sub.id)
    setSubmissions(prev => prev.filter(s => s.id !== sub.id))
    setViewModal(null)
  }

  // Opens the review modal and, for opname submissions, fetches each involved
  // ingredient's CURRENT stock — the submission's own `system_qty` is a snapshot from
  // whenever the count was taken, which can be stale by the time a manager reviews/
  // approves it. Showing the live value lets them see what stock will actually become
  // instead of being surprised after clicking Approve.
  async function openViewModal(sub) {
    setViewModal(sub)
    if (sub.type === "opname") {
      const ids = (sub.data.items||[]).map(i=>i.ingredient_id).filter(Boolean)
      if (ids.length) {
        const { data } = await supabase.from("ingredients").select("id,stock").in("id", ids)
        const map = {}
        for (const row of data||[]) map[row.id] = row.stock
        setLiveStock(map)
      }
    }
  }

  function toggleSelect(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  async function bulkDelete() {
    const ids = [...selected]
    if (ids.length === 0) return
    const anyApproved = submissions.some(s => ids.includes(s.id) && s.status==="approved")
    const warning = "Delete "+ids.length+" selected submission"+(ids.length>1?"s":"")+"? This cannot be undone."
      + (anyApproved ? " Some are already approved — deleting them only removes the record, it will NOT undo any stock/ingredient changes already applied." : "")
    if (!(await askConfirm(warning))) return
    await supabase.from("staff_submissions").delete().in("id", ids)
    setSubmissions(prev => prev.filter(s => !ids.includes(s.id)))
    setSelected(new Set())
  }

  async function bulkApprove() {
    const ids = [...selected]
    const targets = submissions.filter(s => ids.includes(s.id) && s.status==="pending")
    if (targets.length === 0) { alert("No approvable submissions selected (only pending items can be approved)."); return }
    const warning = "Approve and apply "+targets.length+" selected submission"+(targets.length>1?"s":"")+"?"
    if (!(await askConfirm(warning))) return
    setProcessing(true)
    const failures = []
    for (const sub of targets) {
      try { await approveOne(sub) } catch(e) { failures.push(sub.id+": "+e.message) }
    }
    await load()
    setSelected(new Set())
    setProcessing(false)
    if (failures.length) alert("Approved "+(targets.length-failures.length)+" of "+targets.length+". Failed:\n"+failures.join("\n"))
  }

  function toggleReqItem(i) {
    setReqSelected(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next })
  }

  async function updateReqItemSupplier(sub, i, supplierName) {
    const items = (sub.data.items||[]).map((it,idx)=> idx===i ? {...it, supplier:supplierName} : it)
    const newData = {...sub.data, items}
    setViewModal(v => v ? {...v, data:newData} : v)
    setSubmissions(prev => prev.map(s => s.id===sub.id ? {...s, data:newData} : s))
    await supabase.from("staff_submissions").update({ data:newData }).eq("id", sub.id)
  }

  function sendSupplierGroupWA(sub, supplierName, items) {
    const date = new Date(sub.submitted_at).toLocaleDateString("id-ID")
    let text = "*PERMINTAAN BAHAN - PawonLoka*\n"
    text += "Tanggal: " + date + "\n"
    text += "Station: " + (sub.data?.station || "-") + "\n"
    text += "Dibutuhkan: " + (sub.data?.needed_by || "Hari ini") + "\n\n"
    text += "*" + supplierName + "*\n"
    items.forEach(i => { text += "- " + i.ingredient_name + " " + i.qty + " " + i.unit + "\n" })
    if (sub.data?.notes) text += "\nCatatan: " + sub.data.notes + "\n"
    const supplierRecord = suppliers.find(s=>s.name===supplierName)
    const phone = supplierRecord?.phone ? supplierRecord.phone.replace(/[^0-9]/g,"") : ""
    const url = phone ? "https://wa.me/"+phone+"?text="+encodeURIComponent(text) : "https://wa.me/?text="+encodeURIComponent(text)
    window.open(url, "_blank")
  }

    const staffUrl = window.location.origin + "/staff"

  return (
    <div>
      {/* Notification banner */}
      {newCount > 0 && (
        <div style={{ padding:"12px 16px", background:"var(--amber-lt)", border:"1.5px solid var(--amber)", borderRadius:"var(--r)", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontWeight:700, color:"var(--amber)", fontSize:13 }}>
            {newCount} new report{newCount>1?"s":""} received
          </div>
          <button onClick={load} className="bo-btn bo-btn-sm" style={{ background:"var(--amber)", color:"#fff", border:"none" }}>Refresh</button>
        </div>
      )}

      {/* Staff link */}
      <div style={{ marginBottom:16, padding:"12px 16px", background:"var(--brand-lt)", borderRadius:"var(--r)", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:"var(--brand)" }}>Staff Mobile Link</div>
          <div style={{ fontSize:12, color:"var(--ink4)", marginTop:2 }}>Share this link with your staff</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <code style={{ fontSize:12, background:"#fff", padding:"5px 10px", borderRadius:8, border:"1px solid var(--surface3)" }}>{staffUrl}</code>
          <button onClick={()=>navigator.clipboard.writeText(staffUrl)} className="bo-btn bo-btn-ghost bo-btn-sm">Copy</button>
          <a href="/staff" target="_blank" className="bo-btn bo-btn-primary bo-btn-sm" style={{ textDecoration:"none" }}>Open</a>
        </div>
      </div>

      {/* Orphaned-approval warning — approved submissions with no matching stock_movements */}
      {[...orphanApprovedIds].some(id => !dismissedOrphanIds.has(id)) && (
        <div style={{ padding:"12px 16px", background:"var(--red-lt)", border:"1.5px solid var(--red)", borderRadius:"var(--r)", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
          <div>
            <div style={{ fontWeight:700, color:"var(--red)", fontSize:13 }}>
              ⚠ {[...orphanApprovedIds].filter(id => !dismissedOrphanIds.has(id)).length} approved submission(s) may never have been applied to stock
            </div>
            <div style={{ fontSize:12, color:"var(--ink4)", marginTop:2 }}>
              These are marked "approved" but have no matching stock_movements record of the expected type — their counted/produced quantities likely never reached live inventory. Filter to "Approved" and look for the ⚠ badge to review each one.
            </div>
          </div>
          <button onClick={dismissAllOrphans} className="bo-btn bo-btn-sm bo-btn-ghost" style={{ flexShrink:0, whiteSpace:"nowrap" }}>Acknowledge All</button>
        </div>
      )}

      {/* Stats */}
      <div className="bo-metrics" style={{ gridTemplateColumns:"repeat(3,1fr)", marginBottom:16 }}>
        <div className="bo-met amber">
          <div className="bo-met-label">Pending</div>
          <div className="bo-met-val" style={{ display:"flex", alignItems:"center", gap:8 }}>
            {pending.length}
            {pending.length > 0 && <span style={{ fontSize:11, background:"var(--amber)", color:"#fff", borderRadius:20, padding:"1px 8px", fontWeight:700 }}>NEW</span>}
          </div>
        </div>
        <div className="bo-met green"><div className="bo-met-label">Approved</div><div className="bo-met-val">{approved.length}</div></div>
        <div className="bo-met red"><div className="bo-met-label">Rejected</div><div className="bo-met-val">{rejected.length}</div></div>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", gap:4 }}>
          {[["all","All Types"],["opname","Stock Count"],["waste","Waste"],["consumption","Staff Meal"],["production","Production"],["requisition","Request"]].map(([f,l])=>(
            <button key={f} onClick={()=>setTypeFilter(f)}
              className={"bo-btn bo-btn-sm "+(typeFilter===f?"bo-btn-primary":"bo-btn-ghost")}
              style={{ fontSize:11 }}>{TYPE_ICONS[f]||""} {l}</button>
          ))}
        </div>
        <div style={{ display:"flex", gap:4, marginLeft:"auto" }}>
          {[["pending","Pending"],["approved","Approved"],["rejected","Rejected"],["all","All"]].map(([f,l])=>(
            <button key={f} onClick={()=>setStatusFilter(f)}
              className={"bo-btn bo-btn-sm "+(statusFilter===f?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
          ))}
        </div>
      </div>

      {/* Bulk selection bar */}
      {selected.size > 0 && (
        <div style={{ padding:"10px 16px", background:"var(--brand-lt)", border:"1.5px solid var(--brand)", borderRadius:"var(--r)", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontWeight:700, color:"var(--brand)", fontSize:13 }}>{selected.size} selected</div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={bulkApprove} disabled={processing} className="bo-btn bo-btn-sm" style={{ background:"var(--green-lt)", color:"var(--green)", border:"none" }}>Approve Selected</button>
            <button onClick={bulkDelete} className="bo-btn bo-btn-sm bo-btn-danger">Delete Selected</button>
            <button onClick={()=>setSelected(new Set())} className="bo-btn bo-btn-ghost bo-btn-sm">Clear</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bo-card" style={{ padding:0, overflowX:"auto" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : loadError ? (
          <div style={{ padding:40, textAlign:"center" }}>
            <div style={{ color:"var(--red)", fontWeight:700, marginBottom:6 }}>Failed to load staff reports</div>
            <div style={{ color:"var(--ink5)", fontSize:13, marginBottom:14 }}>{loadError}</div>
            <button onClick={load} className="bo-btn bo-btn-primary bo-btn-sm">Retry</button>
          </div>
        ) : (
          <table className="bo-table">
            <thead><tr>
              <th><input type="checkbox" checked={filtered.length>0 && selected.size===filtered.length} onChange={()=>setSelected(selected.size===filtered.length ? new Set() : new Set(filtered.map(s=>s.id)))} /></th>
              <th>Type</th><th>Staff</th><th>Station</th><th>Date</th><th>Summary</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(s => {
                const c = TYPE_COLORS[s.type]||"var(--ink5)"
                const reqTotal = (s.data.items||[]).reduce((a,item)=>a+(item.qty*unitPriceFor(ingredients.find(x=>x.id===item.ingredient_id),item.unit)),0)
                const opnameVariance = (s.data.items||[]).reduce((a,item)=>a+(item.diff*(ingredients.find(x=>x.id===item.ingredient_id)?.cost_per_unit||0)),0)
                const summary = s.type==="opname" ? (s.data.items||[]).length+" items counted — "+fmt(opnameVariance)+" variance"
                  : s.type==="waste" ? s.data.qty+" "+s.data.unit+" — "+s.data.ingredient_name
                  : s.type==="consumption" ? s.data.qty+" "+s.data.unit+" — "+s.data.ingredient_name
                  : s.type==="requisition" ? (s.data.items||[]).length+" items requested — "+fmt(reqTotal)+" total"
                  : (s.data.batch_qty ? s.data.batch_qty+"× resep · " : "")+(s.data.actual_yield??s.data.batch_qty)+" "+(s.data.yield_unit||s.data.unit||"")+" "+s.data.item_name
                return (
                  <tr key={s.id} style={{ background: (isOrphanApproved(s) && !dismissedOrphanIds.has(s.id)) ? "var(--red-lt)"
                    : s.status==="pending"?"#fffbeb":s.status==="approved"?"var(--green-lt)":s.status==="rejected"?"var(--red-lt)":"" }}>
                    <td><input type="checkbox" checked={selected.has(s.id)} onChange={()=>toggleSelect(s.id)} /></td>
                    <td><span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10, background:c+"22", color:c }}>{TYPE_ICONS[s.type]} {TYPE_LABELS[s.type]||s.type}</span></td>
                    <td style={{ fontWeight:600 }}>{s.submitted_by||"—"}</td>
                    <td style={{ fontSize:12, color:"var(--ink4)" }}>{s.data?.station||"—"}</td>
                    <td style={{ fontSize:12 }}>{new Date(s.submitted_at).toLocaleString("id-ID")}</td>
                    <td style={{ fontSize:12, color:"var(--ink4)" }}>{summary}</td>
                    <td>
                      <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"flex-start" }}>
                        <span className={"bo-badge "+(s.status==="pending"?"bo-badge-amber":s.status==="approved"?"bo-badge-green":"bo-badge-red")}>{s.status}</span>
                        {isOrphanApproved(s) && (
                          dismissedOrphanIds.has(s.id)
                            ? <span className="bo-badge" style={{ background:"var(--surface)", color:"var(--ink5)" }} title="Flagged as approved-but-not-applied; acknowledged.">✓ Ack'd</span>
                            : <span className="bo-badge" style={{ background:"var(--red-lt)", color:"var(--red)" }} title={"No '"+EXPECTED_MOVEMENT_TYPE[s.type]+"' stock_movements row found for this submission — its data likely never reached live stock."}>⚠ Not applied</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={()=>openViewModal(s)} className="bo-btn bo-btn-ghost bo-btn-sm">View</button>
                        <button onClick={()=>openEdit(s)} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ color:"var(--brand)" }}>Edit</button>
                        {s.status==="pending" && <>
                          <button onClick={()=>approve(s)} disabled={processing} className="bo-btn bo-btn-sm" style={{ background:"var(--green-lt)", color:"var(--green)", border:"none", cursor:"pointer", borderRadius:"var(--r)", padding:"5px 11px", fontSize:12, fontWeight:600 }}>Approve</button>
                          <button onClick={()=>reject(s)} disabled={processing} className="bo-btn bo-btn-danger bo-btn-sm">Reject</button>
                        </>}
                        {isOrphanApproved(s) && !dismissedOrphanIds.has(s.id) && (
                          <button onClick={()=>retryOrphan(s)} disabled={processing} className="bo-btn bo-btn-sm" style={{ background:"var(--red-lt)", color:"var(--red)", border:"none" }} title="Re-apply this submission's stock effect using current live stock as the baseline">Retry</button>
                        )}
                        <button onClick={()=>deleteSubmission(s)} className="bo-btn bo-btn-ghost bo-btn-sm" style={{ color:"var(--red)" }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length===0 && <tr><td colSpan={8} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No submissions found</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* View Modal */}
      {viewModal && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setViewModal(null)}>
          <div className="bo-modal" style={{ maxWidth:viewModal.type==="opname"?720:560, maxHeight:"90vh" }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">{TYPE_ICONS[viewModal.type]} {TYPE_LABELS[viewModal.type]} Report</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>By {viewModal.submitted_by} · Station: {viewModal.data?.station||"—"} · {new Date(viewModal.submitted_at).toLocaleString("id-ID")}</div>
              </div>
              <button className="bo-modal-close" onClick={()=>setViewModal(null)}>x</button>
            </div>
            {isOrphanApproved(viewModal) && (
              <div style={{ margin:"0 20px 12px", padding:"10px 14px", background:"var(--red-lt)", border:"1.5px solid var(--red)", borderRadius:"var(--r)" }}>
                <div style={{ fontWeight:700, color:"var(--red)", fontSize:13 }}>⚠ Approved but not applied to stock</div>
                <div style={{ fontSize:12, color:"var(--ink4)", marginTop:4 }}>
                  No "{EXPECTED_MOVEMENT_TYPE[viewModal.type]}" stock_movements record references this submission. It was likely marked approved
                  without going through the normal apply-to-stock flow (e.g. a manual database edit). Retry re-applies it using current live
                  stock as the baseline (same delayed-approval-safe math as a normal approval) — for opname, any ingredient that already got a
                  separate Adjustment since this was submitted is skipped automatically rather than risking a double-count.
                </div>
                {!dismissedOrphanIds.has(viewModal.id) && (
                  <div style={{ display:"flex", gap:8, marginTop:8 }}>
                    <button onClick={()=>retryOrphan(viewModal)} disabled={processing} className="bo-btn bo-btn-sm" style={{ background:"var(--red-lt)", color:"var(--red)", border:"none" }}>Retry</button>
                    <button onClick={()=>dismissOrphan(viewModal.id)} className="bo-btn bo-btn-sm bo-btn-ghost">Acknowledge (skip, don't retry)</button>
                  </div>
                )}
              </div>
            )}
            <div className="bo-modal-body" style={{ overflowY:"auto" }}>
              {viewModal.type==="opname" && (() => {
                const totalValue = (viewModal.data.items||[]).reduce((a,item)=>a+(item.actual_qty*(ingredients.find(x=>x.id===item.ingredient_id)?.cost_per_unit||0)),0)
                const totalVariance = (viewModal.data.items||[]).reduce((a,item)=>a+(item.diff*(ingredients.find(x=>x.id===item.ingredient_id)?.cost_per_unit||0)),0)
                return (
                <div style={{ overflowX:"auto" }}>
                <div style={{ fontSize:12, color:"var(--ink4)", marginBottom:10 }}>Count Date: <strong>{viewModal.data.date||"—"}</strong></div>
                {viewModal.status==="pending" && (
                  <div style={{ fontSize:11, color:"var(--ink5)", fontStyle:"italic", marginBottom:10 }}>
                    ℹ️ "System" is the stock level when this count was taken. If sales/production happened
                    since then, "Live Now" shows current stock and "Will Become" shows what approving will
                    actually set it to (live + counted diff) — not the counted "Actual" number directly.
                  </div>
                )}
                <table className="bo-table">
                  <thead><tr><th>Ingredient</th><th>System</th><th>Actual</th><th>Diff</th><th>Live Now</th><th>Will Become</th><th>Unit Price</th><th>Value</th><th>Variance</th></tr></thead>
                  <tbody>
                    {(viewModal.data.items||[]).map((item,i)=>{
                      const foundIng = ingredients.find(x=>x.id===item.ingredient_id)
                      const unitPrice = foundIng?.cost_per_unit||0
                      const value = item.actual_qty*unitPrice
                      const variance = item.diff*unitPrice
                      const live = liveStock[item.ingredient_id]
                      const willBecome = live!=null ? Math.max(0, live + item.diff) : null
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight:600 }}>{item.name}</td>
                          <td>{item.system_qty} {item.unit}</td>
                          <td style={{ fontWeight:700 }}>{item.actual_qty} {item.unit}</td>
                          <td style={{ color:item.diff<0?"var(--red)":item.diff>0?"var(--green)":"var(--ink5)", fontWeight:700 }}>{item.diff>0?"+":""}{Number(item.diff).toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                          <td style={{ color:live!=null&&live!==item.system_qty?"var(--amber)":"var(--ink5)" }}>{live!=null?live+" "+item.unit:"—"}</td>
                          <td style={{ fontWeight:700 }}>{willBecome!=null?willBecome+" "+item.unit:"—"}</td>
                          {foundIng ? <>
                            <td>{fmt(unitPrice)}</td>
                            <td>{fmt(value)}</td>
                            <td style={{ color:variance<0?"var(--red)":variance>0?"var(--green)":"var(--ink5)", fontWeight:700 }}>{variance>0?"+":""}{fmt(variance)}</td>
                          </> : <td colSpan={3} style={{ color:"var(--ink5)", fontStyle:"italic" }}>Ingredient deleted (no pricing)</td>}
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={7} style={{ textAlign:"right", fontWeight:700 }}>Total</td>
                      <td style={{ fontWeight:800 }}>{fmt(totalValue)}</td>
                      <td style={{ fontWeight:800, color:totalVariance<0?"var(--red)":totalVariance>0?"var(--green)":"var(--ink5)" }}>{totalVariance>0?"+":""}{fmt(totalVariance)}</td>
                    </tr>
                  </tfoot>
                </table>
                </div>
                )
              })()}
              {viewModal.type==="waste" && (
                <div style={{ display:"grid", gap:14 }}>
                  {[["Date",viewModal.data.date||"—"],["Ingredient",viewModal.data.ingredient_name],["Quantity",viewModal.data.qty+" "+viewModal.data.unit],["Reason",viewModal.data.reason],["Est. Cost",fmt(viewModal.data.estimated_cost)],["Notes",viewModal.data.notes||"—"]].map(([k,v])=>(
                    <div key={k}><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase" }}>{k}</div><div style={{ fontWeight:600, marginTop:3 }}>{v}</div></div>
                  ))}
                </div>
              )}
              {viewModal.type==="consumption" && (
                <div style={{ display:"grid", gap:14 }}>
                  {[["Date",viewModal.data.date||"—"],["Ingredient",viewModal.data.ingredient_name],["Quantity",viewModal.data.qty+" "+viewModal.data.unit],["Est. Cost",fmt(viewModal.data.estimated_cost)],["Notes",viewModal.data.notes||"—"]].map(([k,v])=>(
                    <div key={k}><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase" }}>{k}</div><div style={{ fontWeight:600, marginTop:3 }}>{v}</div></div>
                  ))}
                </div>
              )}
              {viewModal.type==="requisition" && (() => {
                const items = viewModal.data.items || []
                const bySupplier = {}
                items.forEach((item,i) => {
                  const sup = item.supplier || "Belum ada supplier"
                  if (!bySupplier[sup]) bySupplier[sup] = []
                  bySupplier[sup].push(i)
                })
                const totalAll = items.reduce((a,item)=>a+(item.qty*unitPriceFor(ingredients.find(x=>x.id===item.ingredient_id),item.unit)),0)
                return (
                <div>
                  <div style={{ marginBottom:12, fontSize:12, color:"var(--ink4)" }}>Needed by: <strong>{viewModal.data.needed_by||"—"}</strong> · Notes: {viewModal.data.notes||"—"}</div>
                  <div style={{ overflowX:"auto" }}>
                  <table className="bo-table">
                    <thead><tr><th></th><th>Ingredient</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th><th>Supplier</th></tr></thead>
                    <tbody>
                      {items.map((item,i)=>{
                        const foundIng = ingredients.find(x=>x.id===item.ingredient_id)
                        const unitPrice = unitPriceFor(foundIng, item.unit)
                        return (
                          <tr key={i}>
                            <td><input type="checkbox" checked={reqSelected.has(i)} onChange={()=>toggleReqItem(i)} /></td>
                            <td style={{ fontWeight:600 }}>{item.ingredient_name}</td>
                            <td style={{ fontWeight:700, color:"#6554C0" }}>{item.qty}</td>
                            <td>{item.unit}</td>
                            {foundIng ? <>
                              <td>{fmt(unitPrice)}</td>
                              <td style={{ fontWeight:600 }}>{fmt(item.qty*unitPrice)}</td>
                            </> : <td colSpan={2} style={{ color:"var(--red)", fontWeight:600 }}>⚠ unknown ingredient</td>}
                            <td>
                              <select value={item.supplier||""} onChange={e=>updateReqItemSupplier(viewModal, i, e.target.value)} className="bo-select" style={{ fontSize:11, padding:"4px 6px" }}>
                                <option value="">— none —</option>
                                {suppliers.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5} style={{ textAlign:"right", fontWeight:700 }}>Total</td>
                        <td style={{ fontWeight:800, color:"#6554C0" }}>{fmt(totalAll)}</td>
                        <td/>
                      </tr>
                    </tfoot>
                  </table>
                  </div>

                  <div style={{ marginTop:16, borderTop:"1px solid var(--surface3)", paddingTop:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--ink4)", textTransform:"uppercase", marginBottom:8 }}>Send to Supplier</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {Object.entries(bySupplier).map(([sup, idxs])=>{
                        const allSelected = idxs.every(i=>reqSelected.has(i))
                        const selectedIdxs = idxs.filter(i=>reqSelected.has(i))
                        return (
                          <div key={sup} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:"var(--surface)", borderRadius:"var(--r)", gap:8, flexWrap:"wrap" }}>
                            <button onClick={()=>setReqSelected(prev=>{ const next=new Set(prev); idxs.forEach(i=> allSelected? next.delete(i) : next.add(i)); return next })}
                              style={{ background:"none", border:"none", padding:0, cursor:"pointer", fontSize:12, fontWeight:700, color:"var(--ink)", textAlign:"left" }}>
                              {allSelected?"☑":"☐"} {sup} ({idxs.length} item{idxs.length>1?"s":""})
                            </button>
                            <button disabled={selectedIdxs.length===0} onClick={()=>sendSupplierGroupWA(viewModal, sup, selectedIdxs.map(i=>items[i]))}
                              style={{background: selectedIdxs.length===0?"#94A3B8":"#25D366",color:"#fff",border:"none",borderRadius:"var(--r)",padding:"6px 12px",fontSize:12,fontWeight:600,cursor:selectedIdxs.length===0?"not-allowed":"pointer",fontFamily:"inherit"}}>
                              💬 Kirim{selectedIdxs.length>0 && selectedIdxs.length!==idxs.length?" ("+selectedIdxs.length+")":""}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
                )
              })()}
              {viewModal.type==="production" && (() => {
                const used = viewModal.data.ingredients_used||[]
                const prodTotal = used.reduce((a,u)=>a+(u.qty*unitPriceFor(ingredients.find(x=>x.id===u.ingredient_id),u.unit)),0)
                return (
                <div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:16 }}>
                    <div><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase" }}>Date</div><div style={{ fontWeight:700, marginTop:3 }}>{viewModal.data.date||"—"}</div></div>
                    <div><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase" }}>Produced</div><div style={{ fontWeight:700, color:"var(--green)", marginTop:3 }}>{viewModal.data.item_name}</div></div>
                    <div><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase" }}>Batches</div><div style={{ fontWeight:700, marginTop:3 }}>{viewModal.data.batch_qty ?? "—"}× resep</div></div>
                    <div><div style={{ fontSize:11, color:"var(--ink4)", fontWeight:700, textTransform:"uppercase" }}>Quantity</div><div style={{ fontWeight:700, marginTop:3 }}>{viewModal.data.actual_yield??viewModal.data.batch_qty} {viewModal.data.yield_unit||viewModal.data.unit}</div></div>
                  </div>
                  <table className="bo-table">
                    <thead><tr><th>Ingredient</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Cost</th></tr></thead>
                    <tbody>
                      {used.map((u,i) => {
                        const ing = ingredients.find(x=>x.id===u.ingredient_id)
                        const unitPrice = unitPriceFor(ing,u.unit)
                        return (
                          <tr key={i}>
                            <td>{u.name}</td><td>{Math.round((u.qty||0)*100)/100}</td><td>{u.unit}</td>
                            {ing ? <><td>{fmt(unitPrice)}</td><td>{fmt(u.qty*unitPrice)}</td></>
                              : <td colSpan={2} style={{ color:"var(--ink5)", fontStyle:"italic" }}>Ingredient deleted (no pricing)</td>}
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:"var(--surface)", fontWeight:800 }}>
                        <td colSpan={4} style={{ textAlign:"right" }}>Total Cost</td>
                        <td>{fmt(prodTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {viewModal.data.notes && <div style={{ marginTop:12, fontSize:12, color:"var(--ink4)" }}>Notes: {viewModal.data.notes}</div>}
                </div>
                )
              })()}
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setViewModal(null)} className="bo-btn bo-btn-ghost">Close</button>
              <button onClick={()=>deleteSubmission(viewModal)} className="bo-btn bo-btn-ghost" style={{ color:"var(--red)" }}>Delete</button>
              <button onClick={()=>openEdit(viewModal)} className="bo-btn bo-btn-ghost" style={{ color:"var(--brand)" }}>Edit</button>
              {viewModal.status==="pending" && <>
                <button onClick={()=>reject(viewModal)} disabled={processing} className="bo-btn bo-btn-danger">Reject</button>
                <button onClick={()=>approve(viewModal)} disabled={processing} className="bo-btn bo-btn-primary">Approve & Apply</button>
              </>}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && editData && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&setEditModal(null)}>
          <div className="bo-modal" style={{ maxWidth:580, maxHeight:"90vh" }}>
            <div className="bo-modal-header">
              <div>
                <div className="bo-modal-title">Edit — {TYPE_ICONS[editModal.type]} {TYPE_LABELS[editModal.type]}</div>
                <div style={{ fontSize:11, color:"var(--ink5)" }}>By {editModal.submitted_by} · {new Date(editModal.submitted_at).toLocaleString("id-ID")}</div>
              </div>
              <button className="bo-modal-close" onClick={()=>setEditModal(null)}>x</button>
            </div>
            <div className="bo-modal-body" style={{ overflowY:"auto" }}>
              {/* Notes field for all types */}
              <div className="bo-form-row">
                <label className="bo-label">Notes</label>
                <input value={editData.notes||""} onChange={e=>setEditData(d=>({...d,notes:e.target.value}))} className="bo-input" placeholder="Add notes..." />
              </div>

              {editModal.type==="opname" && (() => {
                const totalValue = (editData.items||[]).reduce((a,item)=>a+((parseFloat(item.actual_qty)||0)*(ingredients.find(x=>x.id===item.ingredient_id)?.cost_per_unit||0)),0)
                const totalVariance = (editData.items||[]).reduce((a,item)=>a+(((parseFloat(item.actual_qty)||0)-item.system_qty)*(ingredients.find(x=>x.id===item.ingredient_id)?.cost_per_unit||0)),0)
                return (
                <div>
                  <div style={{ marginBottom:12 }}>
                    <label className="bo-label">Count Date</label>
                    <input type="date" value={editData.date||""} onChange={e=>setEditData(d=>({...d,date:e.target.value}))} className="bo-input" />
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <label className="bo-label" style={{marginBottom:0}}>Stock Counts</label>
                    <button onClick={()=>setEditData(d=>({...d,items:[...(d.items||[]),{ingredient_id:"",name:"",unit:"",system_qty:0,actual_qty:0,diff:0}]}))}
                      className="bo-btn bo-btn-ghost bo-btn-sm">+ Add Item</button>
                  </div>
                  {(editData.items||[]).map((item,i)=>{
                    const foundIng = ingredients.find(x=>x.id===item.ingredient_id)
                    const unitPrice = foundIng?.cost_per_unit||0
                    const diff = (parseFloat(item.actual_qty)||0)-item.system_qty
                    const variance = diff*unitPrice
                    const unknown = item.ingredient_id && !foundIng
                    return (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 100px 60px 90px 28px", gap:8, marginBottom:8, alignItems:"center" }}>
                      {item.ingredient_id
                        ? <div style={{ fontSize:13, fontWeight:600 }}>{item.name}</div>
                        : <IngSearchEdit ingredients={ingredients} onSelect={ing=>{
                            setEditData(d=>({ ...d, items:d.items.map((x,idx)=>idx===i?{...x,ingredient_id:ing.id,name:ing.name,unit:ing.unit||"",system_qty:ing.stock||0,diff:(x.actual_qty||0)-(ing.stock||0)}:x) }))
                          }} />
                      }
                      <input type="number" value={item.actual_qty} onChange={e=>{
                        const val = e.target.value
                        setEditData(d=>({ ...d, items:d.items.map((x,idx)=>idx===i?{...x,actual_qty:val,diff:(parseFloat(val)||0)-x.system_qty}:x) }))
                      }} className="bo-input" style={{ fontSize:13 }} />
                      <span style={{ fontSize:12, color:"var(--ink4)" }}>{item.unit}</span>
                      {unknown
                        ? <span style={{ fontSize:11, textAlign:"right", color:"var(--red)", fontWeight:600 }}>⚠ unknown</span>
                        : <span style={{ fontSize:12, textAlign:"right", color:variance<0?"var(--red)":variance>0?"var(--green)":"var(--ink4)" }}>{variance>0?"+":""}{fmt(variance)}</span>}
                      <button onClick={()=>setEditData(d=>({...d,items:d.items.filter((_,idx)=>idx!==i)}))}
                        style={{background:"none",border:"none",color:"var(--red)",fontSize:18,cursor:"pointer",padding:0}}>x</button>
                    </div>
                    )
                  })}
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, fontWeight:700, marginTop:4 }}>
                    <span>Value: {fmt(totalValue)}</span>
                    <span style={{ color:totalVariance<0?"var(--red)":totalVariance>0?"var(--green)":"var(--ink5)" }}>Variance: {totalVariance>0?"+":""}{fmt(totalVariance)}</span>
                  </div>
                </div>
                )
              })()}

              {editModal.type==="waste" && (
                <div style={{ display:"grid", gap:12 }}>
                  <div><label className="bo-label">Date</label>
                    <input type="date" value={editData.date||""} onChange={e=>setEditData(d=>({...d,date:e.target.value}))} className="bo-input" /></div>
                  <div><label className="bo-label">Quantity</label>
                    <input type="number" value={editData.qty||""} onChange={e=>setEditData(d=>({...d,qty:e.target.value}))} className="bo-input" /></div>
                  <div><label className="bo-label">Reason</label>
                    <select value={editData.reason||"Expired"} onChange={e=>setEditData(d=>({...d,reason:e.target.value}))} className="bo-select">
                      {["Expired","Damaged","Overproduction","Spillage","Other"].map(r=><option key={r}>{r}</option>)}
                    </select></div>
                </div>
              )}

              {editModal.type==="consumption" && (
                <div style={{ display:"grid", gap:12 }}>
                  <div><label className="bo-label">Date</label>
                    <input type="date" value={editData.date||""} onChange={e=>setEditData(d=>({...d,date:e.target.value}))} className="bo-input" /></div>
                  <div><label className="bo-label">Quantity</label>
                    <input type="number" value={editData.qty||""} onChange={e=>setEditData(d=>({...d,qty:e.target.value}))} className="bo-input" /></div>
                </div>
              )}

              {editModal.type==="requisition" && (
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <label className="bo-label" style={{marginBottom:0}}>Items Requested</label>
                    <button onClick={()=>setEditData(d=>({...d,items:[...(d.items||[]),{ingredient_id:"",ingredient_name:"",qty:0,unit:""}]}))}
                      className="bo-btn bo-btn-ghost bo-btn-sm">+ Add Item</button>
                  </div>
                  {(editData.items||[]).map((item,i)=>{
                    const foundIng = ingredients.find(x=>x.id===item.ingredient_id)
                    const unitPrice = unitPriceFor(foundIng, item.unit)
                    const unknown = item.ingredient_id && !foundIng
                    return (
                    <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 80px 60px 90px 28px",gap:8,marginBottom:8,alignItems:"center"}}>
                      {item.ingredient_id
                        ? <div style={{fontSize:13,fontWeight:600}}>{item.ingredient_name}</div>
                        : <IngSearchEdit ingredients={ingredients} onSelect={ing=>{
                            setEditData(d=>({...d,items:d.items.map((x,idx)=>idx===i?{...x,ingredient_id:ing.id,ingredient_name:ing.name,unit:ing.unit||""}:x)}))
                          }} />
                      }
                      <input type="number" value={item.qty} onChange={e=>{
                        setEditData(d=>({...d,items:d.items.map((x,idx)=>idx===i?{...x,qty:e.target.value}:x)}))
                      }} className="bo-input" style={{fontSize:13}} />
                      <span style={{fontSize:12,color:"var(--ink4)"}}>{item.unit}</span>
                      {unknown
                        ? <span style={{fontSize:11,color:"var(--red)",fontWeight:600,textAlign:"right"}}>⚠ unknown</span>
                        : <span style={{fontSize:12,color:"var(--ink4)",textAlign:"right"}}>{fmt((parseFloat(item.qty)||0)*unitPrice)}</span>}
                      <button onClick={()=>setEditData(d=>({...d,items:d.items.filter((_,idx)=>idx!==i)}))}
                        style={{background:"none",border:"none",color:"var(--red)",fontSize:18,cursor:"pointer",padding:0}}>x</button>
                    </div>
                    )
                  })}
                  <div style={{ textAlign:"right", fontSize:13, fontWeight:700, marginTop:4, color:"#6554C0" }}>
                    Total: {fmt((editData.items||[]).reduce((a,item)=>a+((parseFloat(item.qty)||0)*unitPriceFor(ingredients.find(x=>x.id===item.ingredient_id),item.unit)),0))}
                  </div>
                </div>
              )}

              {editModal.type==="production" && (() => {
                const linkedRecipe = subRecipes.find(sr=>sr.id===editData.sub_recipe_id)
                const recipeLines  = linkedRecipe ? subRecipeIngs.filter(l=>l.sub_recipe_id===linkedRecipe.id) : []
                return (
                <div style={{ display:"grid", gap:12 }}>
                  {editModal.status==="approved" && (
                    <div style={{ background:"#fff7ed", border:"1px solid #fb923c", borderRadius:"var(--r)", padding:"10px 12px", fontSize:12.5, color:"#9a3412", fontWeight:600 }}>
                      ⚠ This batch was already approved. Changing the batch quantity here will immediately adjust live ingredient stock and the linked production record — not just this submission's record.
                    </div>
                  )}
                  <div>
                    <label className="bo-label">Date</label>
                    <input type="date" value={editData.date||""} onChange={e=>setEditData(d=>({...d,date:e.target.value}))} className="bo-input" />
                  </div>
                  <div>
                    <label className="bo-label" style={{ fontSize:13, fontWeight:800, color:"var(--ink1)" }}>Batch Quantity (× resep)</label>
                    <input type="number" value={editData.batch_qty||""} onChange={e=>{
                      const batch_qty = e.target.value
                      const batches = parseFloat(batch_qty)||0
                      setEditData(d => ({
                        ...d, batch_qty,
                        // Keep actual_yield in sync — approve() uses actual_yield, not batch_qty, so
                        // editing batch quantity alone previously had no visible effect on anything.
                        actual_yield: linkedRecipe ? Math.round((linkedRecipe.yield_qty||1) * batches * 100)/100 : d.actual_yield,
                        // Rescale ingredients_used from the recipe's per-batch ratios too — this was
                        // the actual reported bug: only actual_yield was kept in sync, so "resep"
                        // (the ingredient list) stayed frozen at whatever batch_qty it was created with.
                        // Only rescale when we have recipe lines to rescale FROM, so ad-hoc entries
                        // with no linked recipe (or a recipe with no configured lines) aren't wiped.
                        ingredients_used: recipeLines.length
                          ? recipeLines.map(l => {
                              const ing = ingredients.find(i=>i.id===l.ingredient_id)
                              return { ingredient_id:l.ingredient_id, name:ing?.name||"", qty:Math.round(l.qty*batches*100)/100, unit:l.unit||ing?.unit||"" }
                            })
                          : d.ingredients_used,
                      }))
                    }} className="bo-input" />
                    {linkedRecipe && (
                      <div style={{ fontSize:12, color:"var(--ink4)", marginTop:4 }}>
                        → produces {editData.actual_yield ?? 0} {editData.yield_unit||linkedRecipe.yield_unit||""}
                      </div>
                    )}
                  </div>
                  <div style={{ borderTop:"1px solid var(--surface3)", paddingTop:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <label className="bo-label" style={{ marginBottom:0, fontSize:13, fontWeight:800, color:"var(--ink1)" }}>Ingredients Used</label>
                      <button onClick={()=>setEditData(d=>({ ...d, ingredients_used:[...(d.ingredients_used||[]), { ingredient_id:"", name:"", qty:0, unit:"gr" }] }))}
                        className="bo-btn bo-btn-ghost bo-btn-sm" style={{ fontSize:12 }}>+ Add Ingredient</button>
                    </div>
                    {(editData.ingredients_used||[]).map((u,i)=>(
                      <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 80px 60px 28px", gap:8, marginBottom:8, alignItems:"center" }}>
                        {u.ingredient_id ? (
                          <div style={{ fontSize:13, fontWeight:600, padding:"8px 4px" }}>{u.name}</div>
                        ) : (
                          <IngSearchEdit ingredients={ingredients} onSelect={ing=>{
                            setEditData(d=>({ ...d, ingredients_used:d.ingredients_used.map((x,idx)=>idx===i?{...x,ingredient_id:ing.id,name:ing.name,unit:ing.unit||"gr"}:x) }))
                          }} />
                        )}
                        <input type="number" value={u.qty} onChange={e=>{
                          setEditData(d=>({ ...d, ingredients_used:d.ingredients_used.map((x,idx)=>idx===i?{...x,qty:e.target.value}:x) }))
                        }} className="bo-input" style={{ fontSize:13 }} />
                        <span style={{ fontSize:12, color:"var(--ink4)" }}>{u.unit}</span>
                        <button onClick={()=>setEditData(d=>({ ...d, ingredients_used:d.ingredients_used.filter((_,idx)=>idx!==i) }))}
                          style={{ background:"none", border:"none", color:"var(--red)", fontSize:18, cursor:"pointer", padding:0 }}>x</button>
                      </div>
                    ))}
                  </div>
                </div>
                )
              })()}
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>setEditModal(null)} className="bo-btn bo-btn-ghost" disabled={processing}>Cancel</button>
              <button onClick={saveEdit} className="bo-btn bo-btn-primary" disabled={processing}>{processing ? "Saving..." : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom confirm modal — replaces window.confirm() so Chrome can't silently suppress it */}
      {confirmState && (
        <div className="bo-overlay" onMouseDown={e=>e.target===e.currentTarget&&resolveConfirm(false)}>
          <div className="bo-modal" style={{ maxWidth:420 }}>
            <div className="bo-modal-body" style={{ padding:"24px 24px 8px" }}>
              <div style={{ fontSize:14, fontWeight:600, whiteSpace:"pre-line", lineHeight:1.5 }}>{confirmState.message}</div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={()=>resolveConfirm(false)} className="bo-btn bo-btn-ghost">Cancel</button>
              <button onClick={()=>resolveConfirm(true)} className="bo-btn bo-btn-primary">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
