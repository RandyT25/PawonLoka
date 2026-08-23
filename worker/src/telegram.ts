export interface TelegramPhotoSize {
  file_id: string
  width: number
  height: number
}

export interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: { id: number; is_bot: boolean; first_name: string; username?: string }
    chat: { id: number; type: string }
    text?: string
    caption?: string
    photo?: TelegramPhotoSize[]
    date: number
    message_thread_id?: number
    is_topic_message?: boolean
  }
  callback_query?: {
    id: string
    from: { id: number; is_bot: boolean; first_name: string; username?: string }
    message?: {
      message_id: number
      chat: { id: number; type: string }
      message_thread_id?: number
    }
    data?: string
  }
}

export interface InlineKeyboardButton {
  text: string
  callback_data: string
}

export type InlineKeyboardMarkup = { inline_keyboard: InlineKeyboardButton[][] }

interface SendOptions {
  messageThreadId?: number
  replyMarkup?: InlineKeyboardMarkup
}

async function callTelegram(botToken: string, method: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`telegram ${method} failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

export async function sendMessage(botToken: string, chatId: number, text: string, opts: SendOptions = {}): Promise<{ message_id: number }> {
  const body: Record<string, unknown> = { chat_id: chatId, text }
  if (opts.messageThreadId !== undefined) body.message_thread_id = opts.messageThreadId
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup
  const json = (await callTelegram(botToken, "sendMessage", body)) as { result: { message_id: number } }
  return json.result
}

export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  opts: { text?: string; showAlert?: boolean } = {},
): Promise<void> {
  await callTelegram(botToken, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: opts.text,
    show_alert: opts.showAlert ?? false,
  })
}

export async function editMessageReplyMarkup(
  botToken: string,
  chatId: number,
  messageId: number,
  replyMarkup: InlineKeyboardMarkup | null,
): Promise<void> {
  await callTelegram(botToken, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup ?? { inline_keyboard: [] },
  })
}

// The only thing standing between the public internet and this Worker's webhook route, since
// Workers are open-by-default on their routes — Telegram echoes this header back on every
// webhook delivery once set via setWebhook's secret_token param.
export function verifyWebhookSecret(request: Request, expected: string): boolean {
  const header = request.headers.get("x-telegram-bot-api-secret-token")
  return header === expected
}
