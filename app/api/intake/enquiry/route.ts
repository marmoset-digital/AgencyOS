import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireIntakeKey } from '@/lib/sharedSecret'
import { parseSubmission, recordEnquiry } from '@/lib/enquiries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Website enquiry intake. The Gravity Forms Webhooks feed on marmoset.com.au posts each
// Contact form entry here (JSON or form-encoded), with header X-Intake-Key.
// Storing the row fires `enquiry.received`, which n8n picks up from the outbox.

// Light per-IP limit. One container serves the app, so in-memory is enough to stop a
// runaway loop; Gravity Forms' own spam protection handles the rest.
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 20
const hits = new Map<string, { count: number; resetAt: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || h.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k)
    return false
  }
  h.count++
  return h.count > MAX_PER_WINDOW
}

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const type = req.headers.get('content-type') || ''
  try {
    if (type.includes('application/json')) {
      const json = await req.json()
      return json && typeof json === 'object' && !Array.isArray(json) ? json : null
    }
    if (type.includes('form')) {
      const form = await req.formData()
      return Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']))
    }
  } catch {
    return null
  }
  return null
}

export async function POST(req: NextRequest) {
  const denied = requireIntakeKey(req)
  if (denied) return denied

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  if (rateLimited(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await readBody(req)
  if (!body) return NextResponse.json({ error: 'Expected a JSON or form body' }, { status: 400 })

  const parsed = parseSubmission(body, 'website')
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const db = await createAdminClient()
  const result = await recordEnquiry(db, parsed)
  if ('error' in result) {
    console.error('[intake] could not record enquiry:', result.error)
    return NextResponse.json({ error: 'Could not record enquiry' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: result.id, duplicate: result.duplicate })
}
