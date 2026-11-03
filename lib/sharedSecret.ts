import { timingSafeEqual } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'

// Shared-secret checks for routes that have no user session:
//   /api/automation/*  - called by n8n,  `Authorization: Bearer <AUTOMATION_API_SECRET>`
//   /api/intake/*      - website forms,  `X-Intake-Key: <INTAKE_SECRET>` (or ?key=)
// Returns a ready-made error response, or null when the caller is allowed through.

function same(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function requireAutomation(req: NextRequest): NextResponse | null {
  const secret = process.env.AUTOMATION_API_SECRET
  if (!secret) return NextResponse.json({ error: 'Automation API not configured' }, { status: 503 })
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!got || !same(got, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return null
}

export function requireIntakeKey(req: NextRequest): NextResponse | null {
  const secret = process.env.INTAKE_SECRET
  if (!secret) return NextResponse.json({ error: 'Intake not configured' }, { status: 503 })
  const got = req.headers.get('x-intake-key') || req.nextUrl.searchParams.get('key') || ''
  if (!got || !same(got, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return null
}
