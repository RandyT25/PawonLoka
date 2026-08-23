import Anthropic from "@anthropic-ai/sdk"

// Claude's only job here is phrasing an already-computed result (AGENT_LAYER_DESIGN.md Section 12:
// Claude never runs the query, never sees a DB credential, never does the arithmetic). A cheap
// model is enough for single-field phrasing — see the design doc's cost-minimization guidance.
const MODEL = "claude-haiku-4-5-20251001"

export interface SalesPhrasingInput {
  total: number
  orderCount: number
  date: string
}

export async function phraseSalesAnswer(apiKey: string, data: SalesPhrasingInput): Promise<string> {
  const client = new Anthropic({ apiKey })
  const formattedTotal = `Rp ${data.total.toLocaleString("id-ID")}`
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content:
          `Phrase this as a short, natural reply to "what were sales today?" for a restaurant ` +
          `owner on Telegram. Data: total revenue ${formattedTotal} from ${data.orderCount} paid ` +
          `orders, for ${data.date} (WITA timezone). Always include a brief caveat that this may ` +
          `be a lower bound if any POS device has been offline and hasn't synced its orders yet. ` +
          `Keep it to 2-3 sentences. Plain text only, no markdown formatting.`,
      },
    ],
  })
  const textBlock = msg.content.find((block) => block.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("claude response had no text content")
  }
  return textBlock.text
}

export interface ReceivingExtraction {
  supplier_guess: string
  items: { name: string; qty: number; unit: string; unit_cost: number }[]
  invoice_total?: number
}

// Step D — real vision extraction, replacing the Step C stub now that Anthropic billing is
// confirmed working (2026-08-19). Sonnet, not Haiku — every other extraction in this bot uses
// Haiku (cost-minimization default), but invoice/scale-photo OCR is explicitly flagged in
// AGENT_LAYER_DESIGN.md as "the lowest-confidence extraction in the whole catalog" and
// "genuinely unvalidated on real Indonesian supplier notas" — see the implementation plan for
// why this one call gets the stronger model.
//
// Photos in practice aren't always formal printed invoices — confirmed live: real test photos
// were a digital scale display + the raw ingredient next to it (weight + item name, no visible
// price or supplier). The prompt and schema below treat supplier/price as optional so a
// scale-only photo still extracts usefully (qty/unit/name), rather than forcing a bad guess for
// fields that genuinely aren't in the frame — Claude should say so, not fabricate.
const VISION_MODEL = "claude-sonnet-5"

const RECEIVING_TOOL = {
  name: "record_receiving_extraction",
  description:
    "Record what was read from a receiving photo (a printed invoice/nota, OR a digital scale " +
    "display next to the item being weighed, OR both). Only report what is actually visible — " +
    "never guess a supplier name, price, or quantity that isn't legible in the photo.",
  input_schema: {
    type: "object" as const,
    properties: {
      supplier_guess: {
        type: "string",
        description: "Supplier/vendor name if visible on a printed invoice. Empty string if not visible (e.g. a scale-only photo).",
      },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Ingredient/product name as written or visually identifiable" },
            qty: { type: "number", description: "Quantity/weight as shown (e.g. the scale reading)" },
            unit: { type: "string", description: "Unit as shown or implied (kg, gr, pcs, pack, etc.)" },
            unit_cost: { type: "number", description: "Price per unit if visible on an invoice line; 0 if no price is visible" },
          },
          required: ["name", "qty", "unit", "unit_cost"],
        },
      },
      invoice_total: { type: "number", description: "Total invoice amount if visible; omit entirely if not shown" },
    },
    required: ["supplier_guess", "items"],
  },
}

function toBase64(bytes: Uint8Array): string {
  // btoa expects a binary string, not raw bytes — build it in chunks to avoid a call-stack
  // blowout on large images (String.fromCharCode(...bytes) can exceed argument limits).
  let binary = ""
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export async function extractReceivingReport(apiKey: string, imageBytes: Uint8Array, mediaType: string): Promise<ReceivingExtraction> {
  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 1024,
    tools: [RECEIVING_TOOL],
    tool_choice: { type: "tool", name: "record_receiving_extraction" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: toBase64(imageBytes) },
          },
          {
            type: "text",
            text:
              "Extract the receiving details from this photo (invoice/nota, a scale display with the " +
              "item, or both). Call record_receiving_extraction with exactly what's visible — leave " +
              "supplier_guess empty and unit_cost as 0 for anything not actually shown, rather than guessing.",
          },
        ],
      },
    ],
  })

  const toolUse = msg.content.find((block) => block.type === "tool_use")
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("claude vision response had no tool_use content")
  }
  return toolUse.input as ReceivingExtraction
}
