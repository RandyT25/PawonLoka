import type { DbClient } from "./db"

// Shared propose -> confirm -> execute token model (AGENT_LAYER_DESIGN.md Section 9), used by
// every write capability (waste/production/receiving). callback_data on every inline button
// carries only this row's opaque `id` — never resolved data. The single-use guarantee is the
// atomic UPDATE in claimConfirmation, not application-level bookkeeping — this survives
// Telegram's at-least-once webhook redelivery and a double-tapped button.

export type ConfirmationStatus = "resolving" | "pending" | "confirmed" | "cancelled" | "expired"

export interface ConfirmationRow {
  id: string
  created_at: string
  expires_at: string
  telegram_user_id: number
  chat_id: number
  message_thread_id: number | null
  message_id: number | null
  capability: string
  status: ConfirmationStatus
  params: Record<string, unknown>
  consumed_at: string | null
}

const DEFAULT_TTL_MINUTES = 5

export async function createConfirmation(
  sql: DbClient,
  input: {
    telegramUserId: number
    chatId: number
    messageThreadId?: number
    capability: string
    status: "resolving" | "pending"
    params: Record<string, unknown>
    ttlMinutes?: number
  },
): Promise<ConfirmationRow> {
  // No manual JSON.stringify() — postgres.js auto-serializes JS objects for jsonb parameters;
  // stringifying first double-encodes it into a jsonb *string* instead of a jsonb *object* (see
  // audit.ts's comment for the full story — confirmed live during Step 1 testing, 2026-08-19).
  const rows = await sql<ConfirmationRow[]>`
    insert into agent_confirmations
      (telegram_user_id, chat_id, message_thread_id, capability, status, params, expires_at)
    values (
      ${input.telegramUserId}, ${input.chatId}, ${input.messageThreadId ?? null},
      ${input.capability}, ${input.status}, ${sql.json(input.params as any)},
      now() + (${input.ttlMinutes ?? DEFAULT_TTL_MINUTES} || ' minutes')::interval
    )
    returning *
  `
  return rows[0]
}

export async function setConfirmationMessageId(sql: DbClient, id: string, messageId: number): Promise<void> {
  await sql`update agent_confirmations set message_id = ${messageId} where id = ${id}`
}

// Used only by the "pick" disambiguation step (resolving -> pending), never for confirm/cancel.
export async function resolveConfirmationParams(
  sql: DbClient,
  id: string,
  newParams: Record<string, unknown>,
): Promise<void> {
  await sql`
    update agent_confirmations
    set status = 'pending', params = ${sql.json(newParams as any)}
    where id = ${id} and status = 'resolving'
  `
}

// The one atomic operation the entire single-use guarantee rests on. Returns the claimed row on
// success, or null if the id doesn't exist / already consumed / expired / wrong requester —
// callers must never branch on a prior SELECT, only on this return value.
export async function claimConfirmation(
  sql: DbClient,
  id: string,
  requesterTelegramId: number,
): Promise<ConfirmationRow | null> {
  const rows = await sql<ConfirmationRow[]>`
    update agent_confirmations
    set status = 'confirmed', consumed_at = now()
    where id = ${id} and status = 'pending' and expires_at > now() and telegram_user_id = ${requesterTelegramId}
    returning *
  `
  return rows[0] ?? null
}

export async function cancelConfirmation(
  sql: DbClient,
  id: string,
  requesterTelegramId: number,
): Promise<ConfirmationRow | null> {
  const rows = await sql<ConfirmationRow[]>`
    update agent_confirmations
    set status = 'cancelled', consumed_at = now()
    where id = ${id} and status in ('pending', 'resolving') and telegram_user_id = ${requesterTelegramId}
    returning *
  `
  return rows[0] ?? null
}

// Read-only, used only to phrase *why* a claim/cancel failed (not found / already used / expired
// / wrong user) — never to gate logic, per this project's stated confirmation-token model.
export async function getConfirmation(sql: DbClient, id: string): Promise<ConfirmationRow | null> {
  const rows = await sql<ConfirmationRow[]>`select * from agent_confirmations where id = ${id}`
  return rows[0] ?? null
}

// Claim + the capability's staff_submissions insert MUST be atomic, not two separate statements —
// otherwise a connection drop between them (or an insert failure) can leave a row permanently
// "confirmed but never executed," since the confirmation is single-use by design and can't be
// re-claimed. Found live during Step 1 testing (2026-08-19): an explicit multi-statement
// transaction (sql.begin()/BEGIN.../COMMIT) worked perfectly in an isolated script talking
// directly to Supavisor, but consistently failed (silent no-op, claim never took effect) when run
// through the Worker's Hyperdrive-proxied connection — Hyperdrive's connection multiplexing
// doesn't appear to reliably pin a held-open multi-round-trip transaction to one backend
// connection. A single data-modifying CTE avoids the problem entirely: it's one query, one round
// trip, and Postgres guarantees it's atomic on its own — no explicit BEGIN/COMMIT needed, and it
// behaves exactly like every other single-statement query that's been reliable through Hyperdrive.
export async function claimAndInsertSubmission(
  sql: DbClient,
  confirmationId: string,
  requesterTelegramId: number,
  submissionType: string,
  submissionId: string,
): Promise<{ claimed: ConfirmationRow; submissionId: string } | null> {
  const rows = await sql<(ConfirmationRow & { inserted_submission_id: string })[]>`
    with claimed as (
      update agent_confirmations
      set status = 'confirmed', consumed_at = now()
      where id = ${confirmationId} and status = 'pending' and expires_at > now() and telegram_user_id = ${requesterTelegramId}
      returning *
    ), inserted as (
      insert into staff_submissions (id, type, status, submitted_by, submitted_at, data)
      select ${submissionId}, ${submissionType}, 'pending', claimed.params ->> 'submitted_by', now(),
             (claimed.params || jsonb_build_object('station', null))
      from claimed
      returning id as inserted_submission_id
    )
    select claimed.*, inserted.inserted_submission_id
    from claimed, inserted
  `
  const row = rows[0]
  return row ? { claimed: row, submissionId: row.inserted_submission_id } : null
}
