// Ported verbatim from src/staff/StaffPortal.jsx:250-271 (submitProduction()) — must stay
// byte-for-byte identical, including the JS Math.round(x*100)/100 rounding semantics. This
// produces ingredients_used[]/actual_yield/yield_unit in the recipe-line's NATIVE units — do NOT
// convert to base units here. The existing (unmodified) approval branch in StaffSubmissions.jsx
// calls toBaseUnit() itself on these raw values; converting here would double-convert or produce
// a shape that branch wasn't built to expect.

function round2(x: number): number {
  return Math.round(x * 100) / 100
}

export interface SubRecipeIngredientLine {
  sub_recipe_id: string
  ingredient_id: string
  qty: number
  unit: string
}

export interface IngredientNameLookup {
  id: string
  name: string
  unit: string
}

export interface SubRecipeForExpansion {
  id: string
  name: string
  unit?: string | null
  yield_qty?: number | null
  yield_unit?: string | null
}

export interface ProductionExpansion {
  ingredients_used: { ingredient_id: string; name: string; qty: number; unit: string }[]
  actual_yield: number
  yield_unit: string
}

export function expandProduction(
  subRecipe: SubRecipeForExpansion,
  lines: SubRecipeIngredientLine[],
  ingredientsById: Map<string, IngredientNameLookup>,
  batches: number,
): ProductionExpansion {
  const relevantLines = lines.filter((l) => l.sub_recipe_id === subRecipe.id)
  const ingredients_used = relevantLines.map((l) => {
    const ing = ingredientsById.get(l.ingredient_id)
    return {
      ingredient_id: l.ingredient_id,
      name: ing?.name || "",
      qty: round2(l.qty * batches),
      unit: l.unit || ing?.unit || "",
    }
  })
  const actual_yield = round2((subRecipe.yield_qty || 1) * batches)
  const yield_unit = subRecipe.yield_unit || subRecipe.unit || "gr"
  return { ingredients_used, actual_yield, yield_unit }
}
