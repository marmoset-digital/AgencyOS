// Canonical public origin for client-facing links (e.g. approval links a client opens).
// Prefers NEXT_PUBLIC_SITE_URL so links always point at the right place regardless of which
// deployment they were created on. Falls back to the current origin in the browser.
//
// Config: set NEXT_PUBLIC_SITE_URL on the *Production* environment in Vercel (e.g.
// https://app.marmoset.com.au). Leave it unset on Preview so preview testing self-references.
export function siteOrigin(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL
  if (env) return env.replace(/\/+$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export function approvalLink(token: string): string {
  return `${siteOrigin()}/approve/${token}`
}
