'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createService, updateService, setServiceActive } from '@/app/actions/services'
import type { Service } from './page'

const PRICING = [
  { value: 'fixed', label: 'Fixed price' },
  { value: 'subscription', label: 'Subscription (monthly)' },
  { value: 'hourly', label: 'Hourly' },
]

function priceLabel(s: Service) {
  const money = (n: number | null) => (n != null ? `$${Number(n).toLocaleString('en-AU')}` : null)
  if (s.pricing_type === 'fixed') return money(s.fixed_price) ? `${money(s.fixed_price)} fixed` : 'Fixed'
  if (s.pricing_type === 'subscription') return money(s.monthly_fee) ? `${money(s.monthly_fee)}/mo` : 'Subscription'
  if (s.pricing_type === 'hourly') return money(s.hourly_rate) ? `${money(s.hourly_rate)}/hr` : 'Hourly'
  return s.pricing_type
}

export default function ServicesManager({ services }: { services: Service[] }) {
  const [adding, setAdding] = useState(false)
  const active = services.filter(s => s.is_active)
  const inactive = services.filter(s => !s.is_active)

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setAdding(a => !a)} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
          {adding ? 'Cancel' : '+ New service'}
        </button>
      </div>

      {adding && (
        <div className="bg-white rounded-xl border border-[#E8611A] p-5 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">New service</h2>
          <ServiceForm onDone={() => setAdding(false)} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {active.length === 0 && inactive.length === 0 ? (
          <p className="text-sm text-gray-400">No services yet — add your first one.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {active.map(s => <ServiceRow key={s.id} service={s} />)}
            {inactive.length > 0 && (
              <div className="pt-4 mt-2">
                <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Inactive</div>
                {inactive.map(s => <ServiceRow key={s.id} service={s} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function ServiceRow({ service }: { service: Service }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <div className="py-3">
        <ServiceForm service={service} onDone={() => setEditing(false)} />
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3 py-3 ${service.is_active ? '' : 'opacity-60'}`}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900">{service.name}</div>
        {service.description && <div className="text-xs text-gray-400 truncate">{service.description}</div>}
      </div>
      <span className="text-sm text-gray-700 shrink-0">{priceLabel(service)}</span>
      <button onClick={() => setEditing(true)} className="text-xs text-gray-500 hover:text-gray-800 shrink-0">Edit</button>
      <button
        onClick={() => startTransition(async () => { await setServiceActive(service.id, !service.is_active); router.refresh() })}
        disabled={isPending}
        className="text-xs text-gray-400 hover:text-gray-700 shrink-0 disabled:opacity-50"
      >
        {service.is_active ? 'Deactivate' : 'Reactivate'}
      </button>
    </div>
  )
}

function ServiceForm({ service, onDone }: { service?: Service; onDone: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pricing, setPricing] = useState(service?.pricing_type ?? 'fixed')
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = service ? await updateService(service.id, fd) : await createService(fd)
      if (res.error) { setError(res.error); return }
      onDone()
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input name="name" defaultValue={service?.name ?? ''} placeholder="Service name" className="input text-sm w-full" />
      <input name="description" defaultValue={service?.description ?? ''} placeholder="Description (optional)" className="input text-sm w-full" />
      <div className="flex flex-wrap gap-2">
        <select name="pricing_type" value={pricing} onChange={e => setPricing(e.target.value)} className="input text-sm w-52">
          {PRICING.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {pricing === 'fixed' && (
          <input name="fixed_price" type="number" step="0.01" min="0" defaultValue={service?.fixed_price ?? ''} placeholder="Fixed price ($)" className="input text-sm w-40" />
        )}
        {pricing === 'subscription' && (
          <input name="monthly_fee" type="number" step="0.01" min="0" defaultValue={service?.monthly_fee ?? ''} placeholder="Monthly fee ($)" className="input text-sm w-40" />
        )}
        {pricing === 'hourly' && (
          <input name="hourly_rate" type="number" step="0.01" min="0" defaultValue={service?.hourly_rate ?? ''} placeholder="Hourly rate ($)" className="input text-sm w-40" />
        )}
        <input name="sort_order" type="number" step="1" defaultValue={service?.sort_order ?? 0} placeholder="Sort" className="input text-sm w-20" title="Sort order" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={isPending} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
          {isPending ? 'Saving…' : (service ? 'Save changes' : 'Add service')}
        </button>
        <button type="button" onClick={onDone} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </form>
  )
}
