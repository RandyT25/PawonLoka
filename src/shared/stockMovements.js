import { supabase } from '../lib/supabase'
import { qr } from '../lib/quickRead'
import { toBaseUnit } from './unitConversion'

// Single source of truth for moving ingredient stock in/out for a recipe-based
// order — a sale deducts (sign -1), a void/refund gives it back (sign +1). Both
// callers used to carry their own copy of this loop; keeping one copy means a
// unit-conversion or frozen-item fix only has to happen once.
export async function applyRecipeStockMovement(items, { sign, type, ref, orderId, actor, reversalOf = {} }) {
  try {
    const skus = [...new Set((items || []).map(i => i.sku).filter(Boolean))]
    if (!skus.length) return
    // Frozen Food items (packaged retail items like "Ayam Taliwang Frozen") have their recipe
    // ingredients deducted at packing time instead (Staff Portal → Production Batch) — moving
    // stock again here would double-count in either direction.
    const allProds = await qr(supabase.from('products').select('sku,cat'), { cache:'products', ms:5000 })
    const frozenSkus = new Set((allProds||[]).filter(p => p.cat === 'Frozen Food').map(p => p.sku))
    const eligibleSkus = skus.filter(s => !frozenSkus.has(s))
    if (!eligibleSkus.length) return
    const allRecipes = await qr(supabase.from('recipes')
      .select('product_id, ingredient_id, qty, unit')
      .in('product_id', eligibleSkus), { ms:5000 })
    // Collect modifier group IDs touched by this order so we can look up their options.
    // Modifier ingredient data is stored inline in modifier_groups.options[].ingredient_id/qty
    // (set via the Backoffice → Modifiers UI). No separate join table is needed.
    const modifierIds = [...new Set((items || []).flatMap(i => Object.keys(i.modifiers || {})))]
    const { data: modifierGroups } = modifierIds.length
      ? await supabase.from('modifier_groups').select('id,options').in('id', modifierIds)
      : { data: [] }
    // Flatten modifier groups into a lookup: groupId → { [optionName]: { ingredient_id, qty } }
    const modOptMap = {}
    for (const mg of modifierGroups || []) {
      const opts = typeof mg.options === 'string' ? JSON.parse(mg.options || '[]') : (mg.options || [])
      modOptMap[mg.id] = {}
      for (const opt of opts) {
        if (opt.ingredient_id) modOptMap[mg.id][opt.name] = { ingredient_id: opt.ingredient_id, qty: parseFloat(opt.qty) || 1 }
      }
    }
    // Build flat modifier-lines list for stock deduction (same shape as recipe rows)
    const modifierLines = []
    for (const [groupId, optMap] of Object.entries(modOptMap)) {
      for (const [optName, data] of Object.entries(optMap)) {
        modifierLines.push({ modifier_group_id: groupId, option_name: optName, ingredient_id: data.ingredient_id, qty: data.qty })
      }
    }
    if (!allRecipes?.length && !modifierLines.length) return
    const ingIds = [...new Set([...(allRecipes || []).map(r => r.ingredient_id), ...modifierLines.map(r => r.ingredient_id)])]
    const ings = await qr(supabase.from('ingredients').select('id, stock, name, unit, conversions').in('id', ingIds), { ms:5000 })
    const ingMap = {}
    for (const ing of ings || []) ingMap[ing.id] = ing
    const deltas = {}
    for (const item of items) {
      const rows = (allRecipes || []).filter(r => r.product_id === item.sku)
      for (const ri of rows) {
        const ing = ingMap[ri.ingredient_id]
        if (!ing) continue
        const qtyBase = toBaseUnit(ing, ri.qty || 0, ri.unit) * (item.qty || 1)
        if (qtyBase) deltas[ri.ingredient_id] = (deltas[ri.ingredient_id] || 0) + qtyBase
      }
      // Deduct modifier ingredients — e.g. "Extra Cheese" adds 20g cheese to the movement
      for (const [groupId, chosenOption] of Object.entries(item.modifiers || {})) {
        const optData = modOptMap[groupId]?.[chosenOption]
        if (!optData) continue
        const ing = ingMap[optData.ingredient_id]
        if (!ing) continue
        const qtyBase = toBaseUnit(ing, optData.qty || 1, ing.unit) * (item.qty || 1)
        if (qtyBase) deltas[optData.ingredient_id] = (deltas[optData.ingredient_id] || 0) + qtyBase
      }
    }
    if (!Object.keys(deltas).length) return
    const movDate = new Date().toISOString().slice(0, 10)
    const movTime = new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })
    const ts = Date.now()
    const movements = Object.keys(deltas).map((id, idx) => {
      const ing = ingMap[id]
      const before = Number(ing?.stock || 0)
      const qty = sign * Math.abs(deltas[id] || 0)
      return {
        id: `MOV-${ts}-${idx}`,
        type,
        ingredient_id: id,
        ingredient_name: ing?.name,
        qty,
        unit: ing?.unit,
        ref: ref || `ORD-${ts}`,
        note: type === 'Sale' ? 'Auto dari penjualan' : 'Auto dari ' + type.toLowerCase(),
        date: movDate,
        time: movTime,
        // Additive migration fields.  They make a future reversal link to this precise
        // movement rather than reinterpreting a changed recipe.
        order_id: orderId || ref || null,
        order_item_key: null,
        recipe_line_key: `${id}:${idx}`,
        source_event: type.toLowerCase(),
        reversal_of: reversalOf[id] || null,
        actor: actor || null,
        stock_before: before,
        stock_after: Math.max(0, before + qty),
      }
    })
    await Promise.all([
      Promise.all(Object.keys(deltas).map(id => {
        const ing = ingMap[id]
        if (!ing) return null
        return supabase.from('ingredients').update({
          stock: Math.max(0, (ing.stock || 0) + sign * deltas[id])
        }).eq('id', id)
      })),
      // Keep deployment compatible while the additive migration rolls out.  The stock update
      // must not be lost merely because an old database lacks the new ledger columns.
      Promise.resolve(supabase.from('stock_movements').insert(movements)).then(({ error }) => {
        if (!error) return
        const legacy = movements.map(({ order_id, order_item_key, recipe_line_key, source_event, reversal_of, actor, stock_before, stock_after, ...row }) => row)
        return supabase.from('stock_movements').insert(legacy)
      }).catch(() => {}),
    ])
  } catch (e) { console.error('Stock movement error:', e) }
}

// Reverse immutable sale rows when they exist.  Legacy rows without order_id are deliberately
// not guessed: callers may use recipe fallback only for a full void and should surface that as
// a reviewable legacy exception.
export async function reverseOrderStockMovements(orderId, { actor } = {}) {
  const { data: rows, error } = await supabase.from('stock_movements')
    .select('*').eq('order_id', orderId).eq('type', 'Sale')
  if (error || !rows?.length) return { reversed: false, reason: error?.message || 'no-ledger-rows' }
  const { data: already } = await supabase.from('stock_movements').select('reversal_of').in('reversal_of', rows.map(r => r.id))
  const reversed = new Set((already || []).map(r => r.reversal_of))
  const pending = rows.filter(r => !reversed.has(r.id))
  if (!pending.length) return { reversed: true, rows: 0 }
  const { data: ingredients } = await supabase.from('ingredients').select('id,stock').in('id', pending.map(r => r.ingredient_id))
  const stock = Object.fromEntries((ingredients || []).map(i => [i.id, Number(i.stock || 0)]))
  const writes = pending.map((row, idx) => ({
    id: `MOV-${Date.now()}-REV-${idx}`, type: 'Void', ingredient_id: row.ingredient_id,
    ingredient_name: row.ingredient_name, qty: Math.abs(Number(row.qty || 0)), unit: row.unit,
    ref: orderId, note: 'Exact reversal of sale movement', date: new Date().toISOString().slice(0, 10),
    time: new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }),
    order_id: orderId, source_event: 'void', reversal_of: row.id, actor: actor || null,
    stock_before: stock[row.ingredient_id] || 0, stock_after: (stock[row.ingredient_id] || 0) + Math.abs(Number(row.qty || 0)),
  }))
  await Promise.all([
    ...Object.entries(writes.reduce((m, r) => ({ ...m, [r.ingredient_id]: (m[r.ingredient_id] || 0) + r.qty }), {})).map(([id, qty]) => supabase.from('ingredients').update({ stock:(stock[id] || 0) + qty }).eq('id', id)),
    supabase.from('stock_movements').insert(writes),
  ])
  return { reversed: true, rows: writes.length }
}
