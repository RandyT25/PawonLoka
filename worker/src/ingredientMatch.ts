import { resolveBestMatch, type MatchResolution } from "./fuzzyMatch"
import type { ConversionEntry } from "./unitConversion"

export interface IngredientCandidate {
  id: string
  name: string
  unit: string
  cost_per_unit: number
  conversions?: ConversionEntry[] | string | null
}

export function matchIngredient(query: string, ingredients: IngredientCandidate[]): MatchResolution<IngredientCandidate> {
  return resolveBestMatch(query, ingredients, (i) => i.name)
}
