import { describe, expect, it } from "vitest"
import { isAllowedOwner } from "../src/auth"

describe("isAllowedOwner", () => {
  it("allows the exact configured owner ID", () => {
    expect(isAllowedOwner(123456789, "123456789")).toBe(true)
  })

  it("rejects a different ID", () => {
    expect(isAllowedOwner(111, "123456789")).toBe(false)
  })

  it("rejects when the sender ID is missing (e.g. no message.from)", () => {
    expect(isAllowedOwner(undefined, "123456789")).toBe(false)
  })

  it("rejects when the env var is unset/malformed rather than matching loosely", () => {
    expect(isAllowedOwner(123456789, "")).toBe(false)
    expect(isAllowedOwner(123456789, "not-a-number")).toBe(false)
  })
})
