import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { normaliseContent, computeTotals, summaryText, headlineValue, money } from '@/lib/proposalPricing'

// Status presentation, kept in step with the DB check constraint (migration 0013):
// draft | sent | accepted | declined | changes_requested | expired
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Sent', cls: 'bg-amber-100 text-amber-700' },
  accepted: { label: 'Accepted', cls: 'bg-green-100 text-green-700' },
  changes_requested: { label: 'Changes requested', cls: 'bg-blue-100 text-blue-700' },
  declined: { label: 'Declined', cls: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', cls: 'bg-gray-100 text-gray-500' },
}

const STATUS_ORDER = ['draft', 'sent', 'changes_requested', 'accepted', 'declined', 'expired']
const STATUS_RANK: Record<string, number> = Object.fromEntries(STATUS_ORDER.map((s, i) => [s, i]))

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; sort?: string; dir?: string }>
}) {
  const supabase = await createClient()
  const { status, q, sort, dir } = await searchParams
  const sortDir = dir === 'desc' ? 'desc' : 'asc'

  // Fetch once, unfiltered, then filter in memory so the status counts and the
  // summary tiles always reflect the whole book rather than the current filter.
  const { data: proposals } = await supabase
    .from('proposals')
    .select(`
      id, title, status, content, expires_at, sent_at, responded_at, created_at,
      token, project_id, signed_name, proposal_number,
      companies:company_id ( id, name )
    `)
    .order('created_at', { ascending: false })

  const now = Date.now()
  const all = ((proposals ?? []) as Record<string, any>[]).map(p => {
    const totals = computeTotals(normaliseContent(p.content))
    return {
      ...p,
      totals,
      summary: summaryText(totals),
      value: headlineValue(totals),
      // A 'sent' proposal past its expiry date has lapsed even if nothing has
      // flipped its status yet. Surfaced as a hint, never written back.
      lapsed: p.status === 'sent' && p.expires_at ? new Date(p.expires_at).getTime() < now : false,
    }
  })

  const countByStatus = all.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  const tile = (statuses: string[]) => {
    const g = all.filter(r => statuses.includes(r.status))
    return {
      count: g.length,
      once: g.reduce((s, r) => s + r.totals.once, 0),
      monthly: g.reduce((s, r) => s + r.totals.monthly, 0),
    }
  }
  const drafts = tile(['draft'])
  const open = tile(['sent', 'changes_requested'])
  const accepted = tile(['accepted'])

  // ── Filter ──
  let rows = all
  if (status) rows = rows.filter(r => r.status === status)
  if (q) rows = rows.filter(r => String(r.title ?? '').toLowerCase().includes(q.toLowerCase()))

  // ── Sort (URL-based, same pattern as /projects) ──
  if (sort) {
    const sign = sortDir === 'asc' ? 1 : -1
    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case 'title': return String(a.title ?? '').localeCompare(String(b.title ?? '')) * sign
        case 'client': return String(a.companies?.name ?? '').localeCompare(String(b.companies?.name ?? '')) * sign
        case 'status': return ((STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99)) * sign
        case 'value': return (a.value - b.value) * sign
        case 'created': return String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) * sign
        case 'expires': {
          const da = a.expires_at, db = b.expires_at
          if (!da && !db) return 0
          if (!da) return 1
          if (!db) return -1
          return String(da).localeCompare(String(db)) * sign
        }
        default: return 0
      }
    })
  }

  function sortHref(key: string) {
    const p = new URLSearchParams()
    if (status) p.set('status', status)
    if (q) p.set('q', q)
    p.set('sort', key)
    p.set('dir', sort === key && sortDir === 'asc' ? 'desc' : 'asc')
    return `/proposals?${p.toString()}`
  }
  const sortArrow = (key: string) => (sort === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕')

  function statusHref(s: string) {
    const p = new URLSearchParams()
    if (s) p.set('status', s)
    if (q) p.set('q', q)
    if (sort) { p.set('sort', sort); p.set('dir', sortDir) }
    const qs = p.toString()
    return qs ? `/proposals?${qs}` : '/proposals'
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proposals</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {all.length} total{status ? ` · showing ${rows.length} ${STATUS[status]?.label.toLowerCase() ?? status}` : ''}
          </p>
        </div>
        <Link
          href="/proposals/new"
          className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition"
        >
          + New Proposal
        </Link>
      </div>

      {/* Summary tiles — stack on mobile, three across from sm up */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        {[
          { label: 'Drafts', t: drafts, hint: 'not sent yet' },
          { label: 'Out for decision', t: open, hint: 'sent or changes requested' },
          { label: 'Accepted', t: accepted, hint: 'all time' },
        ].map(({ label, t, hint }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500">{label}</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{t.count}</div>
            <div className="text-xs text-gray-500 mt-1">
              {t.once > 0 || t.monthly > 0 ? (
                <>
                  {t.once > 0 ? money(t.once) + ' one-off' : ''}
                  {t.once > 0 && t.monthly > 0 ? ' + ' : ''}
                  {t.monthly > 0 ? money(t.monthly) + '/month' : ''}
                </>
              ) : (
                <span className="text-gray-400">{hint}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <form method="GET" className="w-full sm:w-auto">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search proposals…"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#254DA5] w-full sm:w-56"
          />
          {status && <input type="hidden" name="status" value={status} />}
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={statusHref('')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
              !status ? 'bg-[#254DA5] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </Link>
          {STATUS_ORDER.map(s => (
            <Link
              key={s}
              href={statusHref(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                status === s ? 'bg-[#254DA5] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {STATUS[s].label}
              {countByStatus[s] ? <span className="ml-1 opacity-70">{countByStatus[s]}</span> : null}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 sm:px-5 py-3 font-medium text-gray-500"><Link href={sortHref('title')} className="inline-flex items-center gap-1 hover:text-gray-700">Proposal <span className="text-gray-300">{sortArrow('title')}</span></Link></th>
                  <th className="text-left px-4 sm:px-5 py-3 font-medium text-gray-500"><Link href={sortHref('client')} className="inline-flex items-center gap-1 hover:text-gray-700">Client <span className="text-gray-300">{sortArrow('client')}</span></Link></th>
                  <th className="text-left px-4 sm:px-5 py-3 font-medium text-gray-500"><Link href={sortHref('status')} className="inline-flex items-center gap-1 hover:text-gray-700">Status <span className="text-gray-300">{sortArrow('status')}</span></Link></th>
                  <th className="hidden md:table-cell text-left px-5 py-3 font-medium text-gray-500"><Link href={sortHref('value')} className="inline-flex items-center gap-1 hover:text-gray-700">Value <span className="text-gray-300">{sortArrow('value')}</span></Link></th>
                  <th className="hidden lg:table-cell text-left px-5 py-3 font-medium text-gray-500"><Link href={sortHref('created')} className="inline-flex items-center gap-1 hover:text-gray-700">Created <span className="text-gray-300">{sortArrow('created')}</span></Link></th>
                  <th className="hidden lg:table-cell text-left px-5 py-3 font-medium text-gray-500"><Link href={sortHref('expires')} className="inline-flex items-center gap-1 hover:text-gray-700">Expires <span className="text-gray-300">{sortArrow('expires')}</span></Link></th>
                  <th className="px-4 sm:px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p: any) => {
                  const s = STATUS[p.status] ?? STATUS.draft
                  return (
                    <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition">
                      <td className="px-4 sm:px-5 py-4 align-top">
                        <Link href={`/proposals/${p.id}`} className="font-medium text-gray-900 hover:text-[#254DA5]">{p.title}</Link>
                        <div className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">
                          {p.proposal_number ? `${p.proposal_number} · ` : ''}{p.summary}
                        </div>
                        {/* Value + dates fold into the first cell on small screens */}
                        <div className="md:hidden text-xs text-gray-500 mt-1">
                          {fmtDate(p.created_at)}
                          {p.expires_at ? ` · valid to ${fmtDate(p.expires_at)}` : ''}
                        </div>
                      </td>
                      <td className="px-4 sm:px-5 py-4 align-top">
                        {p.companies ? (
                          <Link href={`/clients/${p.companies.id}`} className="text-[#254DA5] hover:underline text-sm">
                            {p.companies.name}
                          </Link>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 sm:px-5 py-4 align-top">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${s.cls}`}>{s.label}</span>
                        {p.lapsed && (
                          <div className="text-[11px] text-red-500 mt-1 whitespace-nowrap">past expiry</div>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-5 py-4 align-top text-gray-700 whitespace-nowrap">
                        {p.value > 0 ? money(p.value, p.totals.currency) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="hidden lg:table-cell px-5 py-4 align-top text-gray-500 text-xs whitespace-nowrap">
                        {fmtDate(p.created_at)}
                      </td>
                      <td className="hidden lg:table-cell px-5 py-4 align-top text-gray-500 text-xs whitespace-nowrap">
                        {fmtDate(p.expires_at)}
                      </td>
                      <td className="px-4 sm:px-5 py-4 align-top text-right whitespace-nowrap">
                        {p.project_id ? (
                          <Link href={`/projects/${p.project_id}`} className="text-[#254DA5] hover:underline text-xs font-medium">Project →</Link>
                        ) : (
                          <Link href={`/proposals/${p.id}`} className="text-[#254DA5] hover:underline text-xs font-medium">Open →</Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center px-4">
            <p className="text-gray-400 mb-4">
              {all.length === 0 ? 'No proposals yet' : 'No proposals match this filter'}
            </p>
            {all.length === 0 ? (
              <Link href="/proposals/new" className="text-[#254DA5] hover:underline text-sm font-medium">
                Create your first proposal →
              </Link>
            ) : (
              <Link href="/proposals" className="text-[#254DA5] hover:underline text-sm font-medium">
                Clear filters →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
