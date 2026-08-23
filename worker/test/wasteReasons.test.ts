import { describe, expect, it } from "vitest"
import { REASONS, isValidReason } from "../src/wasteReasons"

describe("isValidReason", () => {
  it("accepts every value in REASONS", () => {
    for (const r of REASONS) expect(isValidReason(r)).toBe(true)
  })

  it("rejects anything not in the fixed enum", () => {
    expect(isValidReason("Stolen")).toBe(false)
    expect(isValidReason("expired")).toBe(false) // case-sensitive, matches the exact web app strings
    expect(isValidReason("")).toBe(false)
    expect(isValidReason(undefined)).toBe(false)
    expect(isValidReason(123)).toBe(false)
  })
})
