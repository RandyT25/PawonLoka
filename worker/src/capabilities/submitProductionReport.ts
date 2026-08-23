import type { DbClient } from "../db"
import { matchSubRecipe, type SubRecipeCandidate } from "../subRecipeMatch"
import { expandProduction, type IngredientNameLookup, type SubRecipeIngredientLine } from "../productionFormula"
import { safeAudit } from "../audit"
import {
  createConfirmation,
  claimAndInsertSubmission,
  cancelConfirmation,
  resolveConfirmationParams,
  getConfirmation,
  type ConfirmationRow,
} from "../confirmations"

export const CAPABILITY = "submit_production_report"

function shortRandom(): string {
  return Math.random().toString(36).slice(2, 8)
}

export interface ProductionReportInput {
  telegramUserId: number
  telegramUpdateId: number
  chatId: number
  messageThreadId?: number
  staffName: string
  recipeQuery: string
  batches: number
  notes?: string
  date?: string
}

function proposalText(itemName: string, expansion: ReturnType<typeof expandProduction>, staffName: string): string {
  const lines = expansion.ingredients_used.map((u) => `  - ${u.qty}${u.unit} ${u.name}`).join("\n")
  return (
    `Record production: ${itemName}, yield ${expansion.actual_yield}${expansion.yield_unit}, submitted as ${staffName}.\n` +
    `Ingredients consumed:\n${lines || "  (recipe has no ingredient lines)"}\n` +
    `This will appear as a pending staff submission requiring Backoffice approval before it affects stock, same as from the Staff Portal.`
  )
}

// IMPORTANT: unlike Waste, native recipe-line units are written to staff_submissions.data
// UNCONVERTED — the existing (unmodified) approval branch in StaffSubmissions.jsx calls
// toBaseUnit() itself on ingredients_used[]. Converting here would double-convert.
export async function runProposeProductionReport(
  sql: DbClient,
  subRecipes: SubRecipeCandidate[],
  subRecipeIngredients: SubRecipeIngredientLine[],
  ingredientsById: Map<string, IngredientNameLookup>,
  input: ProductionReportInput,
): Promise<
  | { kind: "confident"; confirmation: ConfirmationRow; text: string }
  | { kind: "ambiguous"; confirmation: ConfirmationRow; candidates: SubRecipeCandidate[]; text: string }
  | { kind: "no_match"; text: string }
  | { kind: "invalid_batches"; text: string }
> {
  const baseEntry = {
    telegramUserId: input.telegramUserId,
    telegramUpdateId: input.telegramUpdateId,
    mappedIdentity: input.staffName,
    capability: CAPABILITY,
    stage: "propose" as const,
  }

  if (!(input.batches > 0)) {
    await safeAudit(sql, { ...baseEntry, params: input, error: "invalid batches" })
    return { kind: "invalid_batches", text: "Batch count must be a positive number." }
  }

  const match = matchSubRecipe(input.recipeQuery, subRecipes)

  if (match.kind === "none") {
    await safeAudit(sql, { ...baseEntry, params: input, error: "no recipe match" })
    return { kind: "no_match", text: `Couldn't find a recipe matching "${input.recipeQuery}".` }
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
        batches: input.batches,
        notes: input.notes || "",
        date: input.date,
        staffName: input.staffName,
      },
    })
    await safeAudit(sql, { ...baseEntry, confirmationId: confirmation.id, params: input, resultSummary: { candidateCount: candidates.length } })
    const text = `Which recipe did you mean?\n` + candidates.map((c, i) => `${i + 1}. ${c.name}`).join("\n")
    return { kind: "ambiguous", confirmation, candidates, text }
  }

  const recipe = match.item
  const expansion = expandProduction(recipe, subRecipeIngredients, ingredientsById, input.batches)

  const params = {
    sub_recipe_id: recipe.id,
    item_name: recipe.name,
    batch_qty: input.batches,
    actual_yield: expansion.actual_yield,
    yield_unit: expansion.yield_unit,
    notes: input.notes || "",
    date: input.date || new Date().toISOString().slice(0, 10),
    needs_recipe_review: false,
    ingredients_used: expansion.ingredients_used,
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

  await safeAudit(sql, { ...baseEntry, confirmationId: confirmation.id, params, resultSummary: { ingredientCount: expansion.ingredients_used.length } })

  return { kind: "confident", confirmation, text: proposalText(recipe.name, expansion, input.staffName) }
}

export async function runPickProductionRecipe(
  sql: DbClient,
  subRecipesById: Map<string, SubRecipeCandidate>,
  subRecipeIngredients: SubRecipeIngredientLine[],
  ingredientsById: Map<string, IngredientNameLookup>,
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

  const recipe = subRecipesById.get(chosen.id)
  if (!recipe) return { text: "That recipe no longer exists.", confirmation: null }

  const batches = row.params.batches as number
  const expansion = expandProduction(recipe, subRecipeIngredients, ingredientsById, batches)

  const finalParams = {
    sub_recipe_id: recipe.id,
    item_name: recipe.name,
    batch_qty: batches,
    actual_yield: expansion.actual_yield,
    yield_unit: expansion.yield_unit,
    notes: row.params.notes || "",
    date: row.params.date || new Date().toISOString().slice(0, 10),
    needs_recipe_review: false,
    ingredients_used: expansion.ingredients_used,
    submitted_by: row.params.staffName,
  }
  await resolveConfirmationParams(sql, confirmationId, finalParams)

  return {
    text: proposalText(recipe.name, expansion, row.params.staffName as string),
    confirmation: { ...row, status: "pending", params: finalParams },
  }
}

export type ConfirmProductionOutcome = { outcome: "executed"; submissionId: string } | { outcome: "not_claimable"; reason: string }

export async function runConfirmProductionReport(
  sql: DbClient,
  confirmationId: string,
  requesterTelegramId: number,
): Promise<ConfirmProductionOutcome> {
  const confirmEntry = {
    telegramUserId: requesterTelegramId,
    mappedIdentity: null,
    capability: CAPABILITY,
    stage: "confirm" as const,
    confirmationId,
  }

  const submissionId = `SS-${Date.now()}-${shortRandom()}`
  const claim = await claimAndInsertSubmission(sql, confirmationId, requesterTelegramId, "production", submissionId)

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

export async function runCancelProductionReport(
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
