'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Reusable project templates: capture a real project's task list once, then lay it
// back down on a new project with dates recalculated from that project's start date.

export type TemplateTask = {
  title: string
  description: string | null
  priority: string
  time_estimate: number | null
  /** Days from the new project's start date. null = no due date. */
  due_offset_days: number | null
}

export type TemplateContent = {
  type: string | null
  tasks: TemplateTask[]
}

type Result = { ok?: true; id?: string; error?: string }

const PRIORITIES = ['high', 'medium', 'low']

function dayDiff(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z').getTime()
  const b = new Date(to + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86400000)
}

function addDays(from: string, days: number): string {
  const d = new Date(from + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Normalise whatever is in `content` — templates are hand-editable, so never trust
// the shape. Not exported: a 'use server' file's exports become callable endpoints,
// and this is internal.
function parseTemplateContent(raw: unknown): TemplateContent {
  const c = (raw ?? {}) as Record<string, unknown>
  const rawTasks = Array.isArray(c.tasks) ? c.tasks : []
  const tasks: TemplateTask[] = []
  for (const t of rawTasks as Record<string, unknown>[]) {
    const title = typeof t?.title === 'string' ? t.title.trim() : ''
    if (!title) continue
    const priority = typeof t.priority === 'string' && PRIORITIES.includes(t.priority) ? t.priority : 'medium'
    const est = Number(t.time_estimate)
    const off = Number(t.due_offset_days)
    tasks.push({
      title,
      description: typeof t.description === 'string' && t.description.trim() ? t.description.trim() : null,
      priority,
      time_estimate: Number.isFinite(est) && est > 0 ? Math.round(est) : null,
      due_offset_days: Number.isFinite(off) ? Math.round(off) : null,
    })
  }
  return { type: typeof c.type === 'string' ? c.type : null, tasks }
}

/**
 * Capture an existing project as a template.
 * Due dates become offsets from the project's start date (falling back to the
 * earliest task due date), so the schedule travels but the dates don't go stale.
 */
export async function saveProjectAsTemplate(
  projectId: string,
  name: string,
  description?: string | null,
): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const cleanName = name.trim()
  if (!cleanName) return { error: 'Give the template a name.' }

  const { data: project } = await supabase
    .from('projects')
    .select('id, type, start_date')
    .eq('id', projectId)
    .single()
  if (!project) return { error: 'Project not found.' }

  const { data: tasks } = await supabase
    .from('tasks')
    .select('title, description, priority, time_estimate, due_date')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  const rows = (tasks ?? []) as {
    title: string; description: string | null; priority: string
    time_estimate: number | null; due_date: string | null
  }[]
  if (rows.length === 0) return { error: 'This project has no tasks to capture.' }

  // Baseline for offsets: the project's start date, else its earliest task due date.
  const dued = rows.map(r => r.due_date).filter((d): d is string => !!d).sort()
  const baseline = project.start_date ?? dued[0] ?? null

  const content: TemplateContent = {
    type: (project.type as string | null) ?? null,
    tasks: rows.map(r => ({
      title: r.title,
      description: r.description,
      priority: PRIORITIES.includes(r.priority) ? r.priority : 'medium',
      time_estimate: r.time_estimate,
      due_offset_days: r.due_date && baseline ? dayDiff(baseline, r.due_date) : null,
    })),
  }

  const { data, error } = await supabase
    .from('project_templates')
    .insert({
      name: cleanName,
      description: description?.trim() || null,
      content,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/projects/templates')
  return { ok: true, id: data.id }
}

/**
 * Create this template's tasks against a project.
 * Called right after the project is inserted. Best-effort: a template problem
 * must never leave you without the project you just created.
 */
export async function applyTemplateToProject(
  templateId: string,
  projectId: string,
  companyId: string,
  startDate: string | null,
  createdBy: string | null,
): Promise<{ created: number; error?: string }> {
  const supabase = await createClient()

  const { data: tpl } = await supabase
    .from('project_templates')
    .select('content')
    .eq('id', templateId)
    .single()
  if (!tpl) return { created: 0, error: 'Template not found.' }

  const { tasks } = parseTemplateContent(tpl.content)
  if (tasks.length === 0) return { created: 0 }

  const rows = tasks.map(t => ({
    project_id: projectId,
    company_id: companyId,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: 'todo',
    time_estimate: t.time_estimate,
    // No start date on the project means no basis for a schedule — leave dates blank.
    due_date: startDate && t.due_offset_days !== null ? addDays(startDate, t.due_offset_days) : null,
    created_by: createdBy,
  }))

  const { error } = await supabase.from('tasks').insert(rows)
  if (error) return { created: 0, error: error.message }

  revalidatePath(`/projects/${projectId}`)
  return { created: rows.length }
}

export async function renameProjectTemplate(
  id: string,
  name: string,
  description?: string | null,
): Promise<Result> {
  const supabase = await createClient()
  const cleanName = name.trim()
  if (!cleanName) return { error: 'Give the template a name.' }
  const { error } = await supabase
    .from('project_templates')
    .update({ name: cleanName, description: description?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/projects/templates')
  return { ok: true }
}

export async function deleteProjectTemplate(id: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.from('project_templates').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/projects/templates')
  return { ok: true }
}
