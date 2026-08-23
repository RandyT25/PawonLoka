import type { DbClient } from "../db"
import { toBaseUnit } from "../unitConversion"
import { matchIngredient, type IngredientCandidate } from "../ingredientMatch"
import { isValidReason, type Reason } from "../wasteReasons"
import { safeAudit } from "../audit"
import {
  createConfirmation,
  claimAndInsertSubmission,
  cancelConfirmation,
  resolveConfirmationParams,
  getConfirmation,
  type ConfirmationRow,
} from "../confirmations"

export const CAPABILITY = "submit_waste_report"

function shortRandom(): string {
  return Math.random().toString(36).slice(2, 8)
}

export interface WasteReportInput {
  telegramUserId: number
  telegramUpdateId: number
  chatId: number
  messageThreadId?: number
  staffName: string
  ingredientQuery: string
  qty: number
  unit: string
  reasonRaw: string
  notes?: string
  date?: string
}

export type ProposeWasteOutcome =
  | { kind: "confident"; confirmation: ConfirmationRow; text: string }
  | { kind: "ambiguous"; confirmation: ConfirmationRow; candidates: IngredientCandidate[]; text: string }
  | { kind: "no_match"; text: string }
  | { kind: "invalid_qty"; text: string }

// IMPORTANT: unlike Production, the existing waste approval branch (StaffSubmissions.jsx's
// approveOne(), type==="waste") never calls toBaseUnit() — it trusts data.qty/data.unit as
// already denominated in the ingredient's own base unit (true for the web UI only because its
// form has no unit picker). A Telegram flow that accepts free-text like "2kg chicken" MUST
// convert here, before writing to staff_submissions, or approval silently decrements stock by
// 2 instead of 2000 — a serious, silent data-corruption bug. See the implementation plan.
export async function runProposeWasteReport(
  sql: DbClient,
  ingredients: IngredientCandidate[],
  input: WasteReportInput,
): Promise<ProposeWasteOutcome> {
  const baseEntry = {
    telegramUserId: input.telegramUserId,
    telegramUpdateId: input.telegramUpdateId,
    mappedIdentity: input.staffName,
    capability: CAPABILITY,
    stage: "propose" as const,
  }

  if (!(input.qty > 0)) {
    await safeAudit(sql, { ...baseEntry, params: input, error: "invalid qty" })
    return { kind: "invalid_qty", text: "Quantity must be a positive number." }
  }

  const reason: Reason = isValidReason(input.reasonRaw) ? input.reasonRaw : "Other"
  const notes = isValidReason(input.reasonRaw) ? input.notes || "" : `${input.reasonRaw}${input.notes ? " — " + input.notes : ""}`

  const match = matchIngredient(input.ingredientQuery, ingredients)

  if (match.kind === "none") {
    await safeAudit(sql, { ...baseEntry, params: input, error: "no ingredient match" })
    return { kind: "no_match", text: `Couldn't find an ingredient matching "${input.ingredientQuery}".` }
  }

  if (match.kind === "ambiguous") {
    const candidates = match.candidates.map((c) => c.item)
    const confirmation = await createConfirmation(sql, {
      telegramUserId: input.telegramUserId,
      chatId: input.chatId,
      messageThreadId: input.messageThreadId,
      capability: CAPABILITY,
      status: "resolving",
      params: {
        candidates: candidates.map((c) => ({ id: c.id, name: c.name })),
        qty: input.qty,
        unit: input.unit,
        reason,
        notes,
        date: input.date,
        staffName: input.staffName,
      },
    })
    await safeAudit(sql, { ...baseEntry, confirmationId: confirmation.id, params: input, resultSummary: { candidateCount: candidates.length } })
    const text =
      `Which ingredient did you mean?\n` + candidates.map((c, i) => `${i + 1}. ${c.name}`).join("\n")
    return { kind: "ambiguous", confirmation, candidates, text }
  }

  const ing = match.item
  const qtyBase = toBaseUnit(ing, input.qty, input.unit)
  const estimatedCost = qtyBase * ing.cost_per_unit

  const params = {
    ingredient_id: ing.id,
    ingredient_name: ing.name,
    qty: qtyBase,
    unit: ing.unit,
    reason,
    notes,
    date: input.date || new Date().toISOString().slice(0, 10),
    estimated_cost: estimatedCost,
    submitted_by: input.staffName,
  }

  const confirmation = await createConfirmation(sql, {
    telegramUserId: input.telegramUserId,
    chatId: input.chatId,
    messageThreadId: input.messageThreadId,
    capability: CAPABILITY,
    status: "pending",
    params,
  })

  await safeAudit(sql, { ...baseEntry, confirmationId: confirmation.id, params, resultSummary: { estimatedCost } })

  const conversionNote = input.unit !== ing.unit ? ` (${input.qty}${input.unit} → ${qtyBase}${ing.unit})` : ""
  const text =
    `Record ${qtyBase}${ing.unit} ${ing.name} waste${conversionNote}, reason: ${reason}` +
    (notes ? `, notes: ${notes}` : "") +
    `, submitted as ${input.staffName}. Estimated cost: Rp ${estimatedCost.toLocaleString("id-ID")}.\n` +
    `This will appear as a pending staff submission requiring Backoffice approval before it affects stock, same as from the Staff Portal.`

  return { kind: "confident", confirmation, text }
}

export async function runPickWasteIngredient(
  sql: DbClient,
  confirmationId: string,
  requesterTelegramId: number,
  candidateIndex: number,
): Promise<{ text: string; confirmation: ConfirmationRow | null }> {
  const row = await getConfirmation(sql, confirmationId)
  if (!row || row.status !== "resolving" || row.telegram_user_id !== requesterTelegramId) {
    return { text: "This selection is no longer valid.", confirmation: null }
  }
  const candidates = row.params.candidates as { id: string; name: string }[]
  const chosen = candidates[candidateIndex]
  if (!chosen) return { text: "Invalid selection.", confirmation: null }

  // Re-fetch the ingredient's full record for cost/unit — params only held id/name for the list.
  const ingRows = await sql<IngredientCandidate[]>`
    select id, name, unit, cost_per_unit, conversions from ingredients where id = ${chosen.id}
  `
  const ing = ingRows[0]
  if (!ing) return { text: "That ingredient no longer exists.", confirmation: null }

  const qty = row.params.qty as number
  const unit = row.params.unit as string
  const qtyBase = toBaseUnit(ing, qty, unit)
  const estimatedCost = qtyBase * ing.cost_per_unit

  const finalParams = {
    ingredient_id: ing.id,
    ingredient_name: ing.name,
    qty: qtyBase,
    unit: ing.unit,
    reason: row.params.reason,
    notes: row.params.notes,
    date: row.params.date || new Date().toISOString().slice(0, 10),
    estimated_cost: estimatedCost,
    submitted_by: row.params.staffName,
  }
  await resolveConfirmationParams(sql, confirmationId, finalParams)

  const conversionNote = unit !== ing.unit ? ` (${qty}${unit} → ${qtyBase}${ing.unit})` : ""
  const text =
    `Record ${qtyBase}${ing.unit} ${ing.name} waste${conversionNote}, reason: ${row.params.reason}` +
    `, submitted as ${row.params.staffName}. Estimated cost: Rp ${estimatedCost.toLocaleString("id-ID")}.\n` +
    `This will appear as a pending staff submission requiring Backoffice approval before it affects stock, same as from the Staff Portal.`

  return { text, confirmation: { ...row, status: "pending", params: finalParams } }
}

export type ConfirmWasteOutcome = { outcome: "executed"; submissionId: string } | { outcome: "not_claimable"; reason: string }

export async function runConfirmWasteReport(
  sql: DbClient,
  confirmationId: string,
  requesterTelegramId: number,
): Promise<ConfirmWasteOutcome> {
  const confirmEntry = {
    telegramUserId: requesterTelegramId,
    mappedIdentity: null,
    capability: CAPABILITY,
    stage: "confirm" as const,
    confirmationId,
  }

  const submissionId = `SS-${Date.now()}-${shortRandom()}`
  const claim = await claimAndInsertSubmission(sql, confirmationId, requesterTelegramId, "waste", submissionId)

  if (!claim) {
    // Either the insert failed and the whole statement (claim included) never committed, or the
    // claim itself matched no row (not found / already used / expired / wrong requester) —
    // getConfirmation (a separate read) is used only to phrase which, never to gate logic.
    const existing = await getConfirmation(sql, confirmationId)
    const reason = !existing
      ? "not found"
      : String(existing.telegram_user_id) !== String(requesterTelegramId)
        ? "wrong requester"
        : existing.status !== "pending"
          ? `already ${existing.status}`
          : "expired"
    await safeAudit(sql, { ...confirmEntry, error: reason })
    return { outcome: "not_claimable", reason }
  }

  await safeAudit(sql, { ...confirmEntry, resultSummary: { claimed: true } })
  await safeAudit(sql, {
    telegramUserId: requesterTelegramId,
    mappedIdentity: claim.claimed.params.submitted_by as string,
    capability: CAPABILITY,
    stage: "execute",
    confirmationId,
    params: claim.claimed.params,
    resultSummary: { submissionId },
  })

  return { outcome: "executed", submissionId }
}

export async function runCancelWasteReport(
  sql: DbClient,
  confirmationId: string,
  requesterTelegramId: number,
): Promise<{ outcome: "cancelled" | "not_claimable" }> {
  const cancelled = await cancelConfirmation(sql, confirmationId, requesterTelegramId)
  await safeAudit(sql, {
    telegramUserId: requesterTelegramId,
    mappedIdentity: null,
    capability: CAPABILITY,
    stage: "confirm",
    confirmationId,
    resultSummary: { outcome: cancelled ? "cancelled" : "not_claimable" },
  })
  return { outcome: cancelled ? "cancelled" : "not_claimable" }
}
