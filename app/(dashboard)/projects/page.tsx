import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PROJECT_STAGES } from '@/types'

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

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; type?: string; q?: string; archived?: string }>
}) {
  const supabase = await createClient()
  const { stage, type, q, archived } = await searchParams
  const showArchived = archived === '1'

  let query = supabase
    .from('projects')
    .select(`
      id, name, description, type, stage, start_date, end_date,
      created_at, assigned_to,
      companies:company_id ( id, name ),
      assigned_user:assigned_to ( id, full_name )
    `)
    .order('created_at', { ascending: false })

  query = showArchived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)

  if (stage) query = query.eq('stage', stage)
  if (type) query = query.eq('type', type)
  if (q) query = query.ilike('name', `%${q}%`)

  const { data: projects } = await query

  const { data: stageCounts } = await supabase
    .from('projects')
    .select('stage')

  const countByStage = (stageCounts ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.stage] = (acc[row.stage] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 mt-1">
            {projects?.length ?? 0} {showArchived ? 'archived' : 'projects'} ·{' '}
            <Link href={showArchived ? '/projects' : '/projects?archived=1'} className="text-[#254DA5] hover:underline">
              {showArchived ? '← Back to active' : 'View archive'}
            </Link>
          </p>
        </div>
        <Link
          href="/projects/new"
          className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition"
        >
          + New Project
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <form method="GET">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search projects…"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#254DA5] w-56"
          />
          {stage && <input type="hidden" name="stage" value={stage} />}
          {type && <input type="hidden" name="type" value={type} />}
        </form>

        <div className="flex items-center gap-2">
          {(['', 'project', 'retainer'] as const).map(t => (
            <Link
              key={t}
              href={t
                ? `/projects?type=${t}${stage ? `&stage=${stage}` : ''}${q ? `&q=${q}` : ''}`
                : `/projects${stage ? `?stage=${stage}` : ''}${q ? `${stage ? '&' : '?'}q=${q}` : ''}`
              }
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                (type ?? '') === t
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t === '' ? 'All Types' : t === 'project' ? 'One-off' : 'Retainer'}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={`/projects${type ? `?type=${type}` : ''}${q ? `${type ? '&' : '?'}q=${q}` : ''}`}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
              !stage ? 'bg-[#254DA5] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All Stages
          </Link>
          {PROJECT_STAGES.map(s => (
            <Link
              key={s.value}
              href={`/projects?stage=${s.value}${type ? `&type=${type}` : ''}${q ? `&q=${q}` : ''}`}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                stage === s.value
                  ? 'bg-[#254DA5] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s.label}
              {countByStage[s.value] ? (
                <span className="ml-1 opacity-70">{countByStage[s.value]}</span>
              ) : null}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {projects && projects.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-500">Project</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Client</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Stage</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Type</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Due</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Assigned</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project: any) => (
                <tr key={project.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition">
                  <td className="px-5 py-4">
                    <Link href={`/projects/${project.id}`} className="font-medium text-gray-900 hover:text-[#254DA5]">{project.name}</Link>
                    {project.description && (
                      <div className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{project.description}</div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {project.companies ? (
                      <Link href={`/clients/${project.companies.id}`} className="text-[#254DA5] hover:underline text-sm">
                        {project.companies.name}
                      </Link>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${stageColours[project.stage] ?? 'bg-gray-100 text-gray-600'}`}>
                      {stageLabels[project.stage] ?? project.stage}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-500 capitalize">
                    {project.type === 'retainer' ? '🔁 Retainer' : '📌 One-off'}
                  </td>
                  <td className="px-5 py-4 text-gray-500 text-xs">
                    {project.end_date
                      ? new Date(project.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-5 py-4">
                    {project.assigned_user ? (
                      <span className="text-sm text-gray-600">{project.assigned_user.full_name}</span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/projects/${project.id}`} className="text-[#254DA5] hover:underline text-xs font-medium">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-16 text-center">
            <p className="text-gray-400 mb-4">No projects yet</p>
            <Link href="/projects/new" className="text-[#254DA5] hover:underline text-sm font-medium">
              Create your first project →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
