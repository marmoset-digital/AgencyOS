// Xero OAuth2 + read-only API helper (Phase 2b).
// One org-wide connection stored in public.xero_connection (service-role only).
// Never import this from a Client Component — it reads secrets + tokens.

import { createClient as createServiceClient } from '@supabase/supabase-js'

// TRUE service-role client — bypasses RLS. We deliberately do NOT use the shared
// createAdminClient() from lib/supabase/server: that one is built with
// @supabase/ssr + the request cookies, so when a user is signed in their JWT
// overrides the service-role key and RLS still applies. This client sends no
// cookies/session, so it genuinely bypasses RLS (needed for the policy-less
// xero_connection table and for writing invoices).
export function adminDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

const AUTH_URL = 'https://login.xero.com/identity/connect/authorize'
const TOKEN_URL = 'https://identity.xero.com/connect/token'
const CONNECTIONS_URL = 'https://api.xero.com/connections'
const API_BASE = 'https://api.xero.com/api.xro/2.0'

// Scopes: invoices (read+write, for sync AND creating drafts) + contacts (read),
// plus offline_access for refresh. NOTE: apps created after 2 Mar 2026 only get the
// NEW granular scopes — accounting.invoices covers both reading and writing invoices.
export const XERO_SCOPES =
  'openid profile email offline_access accounting.invoices accounting.contacts.read'

function creds() {
  const clientId = process.env.XERO_CLIENT_ID
  const clientSecret = process.env.XERO_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Xero not configured: set XERO_CLIENT_ID and XERO_CLIENT_SECRET.')
  }
  return { clientId, clientSecret }
}

function basicAuth() {
  const { clientId, clientSecret } = creds()
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

// ── OAuth ────────────────────────────────────────────────────────────────
export function buildAuthorizeUrl(redirectUri: string, state: string) {
  const { clientId } = creds()
  // Build manually with encodeURIComponent so spaces in `scope` become %20, not '+'.
  // Xero's authorize endpoint does NOT decode '+' to a space and rejects it as invalid_scope.
  const q = [
    'response_type=code',
    `client_id=${encodeURIComponent(clientId)}`,
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
    `scope=${encodeURIComponent(XERO_SCOPES)}`,
    `state=${encodeURIComponent(state)}`,
  ].join('&')
  return `${AUTH_URL}?${q}`
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  })
  if (!res.ok) throw new Error(`Xero token exchange failed (${res.status}): ${await res.text()}`)
  return res.json()
}

async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!res.ok) throw new Error(`Xero token refresh failed (${res.status}): ${await res.text()}`)
  return res.json()
}

export async function getConnections(accessToken: string): Promise<Array<{ tenantId: string; tenantName: string }>> {
  const res = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Xero connections failed (${res.status}): ${await res.text()}`)
  return res.json()
}

// ── Connection storage (service-role only) ────────────────────────────────
export interface XeroConnectionRow {
  id: boolean
  tenant_id: string
  tenant_name: string | null
  access_token: string
  refresh_token: string
  expires_at: string
  connected_by: string | null
  connected_at: string
  last_synced_at: string | null
}

export async function getStoredConnection(): Promise<XeroConnectionRow | null> {
  const admin = adminDb()
  const { data } = await admin.from('xero_connection').select('*').eq('id', true).maybeSingle()
  return (data as XeroConnectionRow) ?? null
}

export async function saveConnection(args: {
  tenantId: string
  tenantName: string | null
  accessToken: string
  refreshToken: string
  expiresIn: number
  connectedBy?: string | null
}) {
  const admin = adminDb()
  const expiresAt = new Date(Date.now() + args.expiresIn * 1000).toISOString()
  const now = new Date().toISOString()
  const { error } = await admin.from('xero_connection').upsert({
    id: true,
    tenant_id: args.tenantId,
    tenant_name: args.tenantName,
    access_token: args.accessToken,
    refresh_token: args.refreshToken,
    expires_at: expiresAt,
    connected_by: args.connectedBy ?? null,
    connected_at: now,
    updated_at: now,
  }, { onConflict: 'id' })
  if (error) throw new Error(`Failed to store Xero connection: ${error.message}`)
}

export async function disconnect() {
  const admin = adminDb()
  await admin.from('xero_connection').delete().eq('id', true)
}

export async function markSynced() {
  const admin = adminDb()
  await admin.from('xero_connection').update({ last_synced_at: new Date().toISOString() }).eq('id', true)
}

// Safe, token-free status for the Settings UI.
export interface XeroStatus {
  connected: boolean
  tenantName: string | null
  connectedAt: string | null
  lastSyncedAt: string | null
}

export async function getXeroStatus(): Promise<XeroStatus> {
  const conn = await getStoredConnection()
  return {
    connected: !!conn,
    tenantName: conn?.tenant_name ?? null,
    connectedAt: conn?.connected_at ?? null,
    lastSyncedAt: conn?.last_synced_at ?? null,
  }
}

// Returns a valid access token + tenant id, refreshing (and persisting) if within 60s of expiry.
async function getValidAccess(): Promise<{ accessToken: string; tenantId: string }> {
  const conn = await getStoredConnection()
  if (!conn) throw new Error('Xero is not connected.')

  const exp_ms = new Date(conn.expires_at).getTime()
  if (exp_ms - Date.now() > 60_000) {
    return { accessToken: conn.access_token, tenantId: conn.tenant_id }
  }

  const t = await refreshTokens(conn.refresh_token)
  const admin = adminDb()
  await admin.from('xero_connection').update({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', true)
  return { accessToken: t.access_token, tenantId: conn.tenant_id }
}

// ── Read API ──────────────────────────────────────────────────────────────
async function apiGet(path: string): Promise<Record<string, unknown>> {
  const { accessToken, tenantId } = await getValidAccess()
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Xero API ${path} failed (${res.status}): ${await res.text()}`)
  return res.json()
}

export interface XeroInvoice {
  InvoiceID: string
  InvoiceNumber?: string
  Type?: string
  Status?: string
  Contact?: { ContactID?: string; Name?: string }
  Total?: number
  AmountPaid?: number
  AmountDue?: number
  CurrencyCode?: string
  Date?: string
  DueDate?: string
  FullyPaidOnDate?: string
  LineItems?: unknown[]
}

// Sales invoices only (ACCREC), paged.
export async function fetchAllInvoices(): Promise<XeroInvoice[]> {
  const all: XeroInvoice[] = []
  for (let page = 1; page <= 50; page++) {
    const data = await apiGet(`/Invoices?where=${encodeURIComponent('Type=="ACCREC"')}&page=${page}&pageSize=100`)
    const batch = (data.Invoices as XeroInvoice[]) ?? []
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all
}

export interface XeroContact {
  ContactID: string
  Name: string
}

export async function fetchContacts(): Promise<XeroContact[]> {
  const all: XeroContact[] = []
  for (let page = 1; page <= 50; page++) {
    const data = await apiGet(`/Contacts?page=${page}&pageSize=100`)
    const batch = (data.Contacts as XeroContact[]) ?? []
    all.push(...batch.map(c => ({ ContactID: c.ContactID, Name: c.Name })))
    if (batch.length < 100) break
  }
  return all
}

// ── Write API (Phase 2c: create draft invoices) ──────────────────────────
export interface NewInvoiceLine {
  Description: string
  Quantity: number
  UnitAmount: number
  AccountCode?: string
}

export interface NewInvoice {
  contactId: string
  date: string            // YYYY-MM-DD
  dueDate: string         // YYYY-MM-DD
  reference?: string
  lineItems: NewInvoiceLine[]
  gstExclusive: boolean   // true → LineAmountTypes 'Exclusive' (add 10% GST on top)
}

export interface CreatedInvoice {
  InvoiceID: string
  InvoiceNumber?: string
  Total?: number
  AmountDue?: number
  CurrencyCode?: string
  Status?: string
  Date?: string
  DueDate?: string
}

// POST a DRAFT ACCREC (sales) invoice to Xero. Uses a valid (refreshed) token + tenant.
export async function createDraftInvoice(inv: NewInvoice): Promise<CreatedInvoice> {
  const { accessToken, tenantId } = await getValidAccess()
  const body = {
    Invoices: [{
      Type: 'ACCREC',
      Status: 'DRAFT',
      Contact: { ContactID: inv.contactId },
      Date: inv.date,
      DueDate: inv.dueDate,
      Reference: inv.reference,
      LineAmountTypes: inv.gstExclusive ? 'Exclusive' : 'Inclusive',
      LineItems: inv.lineItems.map(l => ({
        Description: l.Description,
        Quantity: l.Quantity,
        UnitAmount: l.UnitAmount,
        ...(l.AccountCode ? { AccountCode: l.AccountCode } : {}),
      })),
    }],
  }
  const res = await fetch(`${API_BASE}/Invoices`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Xero create invoice failed (${res.status}): ${await res.text()}`)
  const data = await res.json()
  const created = (data.Invoices as CreatedInvoice[])?.[0]
  if (!created?.InvoiceID) throw new Error('Xero did not return a created invoice.')
  return created
}

// Map a Xero /Date(1690000000000+0000)/ or ISO string to a YYYY-MM-DD date, or null.
export function xeroDate(v?: string): string | null {
  if (!v) return null
  const m = /\/Date\((\d+)/.exec(v)
  const d = m ? new Date(Number(m[1])) : new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

// Map Xero status → our invoices.status. Allowed values (DB check constraint):
// draft | sent | paid | overdue | voided  (note: no 'cancelled').
export function mapStatus(xeroStatus?: string, dueDate?: string | null, amountDue?: number): string {
  switch ((xeroStatus ?? '').toUpperCase()) {
    case 'DRAFT': return 'draft'
    case 'SUBMITTED': return 'sent'
    case 'AUTHORISED': {
      const overdue = !!dueDate && new Date(dueDate) < new Date() && (amountDue ?? 0) > 0
      return overdue ? 'overdue' : 'sent'
    }
    case 'PAID': return 'paid'
    case 'VOIDED': return 'voided'
    case 'DELETED': return 'voided' // no 'cancelled' in the constraint; treat deleted as voided
    default: return 'sent'
  }
}
