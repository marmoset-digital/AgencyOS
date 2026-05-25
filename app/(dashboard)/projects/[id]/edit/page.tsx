import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PROJECT_STAGES } from '@/types'

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('*, companies:company_id ( id, name )')
    .eq('id', id)
    .single()

  if (!project) notFound()

  // Fetch all companies for the client selector
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, status')
    .order('name', { ascending: true })

  // Fetch team members for assignment
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, role')
    .order('full_name', { ascending: true })

  const action = async (formData: FormData) => {
    'use server'
    const { createClient } = await import('@/lib/supabase/server')
    const { redirect } = await import('next/navigation')
    const { revalidatePath } = await import('next/cache')
    const supabase = await createClient()

    const payload = {
      company_id: (formData.get('company_id') as string) || null,
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || null,
      type: formData.get('type') as string,
      stage: formData.get('stage') as string,
      start_date: (formData.get('start_date') as string) || null,
      end_date: (formData.get('end_date') as string) || null,
      monthly_hours_cap: formData.get('monthly_hours_cap')
        ? parseInt(formData.get('monthly_hours_cap') as string)
        : null,
      monthly_tasks_cap: formData.get('monthly_tasks_cap')
        ? parseInt(formData.get('monthly_tasks_cap') as string)
        : null,
      assigned_to: (formData.get('assigned_to') as string) || null,
    }

    await supabase.from('projects').update(payload).eq('id', id)
    revalidatePath(`/projects/${id}`)
    revalidatePath('/projects')
    redirect(`/projects/${id}`)
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <Link
          href={`/projects/${id}`}
          className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block"
        >
          ← Back to {project.name}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Project</h1>
      </div>

      <form action={action} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-5">

          {/* Client */}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Client <span className="text-red-500">*</span>
            </label>
            <select name="company_id" required defaultValue={project.company_id ?? ''} className="input">
              <option value="">— Select a client —</option>
              {companies?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Project Name */}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              name="name"
              required
              defaultValue={project.name}
              className="input"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
            <select name="type" defaultValue={project.type ?? 'project'} className="input">
              <option value="project">One-off Project</option>
              <option value="retainer">Retainer</option>
            </select>
          </div>

          {/* Stage */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Stage</label>
            <select name="stage" defaultValue={project.stage ?? 'quote_sent'} className="input">
              {PROJECT_STAGES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Date</label>
            <input
              name="start_date"
              type="date"
              defaultValue={project.start_date ?? ''}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">End / Due Date</label>
            <input
              name="end_date"
              type="date"
              defaultValue={project.end_date ?? ''}
              className="input"
            />
          </div>

          {/* Assigned To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Assigned To</label>
            <select name="assigned_to" defaultValue={project.assigned_to ?? ''} className="input">
              <option value="">— Unassigned —</option>
              {users?.map(u => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>

          {/* Monthly Hours Cap */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Monthly Hours Cap
              <span className="text-gray-400 font-normal ml-1 text-xs">(retainers)</span>
            </label>
            <input
              name="monthly_hours_cap"
              type="number"
              min="0"
              step="1"
              defaultValue={project.monthly_hours_cap ?? ''}
              className="input"
              placeholder="e.g. 20"
            />
          </div>

          {/* Monthly Tasks Cap */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Monthly Tasks Cap
              <span className="text-gray-400 font-normal ml-1 text-xs">(retainers)</span>
            </label>
            <input
              name="monthly_tasks_cap"
              type="number"
              min="0"
              step="1"
              defaultValue={project.monthly_tasks_cap ?? ''}
              className="input"
              placeholder="e.g. 10"
            />
          </div>

          {/* Description */}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              name="description"
              rows={4}
              defaultValue={project.description ?? ''}
              className="input resize-none"
              placeholder="Brief overview of the project scope…"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="bg-[#E8611A] hover:bg-[#d45516] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition"
          >
            Save Changes
          </button>
          <Link href={`/projects/${id}`} className="text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
