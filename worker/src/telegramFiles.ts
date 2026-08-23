import type { TelegramPhotoSize } from "./telegram"

export interface DownloadedFile {
  bytes: Uint8Array
  contentType: string
}

export async function downloadTelegramFile(botToken: string, fileId: string): Promise<DownloadedFile> {
  const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
  if (!infoRes.ok) throw new Error(`telegram getFile failed: ${infoRes.status} ${await infoRes.text()}`)
  const info = (await infoRes.json()) as { ok: boolean; result?: { file_path: string } }
  if (!info.ok || !info.result) throw new Error("telegram getFile returned not ok")

  const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${info.result.file_path}`)
  if (!fileRes.ok) throw new Error(`telegram file download failed: ${fileRes.status}`)
  const bytes = new Uint8Array(await fileRes.arrayBuffer())
  // Telegram's file-download endpoint often returns a generic application/octet-stream content-
  // type rather than a real image MIME type (confirmed live, 2026-08-19 — an uploaded photo
  // served back as octet-stream, which risks a browser refusing to render it in an <img> tag).
  // Telegram always re-encodes message.photo as JPEG, so trust that over an unhelpful header.
  const rawContentType = fileRes.headers.get("content-type") || ""
  const contentType = rawContentType.startsWith("image/") ? rawContentType : "image/jpeg"
  return { bytes, contentType }
}

// Telegram sends message.photo as an array of the same image at several sizes it already
// generated — pick the largest rather than re-compressing ourselves; there's no DOM/canvas in a
// Worker to do that anyway (unlike ClockInOutModal.jsx's browser-side compression).
export function largestPhoto(sizes: TelegramPhotoSize[]): TelegramPhotoSize | undefined {
  return sizes.reduce((best, s) => (!best || s.width * s.height > best.width * best.height ? s : best), undefined as TelegramPhotoSize | undefined)
}
