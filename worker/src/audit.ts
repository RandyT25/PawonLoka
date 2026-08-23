import type { DbClient } from "./db"

// Written unconditionally by the Worker, never skippable by Claude's output or a client
// (AGENT_LAYER_DESIGN.md Section 10). agent_audit_log has no anon-reachable policy at all —
// see supabase/migrations/20260818000001_create_agent_audit_log.sql.

export type AuditStage = "read" | "propose" | "confirm" | "execute"

export interface AuditEntry {
  telegramUserId: number
  telegramUpdateId?: number
  mappedIdentity: string | null
  capability: string
  stage: AuditStage
  params?: unknown
  resultSummary?: unknown
  error?: string
  confirmationId?: string
}

export async function writeAuditLog(sql: DbClient, entry: AuditEntry): Promise<void> {
  // IMPORTANT: never JSON.stringify() a value going into a jsonb column with postgres.js — the
  // driver already auto-serializes JS objects/arrays for jsonb parameters, so manually
  // stringifying first causes double-encoding (the column ends up holding a jsonb *string*
  // containing escaped JSON text, not a jsonb *object* — confirmed live during Step 1 testing,
  // 2026-08-19, via jsonb_typeof() returning "string" instead of "object"). Use sql.json(), not
  // a bare value — the `as any` casts below are a driver-boundary type-strictness workaround
  // (postgres.js's recursive JSONValue type can't be satisfied from an `unknown` source), not a
  // sign the values themselves are unsafe.
  await sql`
    insert into agent_audit_log
      (telegram_user_id, telegram_update_id, mapped_identity, capability, stage, params, result_summary, error, confirmation_id)
    values (
      ${entry.telegramUserId},
      ${entry.telegramUpdateId ?? null},
      ${entry.mappedIdentity},
      ${entry.capability},
      ${entry.stage},
      ${entry.params !== undefined ? sql.json(entry.params as any) : null},
      ${entry.resultSummary !== undefined ? sql.json(entry.resultSummary as any) : null},
      ${entry.error ?? null},
      ${entry.confirmationId ?? null}
    )
  `
}

// A failed audit write must never mask the original error or crash the reply path — but it
// should still be attempted every time, unconditionally, per the design doc's audit model.
export async function safeAudit(sql: DbClient, entry: AuditEntry): Promise<void> {
  try {
    await writeAuditLog(sql, entry)
  } catch {
    // intentionally swallowed — see comment above
  }
}
