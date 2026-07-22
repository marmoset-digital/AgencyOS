// Presentational panel: a client's live projects + services.
// Pure (no hooks, no server imports), so it renders from both the team ticket page
// (server component) and the client support portal (client component).
//
// The caller decides what to show:
//   - team: pass service detail strings ("$1,200 / mo") + a totalLabel
//   - client (public portal): pass names only, no detail, no total

export type PanelProject = { id: string; name: string; stageLabel: string }
export type PanelService = { id: string; name: string; detail?: string | null }

export default function ClientContextPanel({
  projects,
  services,
  totalLabel,
  linkProjects = false,
}: {
  projects: PanelProject[]
  services: PanelService[]
  totalLabel?: string | null
  // team view links project names through to the project; the public portal doesn't
  linkProjects?: boolean
}) {
  if (projects.length === 0 && services.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
          Projects{projects.length > 0 ? ` (${projects.length})` : ''}
        </div>
        {projects.length === 0 ? (
          <p className="text-sm text-gray-400">No active projects.</p>
        ) : (
          <ul className="space-y-1.5">
            {projects.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                {linkProjects ? (
                  <a href={`/projects/${p.id}`} className="text-[#254DA5] hover:underline truncate">{p.name}</a>
                ) : (
                  <span className="text-gray-800 truncate">{p.name}</span>
                )}
                <span className="text-[11px] text-gray-400 shrink-0">{p.stageLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Services{services.length > 0 ? ` (${services.length})` : ''}
          </div>
          {totalLabel && <div className="text-xs font-semibold text-gray-700">{totalLabel}</div>}
        </div>
        {services.length === 0 ? (
          <p className="text-sm text-gray-400">No active services.</p>
        ) : (
          <ul className="space-y-1.5">
            {services.map(s => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-gray-800 truncate">{s.name}</span>
                {s.detail && <span className="text-[11px] text-gray-500 shrink-0">{s.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
