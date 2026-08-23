// Ported verbatim from src/shared/unitConversion.js — must stay byte-for-byte identical to the
// web app's logic (AGENT_LAYER_DESIGN.md P2.5: arithmetic is never re-derived, only ported).
// Do not "improve" this independently of the source file; if the source changes, re-port it.

export interface ConversionEntry {
  unit: string
  qty: number | string
  sku?: string
  last_price?: number
}

export interface IngredientForConversion {
  unit: string
  conversions?: ConversionEntry[] | string | null
}

const FALLBACKS: Record<string, number> = { kg: 1000, L: 1000, Galon: 19000 }

export function toBaseUnit(ing: IngredientForConversion | null | undefined, qty: number, unit: string): number {
  if (!ing || unit === ing.unit) return qty
  const convs: ConversionEntry[] =
    typeof ing.conversions === "string" ? JSON.parse(ing.conversions || "[]") : ing.conversions || []
  const conv = convs.find((c) => c.unit === unit)
  if (conv && parseFloat(String(conv.qty)) > 0) return qty * parseFloat(String(conv.qty))
  if ((ing.unit === "gr" || ing.unit === "ml") && FALLBACKS[unit]) return qty * FALLBACKS[unit]
  return qty
}

export interface IngredientForUnitPrice extends IngredientForConversion {
  cost_per_unit?: number
}

// Price for one unit of `unit` (a purchase unit like "kg"/"pack"), given ing.cost_per_unit is
// priced per ing.unit (the base unit).
export function unitPriceFor(ing: IngredientForUnitPrice | null | undefined, unit: string): number {
  if (!ing) return 0
  if (unit === ing.unit) return ing.cost_per_unit || 0
  const convs: ConversionEntry[] =
    typeof ing.conversions === "string" ? JSON.parse(ing.conversions || "[]") : ing.conversions || []
  const conv = convs.find((c) => c.unit === unit)
  if (conv && parseFloat(String(conv.qty)) > 0) return (ing.cost_per_unit || 0) * parseFloat(String(conv.qty))
  if ((ing.unit === "gr" || ing.unit === "ml") && FALLBACKS[unit]) return (ing.cost_per_unit || 0) * FALLBACKS[unit]
  return ing.cost_per_unit || 0
}
