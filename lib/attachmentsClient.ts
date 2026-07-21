'use client'

import { createClient } from '@/lib/supabase/client'
import { createTicketUploadUrl, attachFileToTicket } from '@/app/actions/attachments'

// Browser-side upload helper for ticket attachments.
//
// Per file: ask the server for a one-shot signed upload URL (it validates the support
// token and the ticket first), upload straight to Supabase Storage, then record the
// row. Large files never pass through a serverless function.
//
// Returns a list of human-readable errors — empty means everything uploaded.

export const BUCKET = 'ticket-attachments'
export const MAX_UPLOAD_MB = 25

export const ACCEPT_ATTR =
  '.png,.jpg,.jpeg,.gif,.webp,.svg,.heic,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip'

export const ALLOWED_LABEL =
  'PNG, JPG, GIF, WEBP, SVG, HEIC · PDF, Word, Excel · TXT, CSV, ZIP'

export function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export async function uploadFilesToTicket(
  token: string,
  ticketId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const errors: string[] = []
  const supabase = createClient()

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const meta = { name: file.name, size: file.size, type: file.type }

    const signed = await createTicketUploadUrl(token, ticketId, meta)
    if ('error' in signed) {
      errors.push(`${file.name}: ${signed.error}`)
      onProgress?.(i + 1, files.length)
      continue
    }

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .uploadToSignedUrl(signed.path, signed.uploadToken, file, { contentType: file.type })
    if (upErr) {
      errors.push(`${file.name}: ${upErr.message}`)
      onProgress?.(i + 1, files.length)
      continue
    }

    const recorded = await attachFileToTicket(token, ticketId, { path: signed.path, ...meta })
    if ('error' in recorded) errors.push(`${file.name}: ${recorded.error}`)

    onProgress?.(i + 1, files.length)
  }

  return errors
}
