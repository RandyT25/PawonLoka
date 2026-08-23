import { resolveBestMatch, type MatchResolution } from "./fuzzyMatch"

export interface SubRecipeCandidate {
  id: string
  name: string
  unit: string
  yield_qty: number
  yield_unit: string
  ingredient_id?: string | null
}

export function matchSubRecipe(query: string, subRecipes: SubRecipeCandidate[]): MatchResolution<SubRecipeCandidate> {
  return resolveBestMatch(query, subRecipes, (r) => r.name)
}
