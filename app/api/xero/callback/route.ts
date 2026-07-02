import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens, getConnections, saveConnection } from '@/lib/xero'

export const runtime = 'nodejs'

function origin(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

// Xero redirects here with ?code&state. Verify state, swap code for tokens, store connection.
export async function GET(req: NextRequest) {
  const base = origin(req)
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  const back = (status: string) => NextResponse.redirect(new URL(`/settings?xero=${status}`, base))

  if (oauthError) return back('error')

  const cookieState = req.cookies.get('xero_oauth_state')?.value
  if (!code || !state || !cookieState || state !== cookieState) return back('state_error')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  try {
    const t = await exchangeCodeForTokens(code, `${base}/api/xero/callback`)
    const conns = await getConnections(t.access_token)
    if (!conns.length) return back('no_org')
    const c = conns[0] // one Marmoset org
    await saveConnection({
      tenantId: c.tenantId,
      tenantName: c.tenantName,
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresIn: t.expires_in,
      connectedBy: user?.id ?? null,
    })
  } catch {
    return back('error')
  }

  const res = back('connected')
  res.cookies.delete('xero_oauth_state')
  return res
}
