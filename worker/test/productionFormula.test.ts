import { describe, expect, it } from "vitest"
import { expandProduction, type IngredientNameLookup, type SubRecipeIngredientLine } from "../src/productionFormula"

// Fixtures modeled on a realistic sub-recipe: "Ayam Ungkep" (5 batches), matching the exact
// shape confirmed live in src/staff/StaffPortal.jsx and src/backoffice/components/StaffSubmissions.jsx.
const subRecipe = { id: "SUB-1", name: "Ayam Ungkep", yield_qty: 10, yield_unit: "ekor" }
const lines: SubRecipeIngredientLine[] = [
  { sub_recipe_id: "SUB-1", ingredient_id: "ING-1", qty: 200, unit: "gr" }, // bumbu per batch
  { sub_recipe_id: "SUB-1", ingredient_id: "ING-2", qty: 1, unit: "kg" }, // kunyit per batch (native purchase unit, unconverted)
  { sub_recipe_id: "SUB-1", ingredient_id: "ING-3", qty: 0.333, unit: "L" }, // minyak per batch
  { sub_recipe_id: "SUB-1", ingredient_id: "ING-9", qty: 5, unit: "gr" }, // belongs to a DIFFERENT sub-recipe, must be excluded
]
Object.assign(lines[3], { sub_recipe_id: "SUB-OTHER" })

const ingredientsById = new Map<string, IngredientNameLookup>([
  ["ING-1", { id: "ING-1", name: "Bumbu Ungkep", unit: "gr" }],
  ["ING-2", { id: "ING-2", name: "Kunyit", unit: "gr" }],
  ["ING-3", { id: "ING-3", name: "Minyak Goreng", unit: "ml" }],
])

describe("expandProduction", () => {
  it("multiplies each line's per-batch qty by the batch count, in the line's native unit", () => {
    const result = expandProduction(subRecipe, lines, ingredientsById, 5)
    expect(result.ingredients_used).toEqual([
      { ingredient_id: "ING-1", name: "Bumbu Ungkep", qty: 1000, unit: "gr" },
      { ingredient_id: "ING-2", name: "Kunyit", qty: 5, unit: "kg" }, // NOT converted to 5000gr here — approval does that
      { ingredient_id: "ING-3", name: "Minyak Goreng", qty: 1.67, unit: "L" }, // 0.333*5 = 1.665 -> round2 -> 1.67
    ])
  })

  it("excludes lines belonging to a different sub-recipe", () => {
    const result = expandProduction(subRecipe, lines, ingredientsById, 5)
    expect(result.ingredients_used.some((u) => u.ingredient_id === "ING-9")).toBe(false)
  })

  it("computes actual_yield = yield_qty * batches, rounded to 2 decimals", () => {
    const result = expandProduction(subRecipe, lines, ingredientsById, 5)
    expect(result.actual_yield).toBe(50)
    expect(result.yield_unit).toBe("ekor")
  })

  it("defaults yield_qty to 1 when the sub-recipe has none set", () => {
    const noYield = { id: "SUB-2", name: "No Yield Recipe", yield_qty: null, yield_unit: "pcs" }
    const result = expandProduction(noYield, [], ingredientsById, 3)
    expect(result.actual_yield).toBe(3)
  })

  it("falls back to the sub-recipe's own unit, then 'gr', for yield_unit", () => {
    const noYieldUnit = { id: "SUB-3", name: "X", yield_qty: 2, yield_unit: null, unit: "pack" }
    expect(expandProduction(noYieldUnit, [], ingredientsById, 1).yield_unit).toBe("pack")
    const noUnitAtAll = { id: "SUB-4", name: "Y", yield_qty: 2, yield_unit: null }
    expect(expandProduction(noUnitAtAll, [], ingredientsById, 1).yield_unit).toBe("gr")
  })

  it("falls back to the ingredient's own unit when a line has no unit, and to '' when neither exists", () => {
    const bareLines: SubRecipeIngredientLine[] = [{ sub_recipe_id: "SUB-1", ingredient_id: "ING-1", qty: 10, unit: "" }]
    const result = expandProduction(subRecipe, bareLines, ingredientsById, 1)
    expect(result.ingredients_used[0].unit).toBe("gr") // from ingredientsById

    const unknownIngredient: SubRecipeIngredientLine[] = [{ sub_recipe_id: "SUB-1", ingredient_id: "ING-UNKNOWN", qty: 10, unit: "" }]
    const result2 = expandProduction(subRecipe, unknownIngredient, ingredientsById, 1)
    expect(result2.ingredients_used[0].unit).toBe("")
    expect(result2.ingredients_used[0].name).toBe("")
  })

  it("rounds using the exact Math.round(x*100)/100 semantics, not a naive toFixed", () => {
    const line: SubRecipeIngredientLine[] = [{ sub_recipe_id: "SUB-1", ingredient_id: "ING-1", qty: 0.1, unit: "gr" }]
    const result = expandProduction(subRecipe, line, ingredientsById, 3) // 0.1*3 = 0.30000000000000004 in float
    expect(result.ingredients_used[0].qty).toBe(0.3)
  })
})
