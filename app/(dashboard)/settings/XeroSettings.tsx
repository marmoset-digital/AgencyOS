'use client'

import { useMemo, useState, useTransition } from 'react'
import { syncInvoices, disconnectXero, getXeroContacts, linkCompanyToXeroContact } from '@/app/actions/xero'

interface XeroStatus {
  connected: boolean
  tenantName: string | null
  connectedAt: string | null
  lastSyncedAt: string | null
}
interface Company { id: string; name: string; status: string | null; xeroContactId: string | null }
interface Contact { ContactID: string; Name: string }

const NOTICES: Record<string, { text: string; ok: boolean }> = {
  connected: { text: 'Connected to Xero.', ok: true },
  error: { text: 'Something went wrong talking to Xero. Please try again.', ok: false },
  state_error: { text: 'Security check failed (state mismatch). Please try connecting again.', ok: false },
  no_org: { text: 'No Xero organisation was authorised.', ok: false },
  not_configured: { text: 'Xero isn’t configured yet (missing app credentials).', ok: false },
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function XeroSettings({
  status, companies, notice,
}: {
  status: XeroStatus
  companies: Company[]
  notice: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [contactsError, setContactsError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [showAll, setShowAll] = useState(false)
  // local view of links so the UI updates immediately after saving
  const [links, setLinks] = useState<Record<string, string | null>>(
    Object.fromEntries(companies.map(c => [c.id, c.xeroContactId]))
  )
  const [savedId, setSavedId] = useState<string | null>(null)

  const bannerNotice = notice ? NOTICES[notice] : null

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return companies.filter(c => {
      const linked = !!links[c.id]
      if (!showAll && c.status !== 'active_client' && !linked) return false
      if (f && !c.name.toLowerCase().includes(f)) return false
      return true
    })
  }, [companies, links, filter, showAll])

  const linkedCount = Object.values(links).filter(Boolean).length

  function doSync() {
    setSyncMsg(null)
    startTransition(async () => {
      const r = await syncInvoices()
      if (r?.error) setSyncMsg(`Error: ${r.error}`)
      else setSyncMsg(`Synced ${r?.synced ?? 0} invoice(s). Skipped ${r?.skipped ?? 0} (unlinked contact).`)
    })
  }

  function doDisconnect() {
    if (!confirm('Disconnect Xero? Stored tokens will be removed.')) return
    startTransition(async () => { await disconnectXero() })
  }

  function loadContacts() {
    setLoadingContacts(true)
    setContactsError(null)
    startTransition(async () => {
      const r = await getXeroContacts()
      setLoadingContacts(false)
      if (r?.error) setContactsError(r.error)
      else setContacts((r?.contacts ?? []).sort((a, b) => a.Name.localeCompare(b.Name)))
    })
  }

  function setLink(companyId: string, contactId: string) {
    setLinks(prev => ({ ...prev, [companyId]: contactId || null }))
    startTransition(async () => {
      await linkCompanyToXeroContact(companyId, contactId)
      setSavedId(companyId)
      setTimeout(() => setSavedId(null), 1500)
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-gray-900">Xero</h2>
        {status.connected && (
          <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Connected</span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Connect your Marmoset Xero organisation to pull invoice status into Agency OS.
      </p>

      {bannerNotice && (
        <div className={`text-sm rounded-lg px-3 py-2 mb-4 ${bannerNotice.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {bannerNotice.text}
        </div>
      )}

      {!status.connected ? (
        <a
          href="/api/xero/connect"
          className="inline-block bg-[#E8611A] hover:bg-[#d45516] text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          Connect to Xero
        </a>
      ) : (
        <>
          <div className="text-sm text-gray-600 space-y-1 mb-4">
            <div><span className="text-gray-400">Organisation:</span> {status.tenantName ?? '—'}</div>
            <div><span className="text-gray-400">Connected:</span> {fmt(status.connectedAt)}</div>
            <div><span className="text-gray-400">Last synced:</span> {fmt(status.lastSyncedAt)}</div>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={doSync}
              disabled={isPending}
              className="bg-[#E8611A] hover:bg-[#d45516] text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              {isPending ? 'Working…' : 'Sync invoices now'}
            </button>
            <button
              onClick={doDisconnect}
              disabled={isPending}
              className="border border-gray-200 hover:border-red-300 hover:text-red-600 text-gray-600 text-sm font-medium px-3 py-2 rounded-lg transition disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
          {syncMsg && <div className="text-xs text-gray-500 mb-4">{syncMsg}</div>}

          {/* Client -> Xero contact linking */}
          <div className="mt-6 border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-800">Link clients to Xero contacts</h3>
              <span className="text-xs text-gray-400">{linkedCount} linked</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Match each client to its Xero contact so invoices attribute correctly. Only linked clients&apos; invoices are synced.
            </p>

            {!contacts ? (
              <button
                onClick={loadContacts}
                disabled={loadingContacts || isPending}
                className="border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition disabled:opacity-50"
              >
                {loadingContacts ? 'Loading contacts…' : 'Load Xero contacts to link'}
              </button>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <input
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder="Filter clients…"
                    className="input text-sm w-56"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
                    Show all clients (not just active)
                  </label>
                </div>
                <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto pr-1">
                  {visible.map(c => (
                    <div key={c.id} className="flex items-center gap-3">
                      <span className="text-sm text-gray-800 w-56 truncate" title={c.name}>{c.name}</span>
                      <select
                        value={links[c.id] ?? ''}
                        onChange={e => setLink(c.id, e.target.value)}
                        className="input text-sm flex-1"
                      >
                        <option value="">— Not linked —</option>
                        {contacts.map(ct => (
                          <option key={ct.ContactID} value={ct.ContactID}>{ct.Name}</option>
                        ))}
                      </select>
                      {savedId === c.id && <span className="text-xs text-green-600">Saved</span>}
                    </div>
                  ))}
                  {visible.length === 0 && (
                    <div className="text-xs text-gray-400 py-2">No matching clients.</div>
                  )}
                </div>
              </>
            )}
            {contactsError && <div className="text-xs text-red-600 mt-2">{contactsError}</div>}
          </div>
        </>
      )}
    </div>
  )
}
