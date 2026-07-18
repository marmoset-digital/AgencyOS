'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

// ── Create Project ──────────────────────────────────────────
// ── Archive / restore ─────────────────────────────────────────────
// Never hard-deleted: projects cascade to tasks, time logs, members and files.
export async function archiveProject(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('projects').update({ archived_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  return { ok: true as const }
}

export async function unarchiveProject(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('projects').update({ archived_at: null }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  return { ok: true as const }
}

export async function createProject(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const payload = {
    company_id: formData.get('company_id') as string,
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
    type: (formData.get('type') as string) || 'project',
    stage: (formData.get('stage') as string) || 'quote_sent',
    start_date: (formData.get('start_date') as string) || null,
    end_date: (formData.get('end_date') as string) || null,
    monthly_hours_cap: formData.get('monthly_hours_cap') ? parseInt(formData.get('monthly_hours_cap') as string) : null,
    monthly_tasks_cap: formData.get('monthly_tasks_cap') ? parseInt(formData.get('monthly_tasks_cap') as string) : null,
    assigned_to: (formData.get('assigned_to') as string) || null,
    created_by: user.id,
  }

  if (!payload.company_id || !payload.name) {
    return { error: 'Company and project name are required' }
  }

  const { data, error } = await supabase
    .from('projects')
    .insert(payload)
    .select('id')
    .single()

  if (error) return { error: error.message }

  redirect(`/projects/${data.id}`)
}

// ── Update Project ──────────────────────────────────────────
export async function updateProject(id: string, formData: FormData) {
  const supabase = await createClient()

  const payload = {
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
    type: formData.get('type') as string,
    stage: formData.get('stage') as string,
    start_date: (formData.get('start_date') as string) || null,
    end_date: (formData.get('end_date') as string) || null,
    monthly_hours_cap: formData.get('monthly_hours_cap') ? parseInt(formData.get('monthly_hours_cap') as string) : null,
    monthly_tasks_cap: formData.get('monthly_tasks_cap') ? parseInt(formData.get('monthly_tasks_cap') as string) : null,
    assigned_to: (formData.get('assigned_to') as string) || null,
  }

  const { error } = await supabase.from('projects').update(payload).eq('id', id)
  if (error) return { error: error.message }

  redirect(`/projects/${id}`)
}

// ── Update Project Stage (quick action) ─────────────────────
export async function updateProjectStage(id: string, stage: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('projects').update({ stage }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/projects/${id}`)
  revalidatePath('/projects')
}

// ── Create Task ─────────────────────────────────────────────
export async function createTask(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const projectId = formData.get('project_id') as string
  const payload = {
    project_id: projectId,
    company_id: (formData.get('company_id') as string) || null,
    title: formData.get('title') as string,
    description: (formData.get('description') as string) || null,
    assignee_id: (formData.get('assignee_id') as string) || null,
    due_date: (formData.get('due_date') as string) || null,
    priority: (formData.get('priority') as string) || 'medium',
    status: 'todo',
    time_estimate: formData.get('time_estimate') ? parseInt(formData.get('time_estimate') as string) : null,
    requires_approval: formData.get('requires_approval') === 'on',
    created_by: user.id,
  }

  if (!payload.title) return { error: 'Task title is required' }

  const { error } = await supabase.from('tasks').insert(payload)
  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
}

// ── Update Task Status ──────────────────────────────────────
export async function updateTaskStatus(taskId: string, status: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId)
  if (error) return { error: error.message }
  revalidatePath(`/projects/${projectId}`)
}

// ── Update Task ─────────────────────────────────────────────
export async function updateTask(taskId: string, projectId: string, formData: FormData) {
  const supabase = await createClient()

  const payload = {
    title: formData.get('title') as string,
    description: (formData.get('description') as string) || null,
    assignee_id: (formData.get('assignee_id') as string) || null,
    due_date: (formData.get('due_date') as string) || null,
    priority: (formData.get('priority') as string) || 'medium',
    status: (formData.get('status') as string) || 'todo',
    time_estimate: formData.get('time_estimate') ? parseInt(formData.get('time_estimate') as string) : null,
  }

  const { error } = await supabase.from('tasks').update(payload).eq('id', taskId)
  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
  redirect(`/projects/${projectId}`)
}

// ── Delete Task ─────────────────────────────────────────────
export async function deleteTask(taskId: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) return { error: error.message }
  revalidatePath(`/projects/${projectId}`)
}
