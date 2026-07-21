'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Ticket file attachments.
//
// Upload flow (public portal): the browser asks for a signed upload URL, which we
// only issue after validating the support token AND that the ticket belongs to that
// company. The browser then uploads straight to Supabase Storage with that one-shot
// token, and finally calls attachFileToTicket() to record the row. Nothing large ever
// passes through a serverless function.

const BUCKET = 'ticket-attachments'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB — keep in sync with the bucket limit
const DOWNLOAD_TTL = 60 * 60 // signed download URLs live 1 hour

const ALLOWED_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
])

// NOTE: a 'use server' file may ONLY export async functions. Do not export
// constants from here — it builds fine but throws at runtime
// ("A 'use server' file can only export async functions"). Shared constants
// live in lib/attachmentsClient.ts. Type exports are fine; they're erased.
export type Attachment = {
  id: string
  name: string
  size: number | null
  type: string | null
  url: string | null
  createdAt: string
}

function safeName(name: string): string {
  const cleaned = name.replace(/[^\w.\- ]+/g, '_').trim()
  return (cleaned.length > 120 ? cleaned.slice(cleaned.length - 120) : cleaned) || 'file'
}

async function companyForToken(token: string) {
  const adminDb = await createAdminClient()
  const { data } = await adminDb
    .from('companies')
    .select('id, name')
    .eq('support_token', token)
    .maybeSingle()
  return { adminDb, company: data }
}

const TYPE_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', heic: 'image/heic', svg: 'image/svg+xml',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain', csv: 'text/csv',
  zip: 'application/zip',
}

// NOT exported - a 'use server' file may only export async functions.
function resolveType(name: string, type: string): string {
  if (type && ALLOWED_TYPES.has(type)) return type
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return TYPE_BY_EXT[ext] ?? type
}

function validate(file: { name: string; size: number; type: string }): string | null {
  if (!file?.name) return 'Missing file name.'
  if (!file.size || file.size <= 0) return 'That file appears to be empty.'
  if (file.size > MAX_BYTES) return `That file is too large — the limit is ${Math.floor(MAX_BYTES / 1024 / 1024)}MB.`
  if (!ALLOWED_TYPES.has(resolveType(file.name, file.type))) {
    return `That file type isn’t supported (detected: ${file.type || 'unknown'}).`
  }
  return null
}

// ── Public portal (token-scoped) ─────────────────────────────────────────────

export async function createTicketUploadUrl(
  token: string,
  ticketId: string,
  file: { name: string; size: number; type: string },
) {
  const { adminDb, company } = await companyForToken(token)
  if (!company) return { error: 'This support link is not valid.' }

  const bad = validate(file)
  if (bad) return { error: bad }

  const { data: ticket } = await adminDb
    .from('support_tickets')
    .select('id, company_id')
    .eq('id', ticketId)
    .maybeSingle()
  if (!ticket || ticket.company_id !== company.id) return { error: 'That ticket could not be found.' }

  const path = `${company.id}/${ticketId}/${crypto.randomUUID()}-${safeName(file.name)}`
  const { data, error } = await adminDb.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) return { error: `Storage: ${error?.message ?? 'could not start the upload.'}` }

  return { ok: true as const, path, uploadToken: data.token }
}

export async function attachFileToTicket(
  token: string,
  ticketId: string,
  file: { path: string; name: string; size: number; type: string },
) {
  const { adminDb, company } = await companyForToken(token)
  if (!company) return { error: 'This support link is not valid.' }

  // The path is minted by us above — re-check it belongs to this company + ticket.
  if (!file.path.startsWith(`${company.id}/${ticketId}/`)) return { error: 'Invalid upload path.' }

  const { error } = await adminDb.from('files').insert({
    company_id: company.id,
    ticket_id: ticketId,
    name: safeName(file.name),
    storage_path: file.path,
    file_type: file.type || null,
    file_size: file.size || null,
  })
  if (error) return { error: error.message }

  revalidatePath(`/support/${token}`)
  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true as const }
}

export async function listTicketAttachmentsPublic(token: string, ticketId: string) {
  const { adminDb, company } = await companyForToken(token)
  if (!company) return { error: 'This support link is not valid.' }

  const { data: rows, error } = await adminDb
    .from('files')
    .select('id, name, file_size, file_type, storage_path, created_at')
    .eq('ticket_id', ticketId)
    .eq('company_id', company.id)
    .order('created_at', { ascending: true })
  if (error) return { error: error.message }

  return { ok: true as const, attachments: await sign(adminDb, rows ?? []) }
}

// ── Team side (authenticated; RLS on files enforces team membership) ─────────

export async function listTicketAttachmentsTeam(ticketId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { data: rows, error } = await supabase
    .from('files')
    .select('id, name, file_size, file_type, storage_path, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
  if (error) return { error: error.message }

  const adminDb = await createAdminClient()
  return { ok: true as const, attachments: await sign(adminDb, rows ?? []) }
}

// ── shared ───────────────────────────────────────────────────────────────────

type Row = {
  id: string
  name: string
  file_size: number | null
  file_type: string | null
  storage_path: string | null
  created_at: string
}

async function sign(
  adminDb: Awaited<ReturnType<typeof createAdminClient>>,
  rows: Row[],
): Promise<Attachment[]> {
  const paths = rows.map(r => r.storage_path).filter((p): p is string => !!p)
  const urlByPath = new Map<string, string>()

  if (paths.length > 0) {
    const { data } = await adminDb.storage.from(BUCKET).createSignedUrls(paths, DOWNLOAD_TTL)
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl)
    }
  }

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    size: r.file_size,
    type: r.file_type,
    url: r.storage_path ? urlByPath.get(r.storage_path) ?? null : null,
    createdAt: r.created_at,
  }))
}
