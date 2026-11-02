import { NextRequest, NextResponse } from 'next/server'
import { dispatchEvents } from '@/lib/eventDispatcher'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Drains the event outbox to n8n. Same CRON_SECRET guard as the other two cron
// routes. Safe to call as often as you like - it is a no-op when the outbox is
// empty, and it takes only rows that are due.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await dispatchEvents()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
