import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecurringTemplate } from '@/types/recurring'

// All scheduling is evaluated in Melbourne time (Marmoset's timezone).
function melbourneToday() {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const [y, m, d] = s.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay() // calendar weekday (0=Sun)
  return { ymd: s, ym: s.slice(0, 7), dow, dom: d }
}

function melbourneOf(iso: string) {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso))
  return { ymd: s, ym: s.slice(0, 7) }
}

export function isTemplateDue(t: RecurringTemplate, nowIso?: string): boolean {
  if (!t.active) return false
  const today = melbourneToday()
  const last = t.last_generated_at ? melbourneOf(t.last_generated_at) : null

  switch (t.frequency) {
    case 'daily':
      return !last || last.ymd < today.ymd
    case 'weekly':
      return today.dow === t.day_of_week && (!last || last.ymd < today.ymd)
    case 'fortnightly': {
      if (today.dow !== t.day_of_week) return false
      if (!t.last_generated_at) return true
      const days = Math.floor((Date.now() - new Date(t.last_generated_at).getTime()) / 86400000)
      return days >= 14
    }
    case 'monthly':
      return today.dom === t.day_of_month && (!last || last.ym !== today.ym)
    default:
      return false
  }
}

// Create one task instance from a template and stamp last_generated_at.
export async function generateTaskFromTemplate(
  supabase: SupabaseClient,
  t: RecurringTemplate,
  createdBy: string | null,
) {
  const { error } = await supabase.from('tasks').insert({
    project_id: t.project_id,
    company_id: t.company_id,
    title: t.title,
    description: t.description,
    assignee_id: t.assignee_id,
    priority: t.priority,
    status: 'todo',
    time_estimate: t.time_estimate,
    is_recurring: true,
    recurring_template_id: t.id,
    created_by: createdBy,
  })
  if (error) throw new Error(error.message)

  await supabase
    .from('recurring_task_templates')
    .update({ last_generated_at: new Date().toISOString() })
    .eq('id', t.id)
}

// Generate any due tasks for a project's active templates. Safe to call on every
// project page load — last_generated_at prevents duplicates within a period.
export async function generateDueForProject(
  supabase: SupabaseClient,
  projectId: string,
  createdBy: string | null,
): Promise<number> {
  const { data: templates } = await supabase
    .from('recurring_task_templates')
    .select('*')
    .eq('project_id', projectId)
    .eq('active', true)

  let count = 0
  for (const t of (templates ?? []) as RecurringTemplate[]) {
    if (isTemplateDue(t)) {
      try {
        await generateTaskFromTemplate(supabase, t, createdBy)
        count++
      } catch {
        // don't let one bad template block the others / the page
      }
    }
  }
  return count
}
