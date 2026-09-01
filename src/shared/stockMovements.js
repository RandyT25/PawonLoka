import { supabase } from '../lib/supabase'
import { qr } from '../lib/quickRead'
import { toBaseUnit } from './unitConversion'

// Single source of truth for moving ingredient stock in/out for a recipe-based
// order — a sale deducts (sign -1), a void/refund gives it back (sign +1). Both
// callers used to carry their own copy of this loop; keeping one copy means a
// unit-conversion or frozen-item fix only has to happen once.
export async function applyRecipeStockMovement(items, { sign, type, ref }) {
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
    if (!allRecipes?.length) return
    const ingIds = [...new Set(allRecipes.map(r => r.ingredient_id))]
    const ings = await qr(supabase.from('ingredients').select('id, stock, name, unit, conversions').in('id', ingIds), { ms:5000 })
    const ingMap = {}
    for (const ing of ings || []) ingMap[ing.id] = ing
    const deltas = {}
    for (const item of items) {
      const rows = allRecipes.filter(r => r.product_id === item.sku)
      for (const ri of rows) {
        const ing = ingMap[ri.ingredient_id]
        if (!ing) continue
        const qtyBase = toBaseUnit(ing, ri.qty || 0, ri.unit) * (item.qty || 1)
        if (qtyBase) deltas[ri.ingredient_id] = (deltas[ri.ingredient_id] || 0) + qtyBase
      }
    }
    if (!Object.keys(deltas).length) return
    const movDate = new Date().toISOString().slice(0, 10)
    const movTime = new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })
    const ts = Date.now()
    const movements = Object.keys(deltas).map((id, idx) => {
      const ing = ingMap[id]
      return {
        id: `MOV-${ts}-${idx}`,
        type,
        ingredient_id: id,
        ingredient_name: ing?.name,
        qty: sign * Math.abs(deltas[id] || 0),
        unit: ing?.unit,
        ref: ref || `ORD-${ts}`,
        note: type === 'Sale' ? 'Auto dari penjualan' : 'Auto dari ' + type.toLowerCase(),
        date: movDate,
        time: movTime,
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
      // Supabase's query builder is thenable but not a real Promise (no .catch()) —
      // wrap it so a failed insert can't throw synchronously and skip the stock update above.
      Promise.resolve(supabase.from('stock_movements').insert(movements)).catch(() => {}),
    ])
  } catch (e) { console.error('Stock movement error:', e) }
}
