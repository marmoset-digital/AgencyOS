import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const statusColours: Record<string, string> = {
  lead: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
  churned: 'bg-red-100 text-red-700',
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: company }, { data: contacts }, { data: projects }, { data: invoices }, { data: tickets }] =
    await Promise.all([
      supabase.from('companies').select('*').eq('id', id).single(),
      supabase.from('contacts').select('*').eq('company_id', id).order('is_primary', { ascending: false }),
      supabase.from('projects').select('id, name, stage, type, start_date, end_date').eq('company_id', id).order('created_at', { ascending: false }).limit(5),
      supabase.from('invoices').select('id, invoice_number, status, amount, due_date').eq('company_id', id).order('created_at', { ascending: false }).limit(5),
      supabase.from('support_tickets').select('id, subject, status, priority, created_at').eq('company_id', id).order('created_at', { ascending: false }).limit(5),
    ])

  if (!company) notFound()

  const stageLabels: Record<string, string> = {
    quote_sent: 'Quote Sent', proposal_accepted: 'Proposal Accepted', onboarding: 'Onboarding',
    active: 'Active', awaiting_feedback: 'Awaiting Feedback', paused: 'Paused',
    complete: 'Complete', invoiced_closed: 'Invoiced & Closed',
  }

  const invoiceStatusColours: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700',
    paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700', voided: 'bg-gray-100 text-gray-400',
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link href="/clients" className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">← Back to Clients</Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusColours[company.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {company.status}
            </span>
          </div>
          {company.industry && <p className="text-gray-500 mt-1">{company.industry}</p>}
        </div>
        <Link
          href={`/clients/${id}/edit`}
          className="text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition"
        >
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column */}
        <div className="col-span-1 space-y-5">
          {/* Details card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Details</h2>
            <dl className="space-y-3 text-sm">
              {company.website && (
                <div>
                  <dt className="text-gray-500 text-xs mb-0.5">Website</dt>
                  <dd><a href={company.website} target="_blank" rel="noopener noreferrer" className="text-[#E8611A] hover:underline">{company.website.replace(/^https?:\/\//, '')}</a></dd>
                </div>
              )}
              {company.abn_acn && (
                <div>
                  <dt className="text-gray-500 text-xs mb-0.5">ABN / ACN</dt>
                  <dd className="text-gray-900">{company.abn_acn}</dd>
                </div>
              )}
              {company.billing_address && (
                <div>
                  <dt className="text-gray-500 text-xs mb-0.5">Billing Address</dt>
                  <dd className="text-gray-900">{company.billing_address}</dd>
                </div>
              )}
              {company.lead_source && (
                <div>
                  <dt className="text-gray-500 text-xs mb-0.5">Lead Source</dt>
                  <dd className="text-gray-900 capitalize">{company.lead_source.replace('_', ' ')}</dd>
                </div>
              )}
              {company.lead_stage && (
                <div>
                  <dt className="text-gray-500 text-xs mb-0.5">Lead Stage</dt>
                  <dd className="text-gray-900 capitalize">{company.lead_stage.replace('_', ' ')}</dd>
                </div>
              )}
              {company.estimated_value && (
                <div>
                  <dt className="text-gray-500 text-xs mb-0.5">Estimated Value</dt>
                  <dd className="text-gray-900 font-medium">${Number(company.estimated_value).toLocaleString('en-AU')}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500 text-xs mb-0.5">Added</dt>
                <dd className="text-gray-900">{new Date(company.created_at).toLocaleDateString('en-AU')}</dd>
              </div>
            </dl>
          </div>

          {/* Notes */}
          {company.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Notes</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{company.notes}</p>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="col-span-2 space-y-5">
          {/* Contacts */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Contacts</h2>
              <Link href={`/clients/${id}/contacts/new`} className="text-xs text-[#E8611A] hover:underline font-medium">+ Add Contact</Link>
            </div>
            {contacts && contacts.length > 0 ? (
              <div className="space-y-3">
                {contacts.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{c.first_name} {c.last_name}</span>
                        {c.is_primary && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Primary</span>}
                      </div>
                      {c.job_title && <div className="text-xs text-gray-500">{c.job_title}</div>}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-600">{c.email}</div>
                      {c.phone && <div className="text-xs text-gray-400">{c.phone}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 py-2">No contacts yet — <Link href={`/clients/${id}/contacts/new`} className="text-[#E8611A] hover:underline">add one</Link></p>
            )}
          </div>

          {/* Projects */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Projects</h2>
              <Link href={`/projects/new?company_id=${id}`} className="text-xs text-[#E8611A] hover:underline font-medium">+ New Project</Link>
            </div>
            {projects && projects.length > 0 ? (
              <div className="space-y-2">
                {projects.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <Link href={`/projects/${p.id}`} className="text-sm font-medium text-gray-900 hover:text-[#E8611A]">{p.name}</Link>
                    <span className="text-xs text-gray-500 capitalize">{stageLabels[p.stage] ?? p.stage}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 py-2">No projects yet</p>
            )}
          </div>

          {/* Invoices */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Invoices</h2>
              <Link href="/invoices" className="text-xs text-[#E8611A] hover:underline font-medium">View all</Link>
            </div>
            {invoices && invoices.length > 0 ? (
              <div className="space-y-2">
                {invoices.map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{inv.invoice_number ?? 'Draft'}</div>
                      {inv.due_date && <div className="text-xs text-gray-400">Due {new Date(inv.due_date).toLocaleDateString('en-AU')}</div>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${invoiceStatusColours[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>{inv.status}</span>
                      <span className="text-sm font-semibold text-gray-900">${Number(inv.amount).toLocaleString('en-AU')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 py-2">No invoices yet</p>
            )}
          </div>

          {/* Support Tickets */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Support Tickets</h2>
              <Link href="/tickets" className="text-xs text-[#E8611A] hover:underline font-medium">View all</Link>
            </div>
            {tickets && tickets.length > 0 ? (
              <div className="space-y-2">
                {tickets.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <Link href={`/tickets/${t.id}`} className="text-sm font-medium text-gray-900 hover:text-[#E8611A]">{t.subject}</Link>
                    <span className="text-xs text-gray-500 capitalize">{t.status.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 py-2">No tickets yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
