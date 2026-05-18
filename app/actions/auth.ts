'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signIn(formData: FormData) {
  try {
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      return { error: error.message }
    }

    redirect('/dashboard')
  } catch (e: any) {
    // Allow Next.js redirects to pass through
    if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
    return { error: e?.message ?? 'Unable to connect. Please try again.' }
  }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
