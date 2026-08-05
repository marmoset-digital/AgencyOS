import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import StandaloneTaskDetail from './StandaloneTaskDetail'

export const metadata = { title: 'Task' }

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: task } = await supabase
    .from('tasks')
    .select(`
      id, title, description, status, priority, assignee_id, due_date, project_id,
      assignee:assignee_id ( id, full_name ),
      project:project_id ( id, name, company:company_id ( id, name ) )
    `)
    .eq('id', id)
    .maybeSingle()

  if (!task) notFound()

  const { data: users } = await supabase
    .from('users').select('id, full_name').order('full_name', { ascending: true })

  const { data: subtasks } = await supabase
    .from('subtasks').select('*').eq('task_id', id).order('sort_order', { ascending: true })

  const { data: logs } = await supabase
    .from('time_logs')
    .select('id, duration_minutes, is_billable, logged_at, description, user_id, project_id')
    .eq('task_id', id)
    .order('logged_at', { ascending: false })

  const { data: activeTimer } = await supabase
    .from('active_timers')
    .select('*')
    .eq('user_id', user.id)
    .eq('task_id', id)
    .maybeSingle()

  const totalMinutes = (logs ?? []).reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0)

  return (
    <StandaloneTaskDetail
      task={task as never}
      users={(users ?? []) as never}
      subtasks={(subtasks ?? []) as never}
      logs={(logs ?? []) as never}
      totalMinutes={totalMinutes}
      activeTimer={(activeTimer ?? null) as never}
      currentUserId={user.id}
    />
  )
}
