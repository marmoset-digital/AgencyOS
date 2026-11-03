-- ============================================================================
-- 0025_enquiries.sql
-- Step 8 (enquiry -> paid project), part 1.
--
-- 1. An `enquiries` table: every website enquiry lands here first, raw. A
--    company and contact are only created when someone approves the enquiry, so
--    spam and poor-fit enquiries never clutter the client list.
-- 2. Links that let each automation step find the previous one, and make every
--    step idempotent by a natural key (one proposal per enquiry, one invoice per
--    proposal):
--      proposals.enquiry_id, proposals.template_id, invoices.proposal_id
-- 3. Richer event payloads so n8n can route without a second lookup:
--      enquiry.received (new), proposal.* gains template_id / total_value /
--      enquiry_id, invoice.paid gains proposal_id.
--
-- Additive and idempotent. Safe to re-run.
-- ============================================================================

-- ── 1. enquiries ────────────────────────────────────────────────────────────

create table if not exists public.enquiries (
  id               uuid primary key default gen_random_uuid(),
  source           text not null default 'website',
  form_id          text,                 -- Gravity Forms form id
  entry_id         text,                 -- Gravity Forms entry id (dedupes webhook retries)
  first_name       text,
  last_name        text,
  email            text not null,
  phone            text,
  company_name     text,
  website          text,
  service_interest text,
  message          text,
  raw              jsonb not null default '{}'::jsonb,   -- the full submission, for debugging

  -- Set at intake if the email matches an existing contact; otherwise on approval.
  company_id       uuid references public.companies(id) on delete set null,
  contact_id       uuid references public.contacts(id)  on delete set null,

  status           text not null default 'new'
                     check (status in ('new', 'spam', 'poor_fit', 'declined', 'approved', 'proposal_sent')),
  ai_verdict       text,                 -- 'good_fit' | 'poor_fit' | 'spam'
  ai_summary       text,
  ai_model         text,
  triaged_at       timestamptz,
  decided_by       text,                 -- who clicked Approve / Decline (email or name)
  decided_at       timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.enquiries is
  'Inbound enquiries (website form). Written by /api/intake/enquiry, triaged by n8n. A company/contact is created only on approval.';

create unique index if not exists enquiries_source_entry_key
  on public.enquiries (source, form_id, entry_id)
  where entry_id is not null;
create index if not exists enquiries_status_idx  on public.enquiries (status, created_at desc);
create index if not exists enquiries_email_idx   on public.enquiries (lower(email));
create index if not exists enquiries_company_idx on public.enquiries (company_id);

-- Team can read and update (for a future Enquiries page). Inserts come from the
-- service role in the intake route, which bypasses RLS. No anon access at all.
alter table public.enquiries enable row level security;
drop policy if exists "team_all_enquiries" on public.enquiries;
create policy "team_all_enquiries" on public.enquiries
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

create or replace function public.enquiries_emit_received() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.emit_event('enquiry.received', 'enquiry', new.id,
    jsonb_build_object(
      'enquiry_id',       new.id,
      'source',           new.source,
      'first_name',       new.first_name,
      'last_name',        new.last_name,
      'email',            new.email,
      'phone',            new.phone,
      'company_name',     new.company_name,
      'website',          new.website,
      'service_interest', new.service_interest,
      'message',          left(new.message, 4000),
      'company_id',       new.company_id,       -- set when this is an existing client
      'contact_id',       new.contact_id));
  return new;
end $$;

drop trigger if exists enquiries_emit_received on public.enquiries;
create trigger enquiries_emit_received
  after insert on public.enquiries
  for each row execute function public.enquiries_emit_received();

-- Same updated_at helper every other table uses.
drop trigger if exists set_updated_at on public.enquiries;
create trigger set_updated_at
  before update on public.enquiries
  for each row execute function public.handle_updated_at();


-- ── 2. links between the steps ──────────────────────────────────────────────

alter table public.proposals
  add column if not exists enquiry_id  uuid references public.enquiries(id)          on delete set null,
  add column if not exists template_id uuid references public.proposal_templates(id) on delete set null;

-- One automated proposal per enquiry. This is what makes a repeated n8n call
-- return the existing proposal instead of creating a second one.
create unique index if not exists proposals_enquiry_key
  on public.proposals (enquiry_id)
  where enquiry_id is not null;

alter table public.invoices
  add column if not exists proposal_id uuid references public.proposals(id) on delete set null;

create unique index if not exists invoices_proposal_key
  on public.invoices (proposal_id)
  where proposal_id is not null;


-- ── 3. richer payloads on the existing triggers ─────────────────────────────

create or replace function public.proposals_emit_events() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  base jsonb := jsonb_build_object(
    'company_id',  new.company_id,
    'title',       new.title,
    'template_id', new.template_id,
    'enquiry_id',  new.enquiry_id,
    'total_value', new.total_value);
begin
  if new.status is distinct from old.status then
    if new.status = 'accepted' then
      perform public.emit_event('proposal.accepted', 'proposal', new.id,
        base || jsonb_build_object(
          'signed_name',     new.signed_name,
          'responded_at',    new.responded_at,
          'previous_status', old.status));
    elsif new.status in ('declined', 'changes_requested') then
      perform public.emit_event('proposal.declined', 'proposal', new.id,
        base || jsonb_build_object(
          'status',           new.status,
          'decision_comment', new.decision_comment));
    elsif new.status = 'sent' then
      perform public.emit_event('proposal.sent', 'proposal', new.id,
        base || jsonb_build_object('expires_at', new.expires_at));
    end if;
  end if;
  return new;
end $$;

create or replace function public.invoices_emit_events() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status is distinct from old.status and lower(coalesce(new.status,'')) = 'paid' then
    perform public.emit_event('invoice.paid', 'invoice', new.id,
      jsonb_build_object(
        'company_id',      new.company_id,
        'invoice_number',  new.invoice_number,
        'amount',          new.amount,
        'proposal_id',     new.proposal_id,
        'previous_status', old.status));
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
