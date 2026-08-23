// WITA is a fixed +08:00 offset with no DST. Computed by shifting the UTC instant forward by
// 8 hours before reading the calendar date, rather than relying on any local/.toISOString()
// UTC-calendar-day read — see AGENT_LAYER_DESIGN.md's documented `orders.date`/`.toISOString()`
// trap (ShiftModal.jsx/POS.jsx compute "today" in UTC, which drifts for 00:00-08:00 local orders).
// Upper bound is the exclusive start of the next WITA day, matching get_today_sales' spec in
// AGENT_LAYER_DESIGN.md Section 5, not Accounting.jsx's separate inclusive-23:59:59 convention.

const WITA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function witaCalendarDate(witaShiftedMs: number): string {
  const d = new Date(witaShiftedMs)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export interface DayBoundsWita {
  date: string
  start: string
  end: string
}

export function todayBoundsWita(now: Date = new Date()): DayBoundsWita {
  const witaMs = now.getTime() + WITA_OFFSET_MS
  const date = witaCalendarDate(witaMs)
  const nextDate = witaCalendarDate(witaMs + DAY_MS)
  return {
    date,
    start: `${date}T00:00:00+08:00`,
    end: `${nextDate}T00:00:00+08:00`,
  }
}
