import { NextRequest, NextResponse } from 'next/server'
import { runTimerReminder } from '@/lib/timerReminder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Cron (see vercel.json): fires 06:00 & 07:00 UTC. Vercel sends
// `Authorization: Bearer $CRON_SECRET`. runTimerReminder only emails when it's
// 17:00 in Melbourne, so exactly one run per day takes effect (DST-safe).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // ?force=1 bypasses the 5pm gate — for testing the email flow any time.
    const force = req.nextUrl.searchParams.get('force') === '1'
    const result = await runTimerReminder(new Date(), force)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
