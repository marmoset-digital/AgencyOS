import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ProposalBuilder, { type BuilderService, type BuilderContact, type BuilderProposal } from '../ProposalBuilder'

export const metadata = { title: 'Edit proposal' }

export default async function EditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, company_id, title, content, expires_at, contact_id, proposal_number')
    .eq('id', id)
    .single()
  if (!proposal) notFound()

  const [{ data: company }, { data: services }, { data: contacts }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('id', proposal.company_id).single(),
    supabase.from('services').select('id, name, pricing_type, fixed_price, monthly_fee, hourly_rate').eq('is_active', true).order('sort_order', { ascending: true }).order('name', { ascending: true }),
    supabase.from('contacts').select('id, first_name, last_name, is_primary').eq('company_id', proposal.company_id).order('is_primary', { ascending: false }),
  ])
  if (!company) notFound()

  return (
    <ProposalBuilder
      companyId={company.id}
      companyName={company.name}
      services={(services ?? []) as BuilderService[]}
      contacts={(contacts ?? []) as BuilderContact[]}
      proposal={{
        id: proposal.id,
        title: proposal.title,
        content: proposal.content as BuilderProposal['content'],
        expires_at: proposal.expires_at,
        contact_id: proposal.contact_id,
        proposal_number: proposal.proposal_number,
      }}
    />
  )
}
