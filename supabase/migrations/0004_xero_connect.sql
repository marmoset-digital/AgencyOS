-- 0004_xero_connect.sql
-- Phase 2b: Xero read integration.
-- Adds (1) a per-client link to a Xero contact, (2) a single org-wide Xero OAuth
-- connection row (locked down to the service role), and (3) a unique index so we
-- can upsert invoices by their Xero id. The `invoices` table already has all the
-- Xero columns (company_id, xero_invoice_id, amount, amount_paid, currency,
-- status, issue_date, due_date, paid_date, line_items, xero_synced_at) so it
-- needs no changes here. Idempotent: safe to run more than once.

-- 1) Link an Agency OS company to a Xero contact (contact matching is manual).
alter table public.companies
  add column if not exists xero_contact_id text;

-- 2) Single org-wide Xero OAuth connection (one Marmoset Xero org).
--    Tokens are sensitive: RLS is ON with NO policies, so ONLY the service-role
--    (admin) client can read/write. Never exposed to the browser/anon.
--    Singleton enforced via id boolean PK defaulting to true + CHECK(id).
create table if not exists public.xero_connection (
  id            boolean primary key default true,
  tenant_id     text not null,
  tenant_name   text,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  connected_by  uuid references public.users(id) on delete set null,
  connected_at  timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at    timestamptz not null default now(),
  constraint xero_connection_singleton check (id)
);

alter table public.xero_connection enable row level security;
-- Intentionally no policies: only the service role (createAdminClient) can access.

-- 3) Allow upserting invoices by their Xero id (partial: only when set).
create unique index if not exists invoices_xero_invoice_id_key
  on public.invoices (xero_invoice_id)
  where xero_invoice_id is not null;

-- Helpful for the per-client contact link lookups during sync.
create index if not exists companies_xero_contact_id_idx
  on public.companies (xero_contact_id)
  where xero_contact_id is not null;

-- 4) Ensure team members can READ invoices (dashboard overdue list). Invoices are
--    WRITTEN only by the sync via the service-role client, which bypasses RLS, so
--    no insert/update policy is needed here. Idempotent (drop-then-create).
drop policy if exists "team_read_invoices" on public.invoices;
create policy "team_read_invoices" on public.invoices
  for select to authenticated
  using (public.is_team_member());
