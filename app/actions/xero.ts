'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  adminDb, disconnect, markSynced, fetchAllInvoices, fetchContacts,
  mapStatus, xeroDate, type XeroContact,
} from '@/lib/xero'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return { error: 'Admins only' as const }
  return { error: null }
}

// Pull sales invoices from Xero and upsert into `invoices`, matched to companies
// via companies.xero_contact_id. Invoices whose Xero contact isn't linked are skipped.
export async function syncInvoices(): Promise<{ error?: string; synced?: number; skipped?: number }> {
  const { error } = await requireAdmin()
  if (error) return { error }

  const admin = adminDb()

  // contactId -> companyId
  const { data: companies } = await admin
    .from('companies').select('id, xero_contact_id').not('xero_contact_id', 'is', null)
  const companyByContact = new Map<string, string>()
  for (const c of companies ?? []) if (c.xero_contact_id) companyByContact.set(c.xero_contact_id, c.id)

  let invoices
  try {
    invoices = await fetchAllInvoices()
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Xero sync failed' }
  }

  let synced = 0, skipped = 0
  const rows = []
  for (const inv of invoices) {
    const contactId = inv.Contact?.ContactID
    const companyId = contactId ? companyByContact.get(contactId) : undefined
    if (!companyId) { skipped++; continue }
    const due = xeroDate(inv.DueDate)
    rows.push({
      xero_invoice_id: inv.InvoiceID,
      company_id: companyId,
      invoice_number: inv.InvoiceNumber || `XERO-${inv.InvoiceID.slice(0, 8)}`,
      amount: inv.Total ?? 0,
      amount_paid: inv.AmountPaid ?? 0,
      currency: inv.CurrencyCode ?? 'AUD',
      status: mapStatus(inv.Status, due, inv.AmountDue),
      issue_date: xeroDate(inv.Date),
      due_date: due,
      paid_date: xeroDate(inv.FullyPaidOnDate),
      line_items: inv.LineItems ?? [],
      xero_synced_at: new Date().toISOString(),
    })
    synced++
  }

  if (rows.length) {
    const { error: e } = await admin.from('invoices').upsert(rows, { onConflict: 'xero_invoice_id' })
    if (e) return { error: e.message }
  }
  await markSynced()

  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  revalidatePath('/settings')
  return { synced, skipped }
}

export async function disconnectXero() {
  const { error } = await requireAdmin()
  if (error) return { error }
  await disconnect()
  revalidatePath('/settings')
  revalidatePath('/dashboard')
}

// For the per-client link UI: list of Xero contacts to choose from.
export async function getXeroContacts(): Promise<{ contacts?: XeroContact[]; error?: string }> {
  const { error } = await requireAdmin()
  if (error) return { error }
  try {
    return { contacts: await fetchContacts() }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not load Xero contacts' }
  }
}

// Link (or clear) a company's Xero contact.
export async function linkCompanyToXeroContact(companyId: string, xeroContactId: string) {
  const { error } = await requireAdmin()
  if (error) return { error }
  const admin = adminDb()
  const value = xeroContactId === '' ? null : xeroContactId
  const { error: e } = await admin.from('companies').update({ xero_contact_id: value }).eq('id', companyId)
  if (e) return { error: e.message }
  revalidatePath('/settings')
  revalidatePath('/invoices')
}
