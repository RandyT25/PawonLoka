import type { DbClient } from "../db"
import { getTodaySales as queryTodaySales } from "../db"
import { todayBoundsWita } from "../dateBoundary"
import { safeAudit } from "../audit"

export interface GetTodaySalesOutcome {
  total: number
  orderCount: number
  date: string
}

export async function runGetTodaySales(
  sql: DbClient,
  telegramUserId: number,
  telegramUpdateId: number,
): Promise<GetTodaySalesOutcome> {
  const bounds = todayBoundsWita()
  const baseEntry = {
    telegramUserId,
    telegramUpdateId,
    mappedIdentity: "owner",
    capability: "get_today_sales",
    stage: "read" as const,
    params: { date: bounds.date },
  }

  try {
    const result = await queryTodaySales(sql, bounds)
    await safeAudit(sql, { ...baseEntry, resultSummary: result })
    return { ...result, date: bounds.date }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await safeAudit(sql, { ...baseEntry, error: message })
    throw err
  }
}
