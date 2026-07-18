import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const statusColours: Record<string, string> = {
  lead: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
  churned: 'bg-red-100 text-red-700',
}

const statusLabels: Record<string, string> = {
  lead: 'Lead',
  active: 'Active',
  inactive: 'Inactive',
  churned: 'Churned',
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; archived?: string }>
}) {
  const supabase = await createClient()
  const { status, q, archived } = await searchParams
  const showArchived = archived === '1'

  let query = supabase
    .from('companies')
    .select('id, name, industry, website, status, lead_stage, created_at')
    .order('name', { ascending: true })

  query = showArchived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)

  if (status) query = query.eq('status', status)
  if (q) query = query.ilike('name', `%${q}%`)

  const { data: companies } = await query

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients & CRM</h1>
          <p className="text-gray-500 mt-1">
            {companies?.length ?? 0} {showArchived ? 'archived' : 'companies'} ·{' '}
            <Link href={showArchived ? '/clients' : '/clients?archived=1'} className="text-[#254DA5] hover:underline">
              {showArchived ? '← Back to active' : 'View archive'}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/clients/import"
            className="border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-900 text-sm font-medium px-4 py-2.5 rounded-lg transition"
          >
            ↑ Import CSV
          </Link>
          <Link
            href="/clients/new"
            className="bg-[#E8611A] hover:bg-[#d45516] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition"
          >
            + Add Client
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <form method="GET" className="flex items-center gap-3 flex-1">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search clients…"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E8611A] w-64"
          />
          {(['', 'lead', 'active', 'inactive', 'churned'] as const).map(s => (
            <Link
              key={s}
              href={s ? `/clients?status=${s}${q ? `&q=${q}` : ''}` : `/clients${q ? `?q=${q}` : ''}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                (status ?? '') === s
                  ? 'bg-[#E8611A] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s === '' ? 'All' : statusLabels[s]}
            </Link>
          ))}
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {companies && companies.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-500">Company</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Industry</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Lead Stage</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company: any) => (
                <tr key={company.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition">
                  <td className="px-5 py-4">
                    <div className="font-medium text-gray-900">{company.name}</div>
                    {company.website && (
                      <div className="text-xs text-gray-400 mt-0.5">{company.website.replace(/^https?:\/\//, '')}</div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-600">{company.industry ?? '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColours[company.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {statusLabels[company.status] ?? company.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-500 capitalize">
                    {company.lead_stage?.replace('_', ' ') ?? '—'}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/clients/${company.id}`}
                      className="text-[#E8611A] hover:underline text-xs font-medium"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-16 text-center">
            <p className="text-gray-400 mb-4">No clients yet</p>
            <Link
              href="/clients/new"
              className="text-[#E8611A] hover:underline text-sm font-medium"
            >
              Add your first client →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
