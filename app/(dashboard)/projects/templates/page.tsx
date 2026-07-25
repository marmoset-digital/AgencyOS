import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import TemplatesManager, { type ManagerTemplate } from './TemplatesManager'

export const dynamic = 'force-dynamic'

type RawTask = {
  title?: unknown; description?: unknown; priority?: unknown
  time_estimate?: unknown; due_offset_days?: unknown
}

export default async function ProjectTemplatesPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('project_templates')
    .select('id, name, description, content')
    .order('name', { ascending: true })

  const templates: ManagerTemplate[] = (data ?? []).map(t => {
    const content = (t.content ?? {}) as { type?: unknown; tasks?: unknown }
    const rawTasks = Array.isArray(content.tasks) ? (content.tasks as RawTask[]) : []
    return {
      id: t.id as string,
      name: t.name as string,
      description: (t.description as string | null) ?? null,
      type: typeof content.type === 'string' ? content.type : null,
      rows: rawTasks.map(x => ({
        title: typeof x.title === 'string' ? x.title : '',
        description: typeof x.description === 'string' ? x.description : '',
        priority: typeof x.priority === 'string' ? x.priority : 'medium',
        estimate: typeof x.time_estimate === 'number' ? String(x.time_estimate) : '',
        offset: typeof x.due_offset_days === 'number' ? String(x.due_offset_days) : '',
      })),
    }
  })

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <Link href="/projects" className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">
          ← Back to Projects
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Project Templates</h1>
        <p className="text-gray-500 mt-1">
          Build a reusable task list here, or use “Save as template” on a project. Pick a template on
          New Project and its tasks are created for you, with due dates counted from the start date.
        </p>
      </div>

      <TemplatesManager templates={templates} />
    </div>
  )
}
