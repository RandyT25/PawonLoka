import postgres from "postgres"
import type { DayBoundsWita } from "./dateBoundary"

// IMPORTANT — the Hyperdrive config this connects through MUST point at Supabase's Supavisor
// pooler in SESSION mode (port 5432), not transaction mode (port 6543). Confirmed live during
// Phase 1A testing on 2026-08-18: pointed at the transaction-mode pooler, connections were wildly
// unreliable (intermittent multi-second hangs, occasional full timeouts, "Network connection
// lost" mid-query) even with fetch_types disabled and a connection-retry wrapper in index.ts.
// Repointing the same Hyperdrive config at the session-mode pooler (same credentials, same
// Supabase project, only the port changed) made every connection fast (~1-2s) and reliable. If
// this ever needs revisiting, check the Hyperdrive config's origin port before anything else.
//
// prepare: false — Hyperdrive's own connection multiplexing to the Worker doesn't guarantee
// session affinity for named prepared statements, independent of the origin pooler's mode.
// fetch_types: false — postgres.js otherwise does an extra pg_type lookup on first use to build
// its type parser cache; that specific query was one of the things that hung under the
// transaction-mode pooler above.
// max: 1 — one query (or a couple, within one request's lifetime) per Worker invocation;
// Hyperdrive already pools upstream, so the Worker doesn't need its own pool on top of that.
export type DbClient = ReturnType<typeof postgres>

export function createDbClient(connectionString: string): DbClient {
  return postgres(connectionString, { max: 1, prepare: false, fetch_types: false })
}

export interface TodaySalesResult {
  total: number
  orderCount: number
}

export async function getTodaySales(sql: DbClient, bounds: DayBoundsWita): Promise<TodaySalesResult> {
  const rows = await sql<{ total: string; order_count: string }[]>`
    select coalesce(sum(total), 0) as total, count(*) as order_count
    from orders
    where status = 'Paid'
      and created_at >= ${bounds.start}::timestamptz
      and created_at < ${bounds.end}::timestamptz
  `
  const row = rows[0]
  return { total: Number(row.total), orderCount: Number(row.order_count) }
}
