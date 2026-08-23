import type { DbClient } from "./db"

// Identity mapping for the operational workflows (Waste/Production/Receiving), independent of
// isAllowedOwner (auth.ts) which gates the separate sales-reporting capability. Routing is
// intent-first, not identity-first (see index.ts): the owner can also have a telegram_users row,
// using their own name/staff record, so they aren't locked out of the operational workflows just
// because they're also the allowlisted owner.

export type StaffIdentity =
  | { kind: "staff"; staffId: string | null; staffName: string }
  | { kind: "unmapped" }

export async function resolveStaffIdentity(sql: DbClient, telegramId: number): Promise<StaffIdentity> {
  const rows = await sql<{ staff_id: string | null; staff_name: string; active: boolean }[]>`
    select staff_id, staff_name, active from telegram_users where telegram_id = ${telegramId}
  `
  const row = rows[0]
  if (!row || !row.active) return { kind: "unmapped" }
  return { kind: "staff", staffId: row.staff_id, staffName: row.staff_name }
}
