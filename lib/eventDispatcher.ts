import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'

// Drain the outbox: take the oldest undelivered events that are due, POST each
// to n8n, mark it delivered on success, and back off on failure.
//
// Deliberately sequential. Ordering matters - a workflow that reacts to
// proposal.accepted should not see it before the proposal.sent that preceded
// it - and the volume here is tens of events a day, not thousands a second.

const BATCH_SIZE = 25
// 50 attempts, with backoff capped at an hour, is roughly two days of retrying.
// Long enough to ride out an n8n outage across a weekend without anyone awake;
// short enough that a permanently malformed event eventually stops. An event
// that exhausts its attempts is NEVER deleted - it sits undelivered with its
// last_error, and resetting attempts to 0 puts it back in the queue.
const MAX_ATTEMPTS = 50
const REQUEST_TIMEOUT_MS = 10_000

function adminDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

// 30s, 1m, 2m, 4m, 8m ... capped at 1 hour. After MAX_ATTEMPTS the row is left
// undelivered with its last_error for a human to look at; it is not discarded.
function backoffSeconds(attempts: number): number {
  return Math.min(30 * 2 ** attempts, 3600)
}

export interface DispatchResult {
  scanned: number
  delivered: number
  failed: number
  skipped?: string
}

export async function dispatchEvents(): Promise<DispatchResult> {
  const url = process.env.N8N_WEBHOOK_URL
  const secret = process.env.EVENTS_SIGNING_SECRET
  if (!url || !secret) return { scanned: 0, delivered: 0, failed: 0, skipped: 'not_configured' }

  const db = adminDb()
  const nowIso = new Date().toISOString()

  const { data: rows, error } = await db
    .from('events')
    .select('id, type, entity_type, entity_id, payload, actor_id, created_at, attempts')
    .is('delivered_at', null)
    .lte('next_attempt_at', nowIso)
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) throw new Error(`events: could not read outbox - ${error.message}`)
  if (!rows?.length) return { scanned: 0, delivered: 0, failed: 0 }

  let delivered = 0
  let failed = 0

  for (const row of rows) {
    const body = JSON.stringify({
      id: row.id,
      type: row.type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      payload: row.payload,
      actorId: row.actor_id,
      createdAt: row.created_at,
    })
    // HMAC over the exact bytes sent, so n8n can verify the request really came
    // from us. n8n recomputes this and compares before acting on anything.
    const signature = createHmac('sha256', secret).update(body).digest('hex')

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AgencyOS-Event': row.type,
          'X-AgencyOS-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`n8n responded ${res.status}: ${(await res.text()).slice(0, 300)}`)

      await db.from('events').update({ delivered_at: new Date().toISOString(), last_error: null }).eq('id', row.id)
      delivered++
    } catch (e) {
      const attempts = (row.attempts ?? 0) + 1
      const nextAt = new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString()
      await db
        .from('events')
        .update({
          attempts,
          next_attempt_at: nextAt,
          last_error: e instanceof Error ? e.message.slice(0, 1000) : 'dispatch failed',
        })
        .eq('id', row.id)
      failed++
    }
  }

  return { scanned: rows.length, delivered, failed }
}
