import { describe, expect, it } from "vitest"
import { toBaseUnit, unitPriceFor } from "../src/unitConversion"

const chicken = {
  unit: "gr",
  cost_per_unit: 35,
  conversions: [{ unit: "kg", qty: 1000 }, { unit: "ekor", qty: 900, sku: "AYM-1EKOR" }],
}

describe("toBaseUnit", () => {
  it("returns qty unchanged when unit already matches the ingredient's base unit", () => {
    expect(toBaseUnit(chicken, 500, "gr")).toBe(500)
  })

  it("converts via an explicit conversions[] entry", () => {
    expect(toBaseUnit(chicken, 2, "kg")).toBe(2000)
    expect(toBaseUnit(chicken, 1, "ekor")).toBe(900)
  })

  it("parses conversions provided as a JSON string", () => {
    const stringified = { ...chicken, conversions: JSON.stringify(chicken.conversions) }
    expect(toBaseUnit(stringified, 2, "kg")).toBe(2000)
  })

  it("falls back to hardcoded kg/L/Galon ratios only when base unit is gr/ml and no explicit conversion exists", () => {
    const flour = { unit: "gr", cost_per_unit: 12, conversions: [] }
    expect(toBaseUnit(flour, 3, "kg")).toBe(3000)
    const oil = { unit: "ml", cost_per_unit: 20, conversions: [] }
    expect(toBaseUnit(oil, 1, "L")).toBe(1000)
    expect(toBaseUnit(oil, 1, "Galon")).toBe(19000)
  })

  it("does not apply the hardcoded fallback when the ingredient's base unit is not gr/ml", () => {
    const boxed = { unit: "pack", cost_per_unit: 5, conversions: [] }
    expect(toBaseUnit(boxed, 3, "kg")).toBe(3) // no matching conversion, no fallback applies -> passthrough
  })

  it("returns qty unchanged when ing is null/undefined", () => {
    expect(toBaseUnit(null, 5, "kg")).toBe(5)
    expect(toBaseUnit(undefined, 5, "kg")).toBe(5)
  })

  it("ignores a conversion entry with a non-positive qty", () => {
    const bad = { unit: "gr", cost_per_unit: 1, conversions: [{ unit: "kg", qty: 0 }] }
    expect(toBaseUnit(bad, 2, "kg")).toBe(2000) // falls through to the gr/ml hardcoded fallback
  })
})

describe("unitPriceFor", () => {
  it("returns cost_per_unit unchanged when unit already matches the base unit", () => {
    expect(unitPriceFor(chicken, "gr")).toBe(35)
  })

  it("multiplies cost_per_unit by the conversion factor for a purchase unit", () => {
    expect(unitPriceFor(chicken, "kg")).toBe(35 * 1000)
    expect(unitPriceFor(chicken, "ekor")).toBe(35 * 900)
  })

  it("falls back to the hardcoded kg/L/Galon ratio when applicable", () => {
    const flour = { unit: "gr", cost_per_unit: 12, conversions: [] }
    expect(unitPriceFor(flour, "kg")).toBe(12 * 1000)
  })

  it("returns bare cost_per_unit when no conversion and no fallback applies", () => {
    const boxed = { unit: "pack", cost_per_unit: 5, conversions: [] }
    expect(unitPriceFor(boxed, "kg")).toBe(5)
  })

  it("returns 0 for a null/undefined ingredient", () => {
    expect(unitPriceFor(null, "kg")).toBe(0)
  })
})
