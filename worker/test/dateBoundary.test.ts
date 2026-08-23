import { describe, expect, it } from "vitest"
import { todayBoundsWita } from "../src/dateBoundary"

describe("todayBoundsWita", () => {
  it("computes the WITA calendar day for a mid-day UTC instant", () => {
    // 2026-08-18T10:00:00Z = 2026-08-18T18:00:00+08:00 — same WITA calendar day as UTC here.
    const bounds = todayBoundsWita(new Date("2026-08-18T10:00:00Z"))
    expect(bounds.date).toBe("2026-08-18")
    expect(bounds.start).toBe("2026-08-18T00:00:00+08:00")
    expect(bounds.end).toBe("2026-08-19T00:00:00+08:00")
  })

  it("rolls over to the next WITA day for a late-UTC instant", () => {
    // 2026-08-18T20:00:00Z = 2026-08-19T04:00:00+08:00 — already tomorrow in WITA.
    const bounds = todayBoundsWita(new Date("2026-08-18T20:00:00Z"))
    expect(bounds.date).toBe("2026-08-19")
    expect(bounds.start).toBe("2026-08-19T00:00:00+08:00")
    expect(bounds.end).toBe("2026-08-20T00:00:00+08:00")
  })

  it("handles the exact WITA midnight boundary (00:00+08:00 = 16:00 UTC previous day)", () => {
    const bounds = todayBoundsWita(new Date("2026-08-17T16:00:00Z"))
    expect(bounds.date).toBe("2026-08-18")
    expect(bounds.start).toBe("2026-08-18T00:00:00+08:00")
  })

  it("does not reproduce the .toISOString().slice(0,10) UTC-calendar-day trap", () => {
    // 2026-08-18T23:00:00Z is still 2026-08-18 by naive .toISOString().slice(0,10),
    // but it's already 2026-08-19T07:00:00+08:00 in WITA — the trap this function must avoid.
    const now = new Date("2026-08-18T23:00:00Z")
    const naiveUtcDate = now.toISOString().slice(0, 10)
    const bounds = todayBoundsWita(now)
    expect(bounds.date).not.toBe(naiveUtcDate)
    expect(bounds.date).toBe("2026-08-19")
  })

  it("rolls over the month/year correctly", () => {
    // 2026-08-31T20:00:00Z = 2026-09-01T04:00:00+08:00
    const bounds = todayBoundsWita(new Date("2026-08-31T20:00:00Z"))
    expect(bounds.date).toBe("2026-09-01")
    expect(bounds.end).toBe("2026-09-02T00:00:00+08:00")
  })
})
