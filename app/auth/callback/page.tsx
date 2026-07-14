'use client'

// Handles Supabase invite + password-recovery links. Supabase redirects here with the
// session in the URL hash (#access_token=…&type=invite|recovery). We set the session,
// let the user choose a password, then send them to the dashboard.
// Public route — must be listed in proxy.ts publicRoutes.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

type Status = 'loading' | 'ready' | 'invalid'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ),
  )

  const [status, setStatus] = useState<Status>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Capture the hash immediately (before anything can clear it).
    const rawHash = typeof window !== 'undefined' && window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : ''
    const params = new URLSearchParams(rawHash)
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    const hashError = params.get('error_description') || params.get('error')

    ;(async () => {
      if (hashError) { setStatus('invalid'); return }
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (error) { setStatus('invalid'); return }
        setStatus('ready')
        // tidy the URL (drop the tokens from the address bar)
        if (typeof window !== 'undefined') window.history.replaceState(null, '', '/auth/callback')
        return
      }
      // No tokens in the URL — maybe the client already picked up the session.
      const { data } = await supabase.auth.getSession()
      setStatus(data.session ? 'ready' : 'invalid')
    })()
  }, [supabase])

  async function submit() {
    setError(null)
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('The two passwords don’t match.'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setSaving(false); return }
    setDone(true)
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-[#254DA5] font-bold text-xs tracking-widest uppercase">Marmoset Digital</div>
          <div className="text-gray-900 font-bold text-lg leading-tight">Agency OS</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          {status === 'loading' && (
            <p className="text-sm text-gray-500 text-center">Checking your link…</p>
          )}

          {status === 'invalid' && (
            <div className="text-center">
              <h1 className="text-lg font-semibold text-gray-900 mb-1">Link not valid</h1>
              <p className="text-sm text-gray-500 mb-4">This invite or reset link is invalid or has expired. Ask an admin to send you a new one.</p>
              <a href="/login" className="text-sm font-medium text-[#254DA5] hover:underline">Go to sign in</a>
            </div>
          )}

          {status === 'ready' && (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-1">Set your password</h1>
              <p className="text-sm text-gray-500 mb-5">Choose a password to finish setting up your Agency OS account.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" className="input w-full" autoComplete="new-password" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter your password" className="input w-full" autoComplete="new-password"
                    onKeyDown={e => { if (e.key === 'Enter') submit() }} />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button onClick={submit} disabled={saving || done} className="w-full bg-[#254DA5] hover:bg-[#1E3D84] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition disabled:opacity-50">
                  {done ? 'Signing you in…' : saving ? 'Saving…' : 'Set password & continue'}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">Marmoset Digital Media · Agency OS</p>
      </div>
    </div>
  )
}
