import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import TemplateRow from './TemplateRow'

export const dynamic = 'force-dynamic'

type TemplateTaskish = { title?: unknown; due_offset_days?: unknown }

export default async function ProjectTemplatesPage() {
  const supabase = await createClient()

  const { data: templates } = await supabase
    .from('project_templates')
    .select('id, name, description, content, created_at')
    .order('name', { ascending: true })

  const rows = (templates ?? []).map(t => {
    const content = (t.content ?? {}) as { tasks?: unknown }
    const tasks = Array.isArray(content.tasks) ? (content.tasks as TemplateTaskish[]) : []
    const dated = tasks.filter(x => typeof x?.due_offset_days === 'number')
    const span = dated.length
      ? Math.max(...dated.map(x => x.due_offset_days as number)) -
        Math.min(...dated.map(x => x.due_offset_days as number))
      : null
    return {
      id: t.id as string,
      name: t.name as string,
      description: (t.description as string | null) ?? null,
      taskCount: tasks.length,
      spanDays: span,
    }
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/projects" className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">
            ← Back to Projects
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Project Templates</h1>
          <p className="text-gray-500 mt-1">
            {rows.length} {rows.length === 1 ? 'template' : 'templates'}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500 mb-1">No templates yet.</p>
          <p className="text-sm text-gray-400">
            Open a project that has the task list you want to reuse and choose{' '}
            <span className="font-medium text-gray-600">Save as template</span>.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {rows.map(t => (
            <TemplateRow
              key={t.id}
              id={t.id}
              name={t.name}
              description={t.description}
              taskCount={t.taskCount}
              spanDays={t.spanDays}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        Pick a template on <Link href="/projects/new" className="text-[#254DA5] hover:underline">New Project</Link>{' '}
        and its tasks are created for you, with due dates counted from the project&rsquo;s start date.
      </p>
    </div>
  )
}
