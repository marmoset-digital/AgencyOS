import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ServicesManager from './ServicesManager'

export const metadata = { title: 'Services' }

export interface Service {
  id: string
  name: string
  description: string | null
  pricing_type: string
  fixed_price: number | null
  monthly_fee: number | null
  hourly_rate: number | null
  is_active: boolean
  sort_order: number | null
}

export default async function ServicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: services } = await supabase
    .from('services')
    .select('id, name, description, pricing_type, fixed_price, monthly_fee, hourly_rate, is_active, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Services</h1>
        <p className="text-gray-500 mt-1">Your service catalogue — reusable line items for proposals and quotes.</p>
      </div>

      <ServicesManager services={(services ?? []) as Service[]} />
    </div>
  )
}
