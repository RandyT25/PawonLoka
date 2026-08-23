import { describe, expect, it } from "vitest"
import { resolveBestMatch, scoreMatch } from "../src/fuzzyMatch"

describe("scoreMatch", () => {
  it("scores an exact match (case/whitespace-insensitive) as 1", () => {
    expect(scoreMatch("ayam", "Ayam")).toBe(1)
    expect(scoreMatch(" Ayam ", "ayam")).toBe(1)
  })

  it("scores a substring match highly", () => {
    expect(scoreMatch("ayam", "Ayam Fillet")).toBeGreaterThan(0.85)
  })

  it("scores unrelated strings low", () => {
    expect(scoreMatch("ayam", "keju parmesan")).toBeLessThan(0.3)
  })
})

interface Ingredient {
  id: string
  name: string
}

describe("resolveBestMatch", () => {
  const ingredients: Ingredient[] = [
    { id: "ING-1", name: "Ayam Fillet" },
    { id: "ING-2", name: "Ayam Utuh" },
    { id: "ING-3", name: "Keju Parmesan" },
    { id: "ING-4", name: "Bawang Merah" },
  ]

  it("returns a confident single match for an unambiguous, close query", () => {
    const result = resolveBestMatch("bawang merah", ingredients, (i) => i.name)
    expect(result.kind).toBe("confident")
    if (result.kind === "confident") expect(result.item.id).toBe("ING-4")
  })

  it("returns ambiguous candidates when two names are both plausible matches, never auto-picking", () => {
    const result = resolveBestMatch("ayam", ingredients, (i) => i.name)
    expect(result.kind).toBe("ambiguous")
    if (result.kind === "ambiguous") {
      const ids = result.candidates.map((c) => c.item.id)
      expect(ids).toContain("ING-1")
      expect(ids).toContain("ING-2")
    }
  })

  it("returns none for a query matching nothing", () => {
    const result = resolveBestMatch("xyzxyz nonsense", ingredients, (i) => i.name)
    expect(result.kind).toBe("none")
  })

  it("returns none for an empty candidate list", () => {
    const result = resolveBestMatch("ayam", [], (i: Ingredient) => i.name)
    expect(result.kind).toBe("none")
  })

  // Regression test: found live during Step 1 testing (2026-08-19) — querying the exact
  // ingredient name "Beras" was classified ambiguous because "Tepung Beras" (which contains
  // "beras" as a substring) scored close enough to fail the gap check, and unrelated words with
  // coincidental bigram overlap ("Terasi") cluttered the candidate list.
  it("treats an exact name match as confident even when a substring-containing longer name scores close behind", () => {
    const rice: Ingredient[] = [
      { id: "ING-017", name: "Beras" },
      { id: "ING-185", name: "Tepung Beras" },
      { id: "ING-188", name: "Terasi" },
    ]
    const result = resolveBestMatch("Beras", rice, (i) => i.name)
    expect(result.kind).toBe("confident")
    if (result.kind === "confident") expect(result.item.id).toBe("ING-017")
  })
})
