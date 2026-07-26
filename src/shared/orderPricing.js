// Single source of truth for order pricing math. Every write to the `orders`
// table's items/subtotal/tax/discount/total must go through this function so
// those fields can never be written out of sync with each other.
export function computeOrderTotals({ items, discountPct = 0, promoDisc = 0, pointsValue = 0, taxRate = 0 }) {
  const subtotal = items.reduce((s, i) => s + (i.price - (i.itemDisc || 0)) * i.qty, 0)
  const discAmt = discountPct ? Math.round(subtotal * discountPct / 100) : 0
  const discount = discAmt + promoDisc + pointsValue
  const tax = Math.round((subtotal - discount) * taxRate)
  const total = subtotal - discount + tax
  return { items, subtotal, tax, discount, total }
}

// Given an order row's own stored discount/subtotal, imply the discount % that
// produced it (discount is persisted as an absolute amount, not a rate) so it
// can be reapplied to a new subtotal — e.g. when merging two bills together.
export function impliedDiscountPct(order) {
  return order?.subtotal > 0 ? (order.discount || 0) / order.subtotal * 100 : 0
}

// Explode an order into its real per-method payment breakdown. `order.pay`
// is not reliable for aggregation — it's overwritten to the literal string
// 'Split' once a split bill finishes. The `payments` jsonb array (written
// for every Paid order, split or not) holds the true breakdown. Every
// payment-method aggregation site must use this instead of grouping on the
// raw `pay` column.
export function explodeOrderPayments(order) {
  let payments = order?.payments
  if (typeof payments === 'string') {
    try { payments = JSON.parse(payments || '[]') } catch { payments = [] }
  }
  if (Array.isArray(payments) && payments.length > 0) {
    return payments.map(p => ({ method: p.method || 'Other', amount: Number(p.amount) || 0 }))
  }
  return [{ method: order?.pay || 'Other', amount: Number(order?.total) || 0 }]
}
