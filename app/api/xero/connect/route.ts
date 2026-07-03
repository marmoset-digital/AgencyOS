import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { buildAuthorizeUrl } from '@/lib/xero'

export const runtime = 'nodejs'

function origin(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

// Starts the Xero OAuth flow (admin only). Sets a CSRF state cookie and redirects to Xero.
export async function GET(req: NextRequest) {
  const base = origin(req)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', base))
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.redirect(new URL('/dashboard', base))

  let authUrl: string
  const state = crypto.randomBytes(16).toString('hex')
  try {
    authUrl = buildAuthorizeUrl(`${base}/api/xero/callback`, state)
  } catch {
    // XERO_CLIENT_ID/SECRET not set
    return NextResponse.redirect(new URL('/settings?xero=not_configured', base))
  }

  const res = NextResponse.redirect(authUrl)
  res.cookies.set('xero_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/',
  })
  return res
}
