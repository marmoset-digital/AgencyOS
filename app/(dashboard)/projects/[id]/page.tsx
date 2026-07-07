import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TaskBoard from './TaskBoard'
import RecurringTemplates from './RecurringTemplates'
import ProjectTeam from './ProjectTeam'
import { PROJECT_STAGES } from '@/types'
import type { Subtask } from '@/types/subtask'
import type { TaskComment } from '@/types/comment'
import type { RecurringTemplate } from '@/types/recurring'
import { generateDueForProject } from '@/lib/recurring'

const stageColours: Record<string, string> = {
  quote_sent: 'bg-purple-100 text-purple-700',
  proposal_accepted: 'bg-blue-100 text-blue-700',
  onboarding: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  awaiting_feedback: 'bg-orange-100 text-orange-700',
  paused: 'bg-gray-100 text-gray-600',
  complete: 'bg-teal-100 text-teal-700',
  invoiced_closed: 'bg-gray-100 text-gray-500',
}

const stageLabels: Record<string, string> = Object.fromEntries(
  PROJECT_STAGES.map(s => [s.value, s.label])
)

function formatMinutes(m: number) {
  if (!m) return '0m'
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h ? (mm ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`
}

interface Person { id: string; full_name: string; role?: string | null }

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Fetch project with related data
  const { data: project } = await supabase
    .from('projects')
    .select(`
      *,
      companies:company_id ( id, name, status, website ),
      assigned_user:assigned_to ( id, full_name, role )
    `)
    .eq('id', id)
    .single()

  if (!project) notFound()

  // Auto-generate any due recurring tasks for this project (best-effort; deduped
  // via last_generated_at). Runs before we fetch tasks so new ones show up now.
  try {
    await generateDueForProject(supabase, id, user?.id ?? null)
  } catch {
    // never let recurring generation break the page
  }

  // Fetch tasks with assignee
  const { data: tasks } = await supabase
    .from('tasks')
    .select(`
      *,
      assignee:assignee_id ( id, full_name )
    `)
    .eq('project_id', id)
    .order('created_at', { ascending: true })

  // Fetch users for @mentions / picker
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, role')
    .order('full_name', { ascending: true })

  // Fetch this project's team members
  const { data: memberRows } = await supabase
    .from('project_members')
    .select('user:user_id ( id, full_name, role )')
    .eq('project_id', id)
  const members = (((memberRows ?? []) as unknown as { user: Person | Person[] | null }[])
    .map(r => (Array.isArray(r.user) ? r.user[0] : r.user))
    .filter(Boolean)) as Person[]

  // Assignee/mention list = the project's team (members + manager). Fallback to all
  // users if the project has no team set yet, so tasks are always assignable.
  const assigneeMap = new Map<string, Person>()
  for (const m of members) assigneeMap.set(m.id, m)
  if (project.assigned_user) assigneeMap.set(project.assigned_user.id, project.assigned_user as Person)
  let assigneeList = [...assigneeMap.values()]
  if (assigneeList.length === 0) assigneeList = (users ?? []) as Person[]

  const taskIds = (tasks ?? []).map(t => t.id)

  // Fetch subtasks for this project's tasks
  const subtasksByTask: Record<string, Subtask[]> = {}
  if (taskIds.length > 0) {
    const { data: subtasks } = await supabase
      .from('subtasks')
      .select('*')
      .in('task_id', taskIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    for (const s of (subtasks ?? []) as Subtask[]) {
      (subtasksByTask[s.task_id] ??= []).push(s)
    }
  }

  // Fetch comments for this project's tasks
  const commentsByTask: Record<string, TaskComment[]> = {}
  if (taskIds.length > 0) {
    const { data: comments } = await supabase
      .from('comments')
      .select('*, author:author_id ( full_name )')
      .eq('entity_type', 'task')
      .in('entity_id', taskIds)
      .order('created_at', { ascending: true })
    for (const c of (comments ?? []) as TaskComment[]) {
      (commentsByTask[c.entity_id] ??= []).push(c)
    }
  }

  // Fetch recurring templates for this project
  const { data: templates } = await supabase
    .from('recurring_task_templates')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: true })

  // Fetch time logs for this project
  const { data: timeLogs } = await supabase
    .from('time_logs')
    .select('id, task_id, duration_minutes, is_billable')
    .eq('project_id', id)

  // Fetch the current user's running timer (if any)
  const { data: activeTimer } = await supabase
    .from('active_timers')
    .select('*')
    .eq('user_id', user?.id ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle()

  // Aggregate time
  const minutesByTask: Record<string, number> = {}
  let totalMinutes = 0
  let billableMinutes = 0
  for (const log of timeLogs ?? []) {
    if (log.task_id) {
      minutesByTask[log.task_id] = (minutesByTask[log.task_id] ?? 0) + log.duration_minutes
    }
    totalMinutes += log.duration_minutes
    if (log.is_billable) billableMinutes += log.duration_minutes
  }

  // Stats
  const totalTasks = tasks?.length ?? 0
  const doneTasks = tasks?.filter(t => t.status === 'done').length ?? 0
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  const formattedStart = project.start_date
    ? new Date(project.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  const formattedEnd = project.end_date
    ? new Date(project.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-5">
        <Link href="/projects" className="hover:text-gray-600">Projects</Link>
        <span>/</span>
        {project.companies && (
          <>
            <Link href={`/clients/${project.companies.id}`} className="hover:text-gray-600">
              {project.companies.name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-gray-700 font-medium">{project.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${stageColours[project.stage] ?? 'bg-gray-100'}`}>
              {stageLabels[project.stage] ?? project.stage}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 capitalize">
              {project.type === 'retainer' ? '🔁 Retainer' : '📌 One-off'}
            </span>
          </div>
          {project.description && (
            <p className="text-gray-500 text-sm">{project.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 ml-4">
          <Link
            href={`/projects/${id}/edit`}
            className="border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-900 text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            Edit
          </Link>
        </div>
      </div>

      {/* Meta cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">Client</div>
          <div className="font-medium text-gray-900 text-sm">
            {project.companies ? (
              <Link href={`/clients/${project.companies.id}`} className="text-[#E8611A] hover:underline">
                {project.companies.name}
              </Link>
            ) : '—'}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">Manager</div>
          <div className="font-medium text-gray-900 text-sm">
            {project.assigned_user?.full_name ?? <span className="text-gray-400">Unassigned</span>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">Timeline</div>
          <div className="font-medium text-gray-900 text-sm">
            {formattedStart && formattedEnd
              ? `${formattedStart} → ${formattedEnd}`
              : formattedEnd
                ? `Due ${formattedEnd}`
                : formattedStart
                  ? `Started ${formattedStart}`
                  : <span className="text-gray-400">No dates set</span>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-2">Progress</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-full h-2">
              <div
                className="bg-[#E8611A] h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-gray-700">{progress}%</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">{doneTasks} of {totalTasks} tasks done</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">Time Logged</div>
          <div className="font-semibold text-gray-900 text-sm">{formatMinutes(totalMinutes)}</div>
          <div className="text-xs text-gray-400 mt-1">{formatMinutes(billableMinutes)} billable</div>
        </div>
      </div>

      {/* Team */}
      <ProjectTeam
        projectId={id}
        members={members}
        allUsers={(users ?? []) as Person[]}
        managerId={project.assigned_to ?? null}
      />

      {/* Retainer caps */}
      {project.type === 'retainer' && (project.monthly_hours_cap || project.monthly_tasks_cap) && (
        <div className="flex items-center gap-4 mb-6 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 text-sm text-blue-700">
          <span>📋 Retainer caps this month:</span>
          {project.monthly_hours_cap && (
            <span className="font-medium">{project.monthly_hours_cap} hours</span>
          )}
          {project.monthly_tasks_cap && (
            <span className="font-medium">{project.monthly_tasks_cap} tasks</span>
          )}
        </div>
      )}

      {/* Tasks section */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tasks</h2>
        <TaskBoard
          tasks={(tasks ?? []) as never}
          projectId={id}
          companyId={project.company_id}
          users={assigneeList as never}
          minutesByTask={minutesByTask}
          activeTimer={(activeTimer ?? null) as never}
          subtasksByTask={subtasksByTask as never}
          commentsByTask={commentsByTask as never}
          currentUserId={user?.id ?? ''}
        />
      </div>

      {/* Recurring tasks */}
      <RecurringTemplates
        templates={(templates ?? []) as RecurringTemplate[]}
        projectId={id}
        companyId={project.company_id}
        users={assigneeList as never}
      />
    </div>
  )
}
