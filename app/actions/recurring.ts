'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { generateTaskFromTemplate } from '@/lib/recurring'
import type { RecurringTemplate } from '@/types/recurring'

// ── Create a recurring template ──────────────────────────────────────────
export async function createTemplate(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const projectId = formData.get('project_id') as string
  const frequency = (formData.get('frequency') as string) || 'weekly'

  const dowRaw = formData.get('day_of_week') as string
  const domRaw = formData.get('day_of_month') as string

  const payload = {
    project_id: projectId,
    company_id: (formData.get('company_id') as string) || null,
    title: formData.get('title') as string,
    description: (formData.get('description') as string) || null,
    assignee_id: (formData.get('assignee_id') as string) || null,
    frequency,
    day_of_week: (frequency === 'weekly' || frequency === 'fortnightly') && dowRaw !== '' ? parseInt(dowRaw) : null,
    day_of_month: frequency === 'monthly' && domRaw !== '' ? parseInt(domRaw) : null,
    priority: (formData.get('priority') as string) || 'medium',
    time_estimate: formData.get('time_estimate') ? parseInt(formData.get('time_estimate') as string) : null,
    active: true,
  }

  if (!payload.title) return { error: 'Title is required' }

  const { error } = await supabase.from('recurring_task_templates').insert(payload)
  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
}

// ── Toggle active / paused ───────────────────────────────────────────────
export async function toggleTemplate(id: string, active: boolean, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('recurring_task_templates').update({ active }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/projects/${projectId}`)
}

// ── Delete a template ────────────────────────────────────────────────────
export async function deleteTemplate(id: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('recurring_task_templates').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/projects/${projectId}`)
}

// ── Generate a task from a template right now (manual) ───────────────────
export async function generateNow(templateId: string, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: template, error } = await supabase
    .from('recurring_task_templates')
    .select('*')
    .eq('id', templateId)
    .single()
  if (error || !template) return { error: error?.message ?? 'Template not found' }

  try {
    await generateTaskFromTemplate(supabase, template as RecurringTemplate, user.id)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to generate task' }
  }

  revalidatePath(`/projects/${projectId}`)
}
