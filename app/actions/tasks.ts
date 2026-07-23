'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ── Create a standalone (internal) task — no project, no client ──────────
export async function createStandaloneTask(formData: FormData): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  const title = ((formData.get('title') as string) || '').trim()
  if (!title) return { error: 'Task title is required.' }
  const { error } = await supabase.from('tasks').insert({
    project_id: null,
    company_id: null,
    title,
    description: ((formData.get('description') as string) || '').trim() || null,
    assignee_id: (formData.get('assignee_id') as string) || null,
    due_date: (formData.get('due_date') as string) || null,
    priority: (formData.get('priority') as string) || 'medium',
    status: 'todo',
    created_by: user.id,
  })
  if (error) return { error: error.message }
  revalidatePath('/tasks')
  return { ok: true }
}

// ── Edit an existing task (inline; revalidates, no redirect) ─────────────
export async function editTask(taskId: string, projectId: string, formData: FormData) {
  const supabase = await createClient()

  const payload = {
    title: formData.get('title') as string,
    description: (formData.get('description') as string) || null,
    assignee_id: (formData.get('assignee_id') as string) || null,
    due_date: (formData.get('due_date') as string) || null,
    priority: (formData.get('priority') as string) || 'medium',
    status: (formData.get('status') as string) || 'todo',
    time_estimate: formData.get('time_estimate') ? parseInt(formData.get('time_estimate') as string) : null,
    requires_approval: formData.get('requires_approval') === 'on',
  }

  if (!payload.title) return { error: 'Task title is required' }

  const { error } = await supabase.from('tasks').update(payload).eq('id', taskId)
  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
}

// ── Subtasks ────────────────────────────────────────────────────────────
export async function addSubtask(taskId: string, projectId: string, title: string) {
  const supabase = await createClient()
  const clean = (title ?? '').trim()
  if (!clean) return { error: 'Subtask title is required' }

  const { error } = await supabase.from('subtasks').insert({ task_id: taskId, title: clean })
  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
}

export async function toggleSubtask(id: string, completed: boolean, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('subtasks').update({ completed }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteSubtask(id: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('subtasks').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/projects/${projectId}`)
}
