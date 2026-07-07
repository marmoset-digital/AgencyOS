'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const ROLES = ['admin', 'team_member', 'intern'] as const
type Role = (typeof ROLES)[number]

type Result = { ok?: true; message?: string; error?: string }

// Confirm the caller is a signed-in admin. Returns the caller's id on success.
async function requireAdmin(): Promise<{ callerId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return { error: 'Admins only.' }
  return { callerId: user.id }
}

// Count active admins other than the given user — used to prevent locking out
// the last admin when demoting or deactivating someone.
async function otherActiveAdmins(adminDb: Awaited<ReturnType<typeof createAdminClient>>, exceptId: string) {
  const { count } = await adminDb
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true)
    .neq('id', exceptId)
  return count ?? 0
}

export async function inviteUser(formData: FormData): Promise<Result> {
  const gate = await requireAdmin()
  if ('error' in gate) return { error: gate.error }

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const full_name = String(formData.get('full_name') ?? '').trim()
  const role = String(formData.get('role') ?? 'team_member') as Role

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' }
  if (!full_name) return { error: 'Enter the person’s name.' }
  if (!ROLES.includes(role)) return { error: 'Pick a valid role.' }

  const adminDb = await createAdminClient()

  // Send the Supabase invite email (built-in mailer). The invitee sets their own
  // password via the link — we never see or handle it.
  const { data, error } = await adminDb.auth.admin.inviteUserByEmail(email, {
    data: { full_name, role },
  })
  if (error) {
    const msg = /already been registered|already exists/i.test(error.message)
      ? 'That email already has an account.'
      : error.message
    return { error: msg }
  }

  const newId = data.user?.id
  if (newId) {
    // Guarantee the public.users row has the correct name/role/email regardless of
    // what the on-signup trigger populated. Upsert bypasses RLS (service role).
    const { error: upErr } = await adminDb
      .from('users')
      .upsert({ id: newId, email, full_name, role, is_active: true }, { onConflict: 'id' })
    if (upErr) return { error: `Invited, but profile save failed: ${upErr.message}` }
  }

  revalidatePath('/team')
  return { ok: true, message: `Invite sent to ${email}.` }
}

export async function updateUserRole(userId: string, role: string): Promise<Result> {
  const gate = await requireAdmin()
  if ('error' in gate) return { error: gate.error }
  if (!ROLES.includes(role as Role)) return { error: 'Invalid role.' }

  const adminDb = await createAdminClient()

  // Guard: don't demote the last remaining active admin.
  const { data: target } = await adminDb.from('users').select('role, is_active').eq('id', userId).single()
  if (target?.role === 'admin' && role !== 'admin' && target.is_active) {
    if ((await otherActiveAdmins(adminDb, userId)) === 0) {
      return { error: 'Can’t change this role — they’re the only active admin.' }
    }
  }

  const { error } = await adminDb.from('users').update({ role }).eq('id', userId)
  if (error) return { error: error.message }
  revalidatePath('/team')
  return { ok: true }
}

export async function updateUserName(userId: string, full_name: string): Promise<Result> {
  const gate = await requireAdmin()
  if ('error' in gate) return { error: gate.error }
  const name = full_name.trim()
  if (!name) return { error: 'Name can’t be empty.' }

  const adminDb = await createAdminClient()
  const { error } = await adminDb.from('users').update({ full_name: name }).eq('id', userId)
  if (error) return { error: error.message }
  revalidatePath('/team')
  return { ok: true }
}

export async function setUserActive(userId: string, active: boolean): Promise<Result> {
  const gate = await requireAdmin()
  if ('error' in gate) return { error: gate.error }

  if (!active && userId === gate.callerId) return { error: 'You can’t deactivate yourself.' }

  const adminDb = await createAdminClient()

  if (!active) {
    // Guard: don't deactivate the last active admin.
    const { data: target } = await adminDb.from('users').select('role').eq('id', userId).single()
    if (target?.role === 'admin' && (await otherActiveAdmins(adminDb, userId)) === 0) {
      return { error: 'Can’t deactivate the only active admin.' }
    }
  }

  // Block/unblock the login, then flip the profile flag.
  const { error: banErr } = await adminDb.auth.admin.updateUserById(userId, {
    ban_duration: active ? 'none' : '876000h',
  })
  if (banErr) return { error: banErr.message }

  const { error } = await adminDb.from('users').update({ is_active: active }).eq('id', userId)
  if (error) return { error: error.message }
  revalidatePath('/team')
  return { ok: true }
}
