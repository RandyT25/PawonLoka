import type { DbClient } from "../db"
import { matchSupplier, type SupplierCandidate } from "../supplierMatch"
import { matchIngredient, type IngredientCandidate } from "../ingredientMatch"
import { unitPriceFor } from "../unitConversion"
import { safeAudit } from "../audit"
import { createConfirmation, claimAndInsertSubmission, cancelConfirmation, getConfirmation, type ConfirmationRow } from "../confirmations"

export const CAPABILITY = "submit_receiving_report"

function shortRandom(): string {
  return Math.random().toString(36).slice(2, 8)
}

export interface ReceivingItemInput {
  nameQuery: string
  qty: number
  unit: string
  unitCost: number
}

export interface ReceivingReportInput {
  telegramUserId: number
  telegramUpdateId: number
  chatId: number
  messageThreadId?: number
  staffName: string
  supplierQuery: string
  items: ReceivingItemInput[]
  invoiceTotal?: number
  photoUrl: string
  notes?: string
  date?: string
}

interface ResolvedItem {
  ingredient_id: string | null
  name: string
  qty: number
  unit: string
  unit_cost: number
  matched: boolean
  cost_estimated: boolean
}

// Unlike Waste/Production (a single entity to resolve, disambiguated via an inline-keyboard
// pick when ambiguous), Receiving can have many line items at once — running a sequential
// pick-keyboard loop per item is real UX complexity not worth building for v1. Instead: best-
// effort match each item and the supplier independently; anything below the confidence bar is
// kept as free text with matched:false and surfaced plainly in the confirmation message, so the
// human reviewing it (which they always do here, per the OCR-accuracy-check principle) catches
// it before confirming. Since Receiving never has a direct stock effect, an unmatched item is
// low-stakes — worth revisiting only if real usage shows it's a frequent annoyance.
//
// Cost auto-fill: when the photo didn't show a price (unit_cost extracted as 0 — a scale-reading
// photo has no price on it at all) but the item DID match a known ingredient, fall back to that
// ingredient's own cost_per_unit (via the same unitPriceFor() used everywhere else in this
// codebase, so the unit conversion is exactly right) rather than leaving it blank. Only ever a
// fallback — if the photo genuinely showed a price, that's trusted over history. Always flagged
// as estimated in the proposal text (cost_estimated), never presented as if it were read from
// the photo — per this project's "never silently guess into a confirmable proposal" principle.
function resolveItem(item: ReceivingItemInput, ingredients: IngredientCandidate[]): ResolvedItem {
  const match = matchIngredient(item.nameQuery, ingredients)
  if (match.kind === "confident") {
    const hasPhotoPrice = item.unitCost > 0
    const unitCost = hasPhotoPrice ? item.unitCost : unitPriceFor(match.item, item.unit)
    return {
      ingredient_id: match.item.id,
      name: match.item.name,
      qty: item.qty,
      unit: item.unit,
      unit_cost: unitCost,
      matched: true,
      cost_estimated: !hasPhotoPrice && unitCost > 0,
    }
  }
  return { ingredient_id: null, name: item.nameQuery, qty: item.qty, unit: item.unit, unit_cost: item.unitCost, matched: false, cost_estimated: false }
}

function proposalText(supplierName: string, supplierMatched: boolean, items: ResolvedItem[], invoiceTotal: number | undefined, staffName: string): string {
  const lines = items
    .map((i) => {
      const flag = !i.matched ? "  (⚠️ not matched to an ingredient — check name)" : i.cost_estimated ? "  (~ estimated from last purchase price, not read from photo)" : ""
      return `  - ${i.qty}${i.unit} ${i.name} @ Rp${i.unit_cost.toLocaleString("id-ID")}${flag}`
    })
    .join("\n")
  const supplierNote = supplierMatched ? supplierName : `${supplierName}  (⚠️ not matched to a known supplier)`
  const totalLine = invoiceTotal !== undefined ? `\nInvoice total: Rp${invoiceTotal.toLocaleString("id-ID")}` : ""
  return (
    `Receiving from ${supplierNote}, submitted as ${staffName}:\n${lines}${totalLine}\n\n` +
    `This creates a pending reference record only — it does NOT affect stock or cost. ` +
    `A manager still finalizes the real purchase through Bayar Faktur in Backoffice, using this and the photo as reference.`
  )
}

export type ProposeReceivingOutcome =
  | { kind: "proposed"; confirmation: ConfirmationRow; text: string }
  | { kind: "invalid"; text: string }

export async function runProposeReceivingReport(
  sql: DbClient,
  suppliers: SupplierCandidate[],
  ingredients: IngredientCandidate[],
  input: ReceivingReportInput,
): Promise<ProposeReceivingOutcome> {
  const baseEntry = {
    telegramUserId: input.telegramUserId,
    telegramUpdateId: input.telegramUpdateId,
    mappedIdentity: input.staffName,
    capability: CAPABILITY,
    stage: "propose" as const,
  }

  if (input.items.length === 0) {
    await safeAudit(sql, { ...baseEntry, params: input, error: "no items" })
    return { kind: "invalid", text: "Couldn't find any line items in that invoice." }
  }

  const supplierMatch = matchSupplier(input.supplierQuery, suppliers)
  const supplierResolved =
    supplierMatch.kind === "confident"
      ? { id: supplierMatch.item.id as string | null, name: supplierMatch.item.name, matched: true }
      : { id: null, name: input.supplierQuery, matched: false }

  const resolvedItems = input.items.map((item) => resolveItem(item, ingredients))

  const params = {
    supplier_id: supplierResolved.id,
    supplier_name: supplierResolved.name,
    items: resolvedItems.map(({ matched: _matched, ...rest }) => rest),
    invoice_total: input.invoiceTotal ?? null,
    photo_url: input.photoUrl,
    notes: input.notes || "",
    date: input.date || new Date().toISOString().slice(0, 10),
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

  await safeAudit(sql, {
    ...baseEntry,
    confirmationId: confirmation.id,
    params,
    resultSummary: { itemCount: resolvedItems.length, supplierMatched: supplierResolved.matched, unmatchedItems: resolvedItems.filter((i) => !i.matched).length },
  })

  return {
    kind: "proposed",
    confirmation,
    text: proposalText(supplierResolved.name, supplierResolved.matched, resolvedItems, input.invoiceTotal, input.staffName),
  }
}

export type ConfirmReceivingOutcome = { outcome: "executed"; submissionId: string } | { outcome: "not_claimable"; reason: string }

export async function runConfirmReceivingReport(
  sql: DbClient,
  confirmationId: string,
  requesterTelegramId: number,
): Promise<ConfirmReceivingOutcome> {
  const confirmEntry = {
    telegramUserId: requesterTelegramId,
    mappedIdentity: null,
    capability: CAPABILITY,
    stage: "confirm" as const,
    confirmationId,
  }

  const submissionId = `SS-${Date.now()}-${shortRandom()}`
  const claim = await claimAndInsertSubmission(sql, confirmationId, requesterTelegramId, "receiving", submissionId)

  if (!claim) {
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

export async function runCancelReceivingReport(
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
