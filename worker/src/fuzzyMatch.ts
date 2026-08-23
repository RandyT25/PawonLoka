// Deterministic string-similarity pre-filter (AGENT_LAYER_DESIGN.md P2.5: entity resolution is
// "best done as a deterministic string-similarity pre-filter that narrows to a short candidate
// list" — Claude never guesses over a raw table, and per this project's plan, ambiguous cases go
// to a human via inline keyboard rather than a second Claude call to "break ties").
//
// Score is a normalized bigram (Dice coefficient) similarity in [0,1], with an exact/substring
// match boosted to the top of the range — cheap, dependency-free, good enough for short
// ingredient/recipe/supplier names typed by staff (typos, partial names, case differences).

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

function bigrams(s: string): string[] {
  const grams: string[] = []
  for (let i = 0; i < s.length - 1; i++) grams.push(s.slice(i, i + 2))
  return grams
}

function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0
  const bigramsA = bigrams(a)
  const bigramsB = bigrams(b)
  const counts = new Map<string, number>()
  for (const g of bigramsA) counts.set(g, (counts.get(g) || 0) + 1)
  let matches = 0
  for (const g of bigramsB) {
    const c = counts.get(g) || 0
    if (c > 0) {
      matches++
      counts.set(g, c - 1)
    }
  }
  return (2 * matches) / (bigramsA.length + bigramsB.length)
}

export function scoreMatch(query: string, candidate: string): number {
  const q = normalize(query)
  const c = normalize(candidate)
  if (q === c) return 1
  if (c.includes(q) || q.includes(c)) return 0.9 + 0.1 * diceCoefficient(q, c)
  return diceCoefficient(q, c)
}

export interface ScoredMatch<T> {
  item: T
  score: number
}

export function rankMatches<T>(query: string, items: T[], getName: (item: T) => string): ScoredMatch<T>[] {
  return items
    .map((item) => ({ item, score: scoreMatch(query, getName(item)) }))
    .sort((a, b) => b.score - a.score)
}

export type MatchResolution<T> =
  | { kind: "confident"; item: T; score: number }
  | { kind: "ambiguous"; candidates: ScoredMatch<T>[] }
  | { kind: "none" }

// A single result is "confident" only if it clears a high absolute bar AND leads the runner-up
// by a real margin — a query that's genuinely ambiguous between two close names (e.g. "Ayam
// Fillet" vs "Ayam Utuh") must never get silently auto-picked (AGENT_LAYER_DESIGN.md P2.4: "the
// system must never silently guess into a confirmable proposal").
export function resolveBestMatch<T>(
  query: string,
  items: T[],
  getName: (item: T) => string,
  opts: { confidentThreshold?: number; minGap?: number; candidateLimit?: number } = {},
): MatchResolution<T> {
  const { confidentThreshold = 0.72, minGap = 0.15, candidateLimit = 5 } = opts
  const ranked = rankMatches(query, items, getName)
  if (ranked.length === 0 || ranked[0].score === 0) return { kind: "none" }
  const top = ranked[0]
  const runnerUp = ranked[1]
  // An exact (post-normalization) name match is unambiguous by definition, regardless of how
  // close a substring-containing runner-up scores (e.g. query "Beras" vs candidates "Beras" and
  // "Tepung Beras" — both score highly since the latter contains the former, but a user typing
  // the literal ingredient name means that ingredient, not a longer one that happens to embed
  // it). Only apply the gap check below the exact-match case.
  if (top.score === 1) return { kind: "confident", item: top.item, score: top.score }
  const gap = runnerUp ? top.score - runnerUp.score : 1
  if (top.score >= confidentThreshold && gap >= minGap) {
    return { kind: "confident", item: top.item, score: top.score }
  }
  // A higher bar than the ambiguous-detection above: coincidental bigram overlap between
  // unrelated short words (e.g. "Terasi" scoring 0.67 against a query of "Beras") shouldn't
  // clutter the disambiguation list — only genuinely plausible candidates belong here.
  const candidates = ranked.filter((m) => m.score >= confidentThreshold - minGap).slice(0, candidateLimit)
  if (candidates.length === 0) return { kind: "none" }
  return { kind: "ambiguous", candidates }
}
