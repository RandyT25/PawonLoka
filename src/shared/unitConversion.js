// Convert a qty expressed in `unit` into the ingredient's own base/stock unit.
// Looks up the ingredient's own conversions[] first (owner-configured purchase-unit factors),
// falling back to the common kg/L/Galon ratios only when the ingredient's base unit is gr/ml.
export function toBaseUnit(ing, qty, unit) {
  if (!ing || unit === ing.unit) return qty
  const convs = typeof ing.conversions === "string" ? JSON.parse(ing.conversions || "[]") : (ing.conversions || [])
  const conv = convs.find(c => c.unit === unit)
  if (conv && parseFloat(conv.qty) > 0) return qty * parseFloat(conv.qty)
  const fallbacks = { kg: 1000, L: 1000, Galon: 19000 }
  if ((ing.unit === "gr" || ing.unit === "ml") && fallbacks[unit]) return qty * fallbacks[unit]
  return qty
}

// Price for one unit of `unit` (a purchase unit like "kg"/"pack"), given ing.cost_per_unit is
// priced per ing.unit (the base unit).
export function unitPriceFor(ing, unit) {
  if (!ing) return 0
  if (unit === ing.unit) return ing.cost_per_unit || 0
  const convs = typeof ing.conversions === "string" ? JSON.parse(ing.conversions || "[]") : (ing.conversions || [])
  const conv = convs.find(c => c.unit === unit)
  if (conv && parseFloat(conv.qty) > 0) return (ing.cost_per_unit || 0) * parseFloat(conv.qty)
  const fallbacks = { kg: 1000, L: 1000, Galon: 19000 }
  if ((ing.unit === "gr" || ing.unit === "ml") && fallbacks[unit]) return (ing.cost_per_unit || 0) * fallbacks[unit]
  return ing.cost_per_unit || 0
}
