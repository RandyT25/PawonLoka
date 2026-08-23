import {
  verifyWebhookSecret,
  sendMessage,
  answerCallbackQuery,
  editMessageReplyMarkup,
  type TelegramUpdate,
  type TelegramPhotoSize,
  type InlineKeyboardMarkup,
} from "./telegram"
import { isAllowedOwner } from "./auth"
import { createDbClient, type DbClient } from "./db"
import { runGetTodaySales, type GetTodaySalesOutcome } from "./capabilities/getTodaySales"
import { phraseSalesAnswer, extractReceivingReport } from "./claude"
import { resolveStaffIdentity } from "./telegramUsers"
import { getConfirmation } from "./confirmations"
import type { IngredientCandidate } from "./ingredientMatch"
import type { SubRecipeCandidate } from "./subRecipeMatch"
import type { SupplierCandidate } from "./supplierMatch"
import type { IngredientNameLookup, SubRecipeIngredientLine } from "./productionFormula"
import { downloadTelegramFile, largestPhoto } from "./telegramFiles"
import { uploadToBucket } from "./storageUpload"
import {
  runProposeWasteReport,
  runPickWasteIngredient,
  runConfirmWasteReport,
  runCancelWasteReport,
} from "./capabilities/submitWasteReport"
import {
  runProposeProductionReport,
  runPickProductionRecipe,
  runConfirmProductionReport,
  runCancelProductionReport,
} from "./capabilities/submitProductionReport"
import {
  runProposeReceivingReport,
  runConfirmReceivingReport,
  runCancelReceivingReport,
} from "./capabilities/submitReceivingReport"

export interface Env {
  HYPERDRIVE: Hyperdrive
  HYPERDRIVE_WRITER: Hyperdrive
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_WEBHOOK_SECRET: string
  ANTHROPIC_API_KEY: string
  TELEGRAM_OWNER_ID: string
  TELEGRAM_OPS_CHAT_ID: string
  TELEGRAM_TOPIC_MAP: string
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
}

// Deterministic routing for a single no-param capability — no need for a Claude tool-use call
// just to determine intent (AGENT_LAYER_DESIGN.md's cost-minimization principle, Section P2.5).
const SALES_INTENT = /^\/sales_today\b|sales|penjualan/i

function fallbackReply(result: { total: number; orderCount: number; date: string }): string {
  return (
    `Sales so far today (${result.date}, WITA): Rp ${result.total.toLocaleString("id-ID")} ` +
    `from ${result.orderCount} paid orders. Note: this may be a lower bound if any POS device ` +
    `has been offline and hasn't synced yet.`
  )
}

// Hyperdrive's first connection to Supavisor is occasionally slow or drops mid-query (observed
// live during Phase 1A rollout on 2026-08-18: intermittent "Network connection lost" and hangs
// alongside otherwise-successful requests). A fresh client tends to land on a healthy pooled
// backend, so one retry with a fresh connection — each capped well under Telegram's webhook
// timeout — is cheap insurance against that transient class of failure, not a fix for a bug in
// this code specifically.
// Attempt budgets are asymmetric on purpose: give the first (most likely genuinely cold)
// connection real room rather than cutting it off just as it would have succeeded — observed
// live, a legitimate cold-connect can take up to ~16s. Second attempt gets less, since by then
// either the first attempt's failure was fast (bad connection, no point waiting as long again)
// or the budget is already tight against Telegram's own webhook delivery timeout (~20s, observed).
const ATTEMPT_TIMEOUTS_MS = [12000, 6000]

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

async function withRetryConnection<T>(hyperdrive: Hyperdrive, fn: (sql: DbClient) => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= ATTEMPT_TIMEOUTS_MS.length; attempt++) {
    const sql = createDbClient(hyperdrive.connectionString)
    try {
      return await withTimeout(fn(sql), ATTEMPT_TIMEOUTS_MS[attempt - 1])
    } catch (err) {
      lastError = err
      console.error(`connection attempt ${attempt}/${ATTEMPT_TIMEOUTS_MS.length} failed:`, err)
    } finally {
      sql.end({ timeout: 1 }).catch(() => {})
    }
  }
  throw lastError
}

async function fetchTodaySalesWithRetry(
  hyperdrive: Hyperdrive,
  telegramUserId: number,
  telegramUpdateId: number,
): Promise<GetTodaySalesOutcome> {
  return withRetryConnection(hyperdrive, (sql) => runGetTodaySales(sql, telegramUserId, telegramUpdateId))
}

// --- Operational (Waste/Production/Receiving) plumbing ---

type OpsCapability = "waste" | "production" | "receiving"

function topicCapability(env: Env, messageThreadId: number | undefined): OpsCapability | null {
  if (messageThreadId === undefined) return null
  let map: Record<string, string>
  try {
    map = JSON.parse(env.TELEGRAM_TOPIC_MAP)
  } catch {
    return null
  }
  const capability = map[String(messageThreadId)]
  return capability === "waste" || capability === "production" || capability === "receiving" ? capability : null
}

function confirmKeyboard(confirmationId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Confirm", callback_data: `c:confirm:${confirmationId}` },
        { text: "❌ Cancel", callback_data: `c:cancel:${confirmationId}` },
      ],
    ],
  }
}

function pickKeyboard(confirmationId: string, count: number): InlineKeyboardMarkup {
  const buttons = Array.from({ length: count }, (_, i) => ({
    text: String(i + 1),
    callback_data: `c:pick:${confirmationId}:${i}`,
  }))
  return { inline_keyboard: [buttons, [{ text: "❌ Cancel", callback_data: `c:cancel:${confirmationId}` }]] }
}

async function fetchIngredients(sql: DbClient): Promise<IngredientCandidate[]> {
  return sql<IngredientCandidate[]>`select id, name, unit, cost_per_unit, conversions from ingredients`
}

async function fetchSuppliers(sql: DbClient): Promise<SupplierCandidate[]> {
  return sql<SupplierCandidate[]>`select id, name from suppliers where active`
}

async function fetchSubRecipeData(
  sql: DbClient,
): Promise<{ subRecipes: SubRecipeCandidate[]; lines: SubRecipeIngredientLine[]; ingredientsById: Map<string, IngredientNameLookup> }> {
  const [subRecipes, lines, ingredients] = await Promise.all([
    sql<SubRecipeCandidate[]>`select id, name, unit, yield_qty, yield_unit, ingredient_id from sub_recipes`,
    sql<SubRecipeIngredientLine[]>`select sub_recipe_id, ingredient_id, qty, unit from sub_recipe_ingredients`,
    sql<IngredientNameLookup[]>`select id, name, unit from ingredients`,
  ])
  const ingredientsById = new Map(ingredients.map((i) => [i.id, i]))
  return { subRecipes, lines, ingredientsById }
}

// Slash-command parsers — the deterministic test path for Step 1, ahead of Claude extraction
// (Step 2). Format is intentionally rigid: /waste <qty> <unit> <reason> <ingredient name...>,
// /produksi <batches> <recipe name...>.
function parseWasteCommand(text: string): { qty: number; unit: string; reasonRaw: string; ingredientQuery: string } | null {
  const m = text.match(/^\/waste\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/i)
  if (!m) return null
  const qty = parseFloat(m[1])
  if (!Number.isFinite(qty)) return null
  return { qty, unit: m[2], reasonRaw: m[3], ingredientQuery: m[4].trim() }
}

function parseProductionCommand(text: string): { batches: number; recipeQuery: string } | null {
  const m = text.match(/^\/produksi\s+(\S+)\s+(.+)$/i)
  if (!m) return null
  const batches = parseFloat(m[1])
  if (!Number.isFinite(batches)) return null
  return { batches, recipeQuery: m[2].trim() }
}

interface OpsMessageInput {
  text?: string
  caption?: string
  photo?: TelegramPhotoSize[]
}

async function handleOpsMessage(
  env: Env,
  capability: OpsCapability,
  fromId: number,
  chatId: number,
  messageThreadId: number,
  updateId: number,
  message: OpsMessageInput,
): Promise<void> {
  const text = (message.text || "").trim()
  await withRetryConnection(env.HYPERDRIVE_WRITER, async (sql) => {
    const identity = await resolveStaffIdentity(sql, fromId)
    if (identity.kind === "unmapped") {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "You're not set up for this bot yet — ask a manager to add you.", { messageThreadId })
      return
    }

    if (capability === "receiving") {
      const photo = message.photo ? largestPhoto(message.photo) : undefined
      if (!photo) {
        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Send a photo of the invoice/nota to log a receiving report.", { messageThreadId })
        return
      }
      const file = await downloadTelegramFile(env.TELEGRAM_BOT_TOKEN, photo.file_id)
      const photoUrl = await uploadToBucket(
        env.SUPABASE_URL,
        env.SUPABASE_ANON_KEY,
        "receiving-evidence",
        `${Date.now()}-${photo.file_id}.jpg`,
        file.bytes,
        file.contentType,
      )
      const extraction = await extractReceivingReport(env.ANTHROPIC_API_KEY, file.bytes, file.contentType)
      const [suppliers, ingredients] = await Promise.all([fetchSuppliers(sql), fetchIngredients(sql)])
      const result = await runProposeReceivingReport(sql, suppliers, ingredients, {
        telegramUserId: fromId,
        telegramUpdateId: updateId,
        chatId,
        messageThreadId,
        staffName: identity.staffName,
        supplierQuery: extraction.supplier_guess,
        items: extraction.items.map((i) => ({ nameQuery: i.name, qty: i.qty, unit: i.unit, unitCost: i.unit_cost })),
        invoiceTotal: extraction.invoice_total,
        photoUrl,
        notes: message.caption,
      })
      if (result.kind === "proposed") {
        const { message_id } = await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, result.text, {
          messageThreadId,
          replyMarkup: confirmKeyboard(result.confirmation.id),
        })
        await sql`update agent_confirmations set message_id = ${message_id} where id = ${result.confirmation.id}`
      } else {
        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, result.text, { messageThreadId })
      }
      return
    }

    if (capability === "waste") {
      const parsed = parseWasteCommand(text)
      if (!parsed) {
        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Format: /waste <qty> <unit> <reason> <ingredient name>", { messageThreadId })
        return
      }
      const ingredients = await fetchIngredients(sql)
      const result = await runProposeWasteReport(sql, ingredients, {
        telegramUserId: fromId,
        telegramUpdateId: updateId,
        chatId,
        messageThreadId,
        staffName: identity.staffName,
        ...parsed,
      })
      if (result.kind === "confident") {
        const { message_id } = await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, result.text, {
          messageThreadId,
          replyMarkup: confirmKeyboard(result.confirmation.id),
        })
        await sql`update agent_confirmations set message_id = ${message_id} where id = ${result.confirmation.id}`
      } else if (result.kind === "ambiguous") {
        const { message_id } = await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, result.text, {
          messageThreadId,
          replyMarkup: pickKeyboard(result.confirmation.id, result.candidates.length),
        })
        await sql`update agent_confirmations set message_id = ${message_id} where id = ${result.confirmation.id}`
      } else {
        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, result.text, { messageThreadId })
      }
      return
    }

    if (capability === "production") {
      const parsed = parseProductionCommand(text)
      if (!parsed) {
        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Format: /produksi <batches> <recipe name>", { messageThreadId })
        return
      }
      const { subRecipes, lines, ingredientsById } = await fetchSubRecipeData(sql)
      const result = await runProposeProductionReport(sql, subRecipes, lines, ingredientsById, {
        telegramUserId: fromId,
        telegramUpdateId: updateId,
        chatId,
        messageThreadId,
        staffName: identity.staffName,
        ...parsed,
      })
      if (result.kind === "confident") {
        const { message_id } = await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, result.text, {
          messageThreadId,
          replyMarkup: confirmKeyboard(result.confirmation.id),
        })
        await sql`update agent_confirmations set message_id = ${message_id} where id = ${result.confirmation.id}`
      } else if (result.kind === "ambiguous") {
        const { message_id } = await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, result.text, {
          messageThreadId,
          replyMarkup: pickKeyboard(result.confirmation.id, result.candidates.length),
        })
        await sql`update agent_confirmations set message_id = ${message_id} where id = ${result.confirmation.id}`
      } else {
        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, result.text, { messageThreadId })
      }
      return
    }
  })
}

async function handleCallbackQuery(env: Env, update: TelegramUpdate): Promise<void> {
  const cq = update.callback_query
  if (!cq || !cq.data || !cq.message) return
  // Dismissing the loading spinner is a UI nicety, not load-bearing — a failure here (e.g. a
  // stale/expired callback query) must never block the actual confirm/cancel/pick logic below.
  // Found live during Step 1 testing: an unguarded await here meant any answerCallbackQuery
  // failure silently aborted the entire handler before the real business logic ever ran.
  await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, cq.id).catch((err) => console.error("answerCallbackQuery failed:", err))

  const parts = cq.data.split(":")
  const [, action, confirmationId, idxStr] = parts
  const chatId = cq.message.chat.id
  const messageThreadId = cq.message.message_thread_id
  const fromId = cq.from.id

  await withRetryConnection(env.HYPERDRIVE_WRITER, async (sql) => {
    const row = await getConfirmation(sql, confirmationId)
    if (!row) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "This request is no longer valid.", { messageThreadId })
      return
    }

    if (action === "pick") {
      const idx = Number(idxStr)
      let text: string
      let confirmation
      if (row.capability === "submit_waste_report") {
        const picked = await runPickWasteIngredient(sql, confirmationId, fromId, idx)
        text = picked.text
        confirmation = picked.confirmation
      } else if (row.capability === "submit_production_report") {
        const { subRecipes, lines, ingredientsById } = await fetchSubRecipeData(sql)
        const subRecipesById = new Map(subRecipes.map((r) => [r.id, r]))
        const picked = await runPickProductionRecipe(sql, subRecipesById, lines, ingredientsById, confirmationId, fromId, idx)
        text = picked.text
        confirmation = picked.confirmation
      } else {
        return
      }
      // Stripping the inline keyboard is cosmetic — a failure here (e.g. a stale message) must
      // never block the actual confirm/cancel/pick logic below, same reasoning as
      // answerCallbackQuery above.
      if (cq.message) await editMessageReplyMarkup(env.TELEGRAM_BOT_TOKEN, chatId, cq.message.message_id, null).catch(() => {})
      if (confirmation) {
        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, text, { messageThreadId, replyMarkup: confirmKeyboard(confirmationId) })
      } else {
        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, text, { messageThreadId })
      }
      return
    }

    if (action === "confirm") {
      // Stripping the inline keyboard is cosmetic — a failure here (e.g. a stale message) must
      // never block the actual confirm/cancel/pick logic below, same reasoning as
      // answerCallbackQuery above.
      if (cq.message) await editMessageReplyMarkup(env.TELEGRAM_BOT_TOKEN, chatId, cq.message.message_id, null).catch(() => {})
      if (row.capability === "submit_waste_report") {
        const result = await runConfirmWasteReport(sql, confirmationId, fromId)
        const text = result.outcome === "executed" ? `Waste report submitted (${result.submissionId}) — pending Backoffice approval.` : `Couldn't confirm: ${result.reason}.`
        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, text, { messageThreadId })
      } else if (row.capability === "submit_production_report") {
        const result = await runConfirmProductionReport(sql, confirmationId, fromId)
        const text = result.outcome === "executed" ? `Production report submitted (${result.submissionId}) — pending Backoffice approval.` : `Couldn't confirm: ${result.reason}.`
        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, text, { messageThreadId })
      } else if (row.capability === "submit_receiving_report") {
        const result = await runConfirmReceivingReport(sql, confirmationId, fromId)
        const text = result.outcome === "executed" ? `Receiving report submitted (${result.submissionId}) — visible in Staff Reports.` : `Couldn't confirm: ${result.reason}.`
        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, text, { messageThreadId })
      }
      return
    }

    if (action === "cancel") {
      // Stripping the inline keyboard is cosmetic — a failure here (e.g. a stale message) must
      // never block the actual confirm/cancel/pick logic below, same reasoning as
      // answerCallbackQuery above.
      if (cq.message) await editMessageReplyMarkup(env.TELEGRAM_BOT_TOKEN, chatId, cq.message.message_id, null).catch(() => {})
      if (row.capability === "submit_waste_report") await runCancelWasteReport(sql, confirmationId, fromId)
      else if (row.capability === "submit_production_report") await runCancelProductionReport(sql, confirmationId, fromId)
      else if (row.capability === "submit_receiving_report") await runCancelReceivingReport(sql, confirmationId, fromId)
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Cancelled.", { messageThreadId })
      return
    }
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method !== "POST" || url.pathname !== "/telegram/webhook") {
      return new Response("not found", { status: 404 })
    }

    if (!verifyWebhookSecret(request, env.TELEGRAM_WEBHOOK_SECRET)) {
      return new Response("unauthorized", { status: 401 })
    }

    let update: TelegramUpdate
    try {
      update = await request.json()
    } catch {
      return new Response("bad request", { status: 400 })
    }

    if (update.callback_query) {
      try {
        await handleCallbackQuery(env, update)
      } catch (err) {
        // A failure here (e.g. the staff_submissions insert itself failing after the
        // confirmation was already consumed) must never vanish silently — the confirmation is
        // gone either way (single-use), so the user needs to know it didn't actually go through.
        console.error("callback_query handling failed:", err)
        const cqMessage = update.callback_query.message
        if (cqMessage) {
          await sendMessage(env.TELEGRAM_BOT_TOKEN, cqMessage.chat.id, "Something went wrong submitting that — please try again.", {
            messageThreadId: cqMessage.message_thread_id,
          }).catch(() => {})
        }
      }
      return new Response("ok")
    }

    const message = update.message
    // Receiving needs photo-only messages through too (Telegram photos carry `caption`, not
    // `text`) — the sales/DM path below still requires text specifically.
    if (!message?.from || (!message.text && !message.photo)) {
      return new Response("ok")
    }

    const fromId = message.from.id
    const chatId = message.chat.id

    // Ops Supergroup: routed by Topic, independent of the owner check below (routing is
    // intent-first/context-first, not identity-first — the owner can also be a mapped staff
    // member and use both capabilities from the same account).
    if (String(chatId) === env.TELEGRAM_OPS_CHAT_ID) {
      const capability = topicCapability(env, message.message_thread_id)
      if (capability && message.message_thread_id !== undefined) {
        try {
          await handleOpsMessage(env, capability, fromId, chatId, message.message_thread_id, update.update_id, {
            text: message.text,
            caption: message.caption,
            photo: message.photo,
          })
        } catch (err) {
          console.error(`ops message handling failed (${capability}):`, err)
          await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Something went wrong — please try again.", {
            messageThreadId: message.message_thread_id,
          })
        }
      }
      return new Response("ok")
    }

    if (!isAllowedOwner(fromId, env.TELEGRAM_OWNER_ID)) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Sorry, this bot isn't set up for your account.")
      return new Response("ok")
    }

    if (!message.text) {
      return new Response("ok")
    }
    const text = message.text.trim()

    if (!SALES_INTENT.test(text)) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "I can currently only answer questions about today's sales (try /sales_today).")
      return new Response("ok")
    }

    try {
      const result = await fetchTodaySalesWithRetry(env.HYPERDRIVE, fromId, update.update_id)
      let reply: string
      try {
        reply = await phraseSalesAnswer(env.ANTHROPIC_API_KEY, result)
      } catch (err) {
        // Claude phrasing failing must never suppress an already-successful answer.
        console.error("claude phrasing failed, using fallback reply:", err)
        reply = fallbackReply(result)
      }
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, reply)
    } catch (err) {
      // Never fabricate a number on failure (AGENT_LAYER_DESIGN.md Section 12).
      console.error("get_today_sales failed after retry:", err)
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        "Couldn't reach sales data right now — please try again in a moment.",
      )
    }

    return new Response("ok")
  },
} satisfies ExportedHandler<Env>
