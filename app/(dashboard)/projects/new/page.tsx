import { createClient } from '@/lib/supabase/server'
import { createProject } from '@/app/actions/projects'
import Link from 'next/link'
import { PROJECT_STAGES } from '@/types'

export default async function NewProjectPage() {
  const supabase = await createClient()

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, status')
    .in('status', ['active', 'lead'])
    .order('name', { ascending: true })

  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, role')
    .order('full_name', { ascending: true })

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <Link href="/projects" className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">
          ← Back to Projects
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">New Project</h1>
        <p className="text-gray-500 mt-1">Create a project for a client.</p>
      </div>

      <form action={createProject as any} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-5">

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Client <span className="text-red-500">*</span>
            </label>
            <select name="company_id" required className="input">
              <option value="">— Select a client —</option>
              {companies?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              name="name"
              required
              className="input"
              placeholder="e.g. Website Redesign, SEO Retainer Q3"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
            <select name="type" className="input">
              <option value="project">One-off Project</option>
              <option value="retainer">Retainer</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Stage</label>
            <select name="stage" className="input">
              {PROJECT_STAGES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Date</label>
            <input name="start_date" type="date" className="input" />
          </div>

