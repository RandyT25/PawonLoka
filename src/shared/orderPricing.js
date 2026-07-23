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
