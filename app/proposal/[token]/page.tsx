import { createAdminClient } from '@/lib/supabase/server'
import { normaliseContent, computeTotals, summaryText, money, lineAmount, CYCLES } from '@/lib/proposalPricing'
import ProposalDecisionForm from './ProposalDecisionForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Proposal — Marmoset' }

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
}
function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null) }
const cycleSuffix = (c: string) => CYCLES.find(x => x.value === c)?.suffix ?? ''

export default async function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const adminDb = await createAdminClient()

  const { data: proposal } = await adminDb
    .from('proposals')
    .select('title, proposal_number, content, expires_at, status, signed_name, decision_comment, responded_at, companies:company_id ( name ), contact:contact_id ( first_name, last_name )')
    .eq('token', token)
    .maybeSingle()

  const content = normaliseContent(proposal?.content)
  const totals = computeTotals(content)
  const company = one(proposal?.companies as { name: string | null } | { name: string | null }[] | null)
  const contact = one(proposal?.contact as { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null)
  const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <div className="text-[#254DA5] font-bold text-xs tracking-widest uppercase">Marmoset Digital</div>
        </div>

        {!proposal ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <h1 className="text-lg font-semibold text-gray-900 mb-1">Link not valid</h1>
            <p className="text-sm text-gray-500">This proposal link is invalid or has been removed. Please contact Marmoset for a new one.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-xl font-bold text-gray-900">{proposal.title}</h1>
              {proposal.proposal_number && (
                <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded-full shrink-0">{proposal.proposal_number}</span>
              )}
            </div>
            {company?.name && (
              <p className="text-sm text-gray-500 mt-1">Prepared for {company.name}{contactName ? ` · Attn: ${contactName}` : ''}</p>
            )}
            {proposal.expires_at && <p className="text-xs text-gray-400 mt-1">Valid until {fmt(proposal.expires_at)}</p>}

            {/* Offerings */}
            <div className="mt-6 border-t border-gray-100 pt-4">
              {content.lines.length === 0 ? (
                <p className="text-sm text-gray-400">No line items.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {content.lines.map((l, i) => (
                    <div key={i} className="flex items-baseline justify-between py-2 gap-4">
                      <span className="text-sm text-gray-800">
                        {l.description || '—'}
                        {l.quantity > 1 ? <span className="text-gray-400"> × {l.quantity}</span> : null}
                      </span>
                      <span className="text-sm text-gray-900 whitespace-nowrap">
                        {money(lineAmount(l), content.currency)}<span className="text-gray-400">{cycleSuffix(l.billing_cycle)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals */}
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-sm">
                {totals.once > 0 && <div className="flex justify-between text-gray-600"><span>One-off</span><span>{money(totals.once, content.currency)}</span></div>}
                {totals.monthly > 0 && <div className="flex justify-between text-gray-600"><span>Monthly</span><span>{money(totals.monthly, content.currency)}/month</span></div>}
                {totals.quarterly > 0 && <div className="flex justify-between text-gray-600"><span>Quarterly</span><span>{money(totals.quarterly, content.currency)}/quarter</span></div>}
                {totals.annually > 0 && <div className="flex justify-between text-gray-600"><span>Annually</span><span>{money(totals.annually, content.currency)}/year</span></div>}
                {totals.tax > 0 && <div className="flex justify-between text-xs text-gray-400"><span>Includes tax</span><span>{money(totals.tax, content.currency)}</span></div>}
                <div className="flex justify-between pt-1 font-semibold text-gray-900"><span>Total</span><span>{summaryText(totals)}</span></div>
              </div>
            </div>

            {content.terms && (
              <div className="mt-6">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Terms</div>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{content.terms}</p>
              </div>
            )}

            <div className="border-t border-gray-100 my-6" />

            {proposal.status === 'sent' && <ProposalDecisionForm token={token} />}

            {proposal.status === 'accepted' && (
              <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                <div className="font-semibold text-green-800 text-sm">✓ Accepted</div>
                <div className="text-sm text-green-700 mt-1">Signed off by {proposal.signed_name} on {fmt(proposal.responded_at)}.</div>
              </div>
            )}
            {proposal.status === 'changes_requested' && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                <div className="font-semibold text-blue-800 text-sm">Changes requested</div>
                <div className="text-sm text-blue-700 mt-1">From {proposal.signed_name} on {fmt(proposal.responded_at)}:</div>
                {proposal.decision_comment && <p className="text-sm text-blue-700 mt-2 whitespace-pre-wrap">“{proposal.decision_comment}”</p>}
                <p className="text-xs text-blue-600 mt-3">Marmoset will follow up with an updated proposal.</p>
              </div>
            )}
            {(proposal.status === 'draft' || proposal.status === 'declined' || proposal.status === 'expired') && (
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm text-gray-500">
                This proposal isn’t currently open for sign-off. Please contact Marmoset.
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">Marmoset Digital Media · Agency OS</p>
      </div>
    </div>
  )
}
