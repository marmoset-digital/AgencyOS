'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  listTicketAttachmentsPublic,
  listTicketAttachmentsTeam,
  type Attachment,
} from '@/app/actions/attachments'
import { uploadFilesToTicket, formatBytes, MAX_UPLOAD_MB } from '@/lib/attachmentsClient'

// Attachment list for a ticket, with optional upload.
//   token given  → public support portal (client-side, token-scoped)
//   token absent → team view (authenticated; RLS enforces team membership)
// Download links are short-lived signed URLs generated server-side.
export default function TicketAttachments({
  ticketId,
  token,
  canUpload = false,
  compact = false,
}: {
  ticketId: string
  token?: string
  canUpload?: boolean
  compact?: boolean
}) {
  const [items, setItems] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const load = useCallback(async () => {
    const res = token
      ? await listTicketAttachmentsPublic(token, ticketId)
      : await listTicketAttachmentsTeam(ticketId)
    if ('attachments' in res && res.attachments) setItems(res.attachments)
    setLoading(false)
  }, [ticketId, token])

  useEffect(() => {
    void load()
  }, [load])

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // allow re-picking the same file
    if (!files.length || !token) return

    setErrors([])
    setBusy(true)
    setProgress({ done: 0, total: files.length })
    const errs = await uploadFilesToTicket(token, ticketId, files, (done, total) =>
      setProgress({ done, total }),
    )
    setErrors(errs)
    setBusy(false)
    setProgress(null)
    await load()
  }

  if (loading && items.length === 0 && !canUpload) return null

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map(a => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <span aria-hidden="true">{a.type?.startsWith('image/') ? '🖼️' : '📎'}</span>
              {a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#254DA5] hover:underline break-all"
                >
                  {a.name}
                </a>
              ) : (
                <span className="text-gray-500 break-all">{a.name}</span>
              )}
              {a.size ? <span className="text-xs text-gray-400">{formatBytes(a.size)}</span> : null}
            </li>
          ))}
        </ul>
      )}

      {canUpload && token && (
        <div>
          <label className="inline-flex items-center gap-2 text-xs text-[#254DA5] hover:underline cursor-pointer">
            <input type="file" multiple onChange={onPick} disabled={busy} className="hidden" />
            <span>📎 {busy ? 'Uploading…' : 'Attach files'}</span>
          </label>
          <span className="ml-2 text-xs text-gray-400">
            Images, PDFs, documents · up to {MAX_UPLOAD_MB}MB each
          </span>
          {progress && (
            <p className="text-xs text-gray-500 mt-1">
              Uploading {progress.done} of {progress.total}…
            </p>
          )}
          {errors.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {errors.map((msg, i) => (
                <li key={i} className="text-xs text-red-600">{msg}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
