import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { updateSettings, updateUserCostRate } from '@/app/actions/billing'
import { getXeroStatus } from '@/lib/xero'
import XeroSettings from './XeroSettings'

export const metadata = { title: 'Settings' }

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ xero?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') redirect('/dashboard')

  const { xero } = await searchParams

  const { data: settingsRows } = await supabase.from('app_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const r of settingsRows ?? []) settings[r.key] = r.value ?? ''

  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, role, cost_rate')
    .order('full_name', { ascending: true })

  const [xeroStatus, { data: companies }] = await Promise.all([
    getXeroStatus(),
    supabase.from('companies').select('id, name, status, xero_contact_id').order('name', { ascending: true }),
  ])

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Billing rates, defaults, and Xero.</p>
      </div>

      {/* Global default rates */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-1">Default rates</h2>
        <p className="text-sm text-gray-500 mb-4">
          Used when a client has no specific billable rate, and as the default internal cost rate.
        </p>
        <form action={async (formData) => { 'use server'; await updateSettings(formData) }} className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Default billable rate ($/hr)</label>
            <input name="default_billable_rate" type="number" step="0.01" min="0" defaultValue={settings.default_billable_rate ?? '0'} className="input w-48" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Default cost rate ($/hr)</label>
            <input name="default_cost_rate" type="number" step="0.01" min="0" defaultValue={settings.default_cost_rate ?? '0'} className="input w-48" />
          </div>
          <button type="submit" className="bg-[#E8611A] hover:bg-[#d45516] text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
            Save defaults
          </button>
        </form>
      </div>

      {/* Per-team-member cost rates */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-1">Team cost rates</h2>
        <p className="text-sm text-gray-500 mb-4">
          Notional internal cost per person ($/hr) — used for profitability, never billed to clients.
          Leave blank to use the default cost rate.
        </p>
        <div className="space-y-3">
          {(users ?? []).map(u => (
            <form key={u.id} action={async (formData) => { 'use server'; await updateUserCostRate(formData) }} className="flex items-center gap-3">
              <input type="hidden" name="user_id" value={u.id} />
              <div className="w-56">
                <div className="text-sm font-medium text-gray-900">{u.full_name}</div>
                <div className="text-xs text-gray-400 capitalize">{u.role?.replace('_', ' ')}</div>
              </div>
              <input
                name="cost_rate"
                type="number"
                step="0.01"
                min="0"
                defaultValue={u.cost_rate ?? ''}
                placeholder="Default"
                className="input w-40"
              />
              <button type="submit" className="border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition">
                Save
              </button>
            </form>
          ))}
        </div>
      </div>

      {/* Xero */}
      <XeroSettings
        status={xeroStatus}
        companies={(companies ?? []).map(c => ({ id: c.id, name: c.name, status: c.status, xeroContactId: c.xero_contact_id ?? null }))}
        notice={xero ?? null}
      />
    </div>
  )
}
