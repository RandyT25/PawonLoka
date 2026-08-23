import { resolveBestMatch, type MatchResolution } from "./fuzzyMatch"

export interface SupplierCandidate {
  id: string
  name: string
}

export function matchSupplier(query: string, suppliers: SupplierCandidate[]): MatchResolution<SupplierCandidate> {
  return resolveBestMatch(query, suppliers, (s) => s.name)
}
