import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProposalBuilder, { type BuilderService, type BuilderContact, type BuilderTemplate } from '../ProposalBuilder'

export const metadata = { title: 'New proposal' }

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ company_id?: string }>
}) {
  const { company_id } = await searchParams
  if (!company_id) redirect('/clients')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: company }, { data: services }, { data: contacts }, { data: templates }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('id', company_id).single(),
    supabase.from('services').select('id, name, pricing_type, fixed_price, monthly_fee, hourly_rate').eq('is_active', true).order('sort_order', { ascending: true }).order('name', { ascending: true }),
    supabase.from('contacts').select('id, first_name, last_name, is_primary').eq('company_id', company_id).order('is_primary', { ascending: false }),
    supabase.from('proposal_templates').select('id, name, description, content').order('name', { ascending: true }),
  ])
  if (!company) redirect('/clients')

  return (
    <ProposalBuilder
      companyId={company.id}
      companyName={company.name}
      services={(services ?? []) as BuilderService[]}
      contacts={(contacts ?? []) as BuilderContact[]}
      templates={(templates ?? []) as BuilderTemplate[]}
    />
  )
}
