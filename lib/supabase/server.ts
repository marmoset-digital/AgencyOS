import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Request-scoped client: uses the signed-in user's cookies, so RLS applies as that user.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server component — cookies set by middleware
          }
        },
      },
    }
  )
}

// TRUE service-role client — genuinely bypasses RLS. It sends NO cookies/session, so a
// signed-in user's JWT can't override the service-role key. (Building this with
// @supabase/ssr + request cookies — as it used to be — meant the user's JWT overrode the
// service-role key and RLS still applied, silently blocking cross-user/admin writes.)
// Server-only; never expose to the browser. Kept async so existing `await` callers work.
export async function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
