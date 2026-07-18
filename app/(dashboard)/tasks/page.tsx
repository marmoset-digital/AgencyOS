import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GlobalTasks from './GlobalTasks'

export const metadata = { title: 'Tasks' }

export default async function TasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: tasks } = await supabase
    .from('tasks')
    .select(`
      id, title, description, status, priority, assignee_id, due_date, project_id,
      assignee:assignee_id ( id, full_name ),
      project:project_id ( id, name, stage, company:company_id ( id, name ) )
    `)
    .order('due_date', { ascending: true, nullsFirst: false })

  const { data: users } = await supabase
    .from('users').select('id, full_name').order('full_name', { ascending: true })

  const { data: projects } = await supabase
    .from('projects').select('id, name').is('archived_at', null).order('name', { ascending: true })

  // Time logged per task
  const { data: timeLogs } = await supabase
    .from('time_logs').select('task_id, duration_minutes')
  const minutesByTask: Record<string, number> = {}
  for (const l of timeLogs ?? []) {
    if (l.task_id) minutesByTask[l.task_id] = (minutesByTask[l.task_id] ?? 0) + (l.duration_minutes ?? 0)
  }

  return (
    <GlobalTasks
      tasks={(tasks ?? []) as never}
      users={(users ?? []) as never}
      projects={(projects ?? []) as never}
      minutesByTask={minutesByTask}
      currentUserId={user.id}
    />
  )
}
