import { NextRequest, NextResponse } from 'next/server'
import { runAutoInvoice } from '@/lib/autoInvoice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Daily cron (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
// Only runs the invoicing when today matches a client's billing day (handled inside).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runAutoInvoice('cron')
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
