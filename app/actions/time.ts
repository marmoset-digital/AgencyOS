'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActiveTimer } from '@/types/time'

// Internal helper: write a running timer's elapsed time to time_logs and remove it.
async function commitTimer(supabase: SupabaseClient, timer: ActiveTimer) {
  const startedMs = new Date(timer.started_at).getTime()
  const minutes = Math.max(1, Math.round((Date.now() - startedMs) / 60000))

  await supabase.from('time_logs').insert({
    task_id: timer.task_id ?? null,
    project_id: timer.project_id,
    user_id: timer.user_id,
    duration_minutes: minutes,
    description: timer.description ?? null,
    is_billable: true,
  })

  await supabase.from('active_timers').delete().eq('id', timer.id)
}

// ── Start a timer on a task ─────────────────────────────────
export async function startTimer(taskId: string, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // If a timer is already running for this user, stop & commit it first.
  const { data: existing } = await supabase
    .from('active_timers')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) await commitTimer(supabase, existing as ActiveTimer)

  const { error } = await supabase.from('active_timers').insert({
    user_id: user.id,
    task_id: taskId,
    project_id: projectId,
  })
  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
}

// ── Stop the current user's running timer ───────────────────
export async function stopTimer(projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: timer } = await supabase
    .from('active_timers')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!timer) return { error: 'No running timer' }

  await commitTimer(supabase, timer as ActiveTimer)
  revalidatePath(`/projects/${projectId}`)
}

// ── Log time manually ───────────────────────────────────────
export async function logTime(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const projectId = formData.get('project_id') as string
  const hours = parseInt((formData.get('hours') as string) || '0', 10) || 0
  const mins = parseInt((formData.get('minutes') as string) || '0', 10) || 0
  const duration = hours * 60 + mins
  if (duration <= 0) return { error: 'Enter a duration greater than zero' }

  const payload: Record<string, unknown> = {
    task_id: (formData.get('task_id') as string) || null,
    project_id: projectId,
    user_id: user.id,
    duration_minutes: duration,
    description: (formData.get('description') as string) || null,
    is_billable: formData.get('is_billable') === 'on',
  }
  const loggedAt = formData.get('logged_at') as string
  if (loggedAt) payload.logged_at = loggedAt

  const { error } = await supabase.from('time_logs').insert(payload)
  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
}

// ── Delete a time log ───────────────────────────────────────
export async function deleteTimeLog(id: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('time_logs').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/projects/${projectId}`)
}
