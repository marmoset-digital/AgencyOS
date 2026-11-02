-- ============================================================================
-- 0024_event_outbox.sql
-- Give Agency OS an event stream, so it can be automated on.
--
-- The problem this solves: nothing outside this app can learn that something
-- happened inside it. A proposal is accepted, an invoice is paid, a task is
-- completed - the row changes and no other system ever finds out. That, not the
-- feature list, is why the OS cannot run itself.
--
-- The fix is an OUTBOX, not event sourcing. Something meaningful happens, one
-- row lands here, and a dispatcher drains the table and POSTs each row to n8n.
-- The data model is untouched.
--
-- TWO WAYS A ROW GETS WRITTEN, and the difference matters:
--
--   1. DATABASE TRIGGERS (this file) - for state changes derivable from the row
--      itself. These fire INSIDE the same transaction as the update, so the
--      event cannot exist without the change, nor the change without the event.
--      This is the strong guarantee. It also catches changes made from outside
--      the app entirely, including the Supabase dashboard.
--
--   2. lib/events.ts emitEvent() - for events needing application context the
--      row does not carry. supabase-js talks to PostgREST over HTTP, so each
--      call is its own transaction; an emitEvent() call CANNOT share the
--      mutation's transaction. It is best-effort with a small window where the
--      mutation succeeds and the event is lost. Prefer a trigger wherever the
--      event is derivable from the row.
--
-- DELIVERY IS AT-LEAST-ONCE. A webhook can arrive twice, typically when the
-- dispatcher times out on a request n8n actually completed. Every consuming
-- workflow must be idempotent, keyed on events.id, which is stable across
-- retries. Design that in from the first workflow.
--
-- Additive and idempotent: one new table plus triggers. Nothing existing moves.
-- ============================================================================

create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  type            text not null,                    -- e.g. 'proposal.accepted'
  entity_type     text,                             -- 'proposal' | 'company' | 'invoice' ...
  entity_id       uuid,
  payload         jsonb not null default '{}'::jsonb,
  actor_id        uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  -- delivery bookkeeping
  delivered_at    timestamptz,
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text
);

comment on table public.events is
  'Transactional outbox. One row per meaningful thing that happened, drained by /api/cron/dispatch-events and POSTed to n8n. At-least-once delivery, so consumers must be idempotent on events.id.';

-- The dispatcher has exactly one query: oldest undelivered rows that are due.
-- A partial index keeps it cheap forever, because delivered rows fall out of it.
create index if not exists events_pending_idx
  on public.events (next_attempt_at, created_at)
  where delivered_at is null;

-- For showing an entity's history in the UI later.
create index if not exists events_entity_idx
  on public.events (entity_type, entity_id, created_at desc);

create index if not exists events_type_idx
  on public.events (type, created_at desc);

-- RLS: team read-only. Rows are written by triggers and by the service role
-- (which bypasses RLS), so no insert policy is granted to authenticated users.
-- A client-portal token must never be able to read this table.
alter table public.events enable row level security;
drop policy if exists "team_read_events" on public.events;
create policy "team_read_events" on public.events
  for select to authenticated
  using (public.is_team_member());
grant select on public.events to authenticated;


-- ── Trigger plumbing ────────────────────────────────────────────────────────

create or replace function public.emit_event(
  p_type text, p_entity_type text, p_entity_id uuid, p_payload jsonb
) returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.events (type, entity_type, entity_id, payload)
  values (p_type, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb));
$$;

comment on function public.emit_event(text, text, uuid, jsonb) is
  'Append one outbox row. Called from triggers so the event shares the mutation transaction.';


-- Proposal status transitions. This is the spine of the enquiry-to-cash journey:
-- proposal.accepted is what a workflow parks on while it waits for the client.
create or replace function public.proposals_emit_events() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'accepted' then
      perform public.emit_event('proposal.accepted', 'proposal', new.id,
        jsonb_build_object(
          'company_id', new.company_id,
          'title', new.title,
          'signed_name', new.signed_name,
          'responded_at', new.responded_at,
          'previous_status', old.status));
    elsif new.status in ('declined', 'changes_requested') then
      perform public.emit_event('proposal.declined', 'proposal', new.id,
        jsonb_build_object(
          'company_id', new.company_id,
          'title', new.title,
          'status', new.status,
          'decision_comment', new.decision_comment));
    elsif new.status = 'sent' then
      perform public.emit_event('proposal.sent', 'proposal', new.id,
        jsonb_build_object(
          'company_id', new.company_id,
          'title', new.title,
          'expires_at', new.expires_at));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists proposals_emit_events on public.proposals;
create trigger proposals_emit_events
  after update of status on public.proposals
  for each row execute function public.proposals_emit_events();


-- Invoice status transitions. invoices.status is free text in this schema, so
-- match case-insensitively rather than assuming an enum.
create or replace function public.invoices_emit_events() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status is distinct from old.status and lower(coalesce(new.status,'')) = 'paid' then
    perform public.emit_event('invoice.paid', 'invoice', new.id,
      jsonb_build_object(
        'company_id', new.company_id,
        'invoice_number', new.invoice_number,
        'amount', new.amount,
        'previous_status', old.status));
  end if;
  return new;
end $$;

drop trigger if exists invoices_emit_events on public.invoices;
create trigger invoices_emit_events
  after update of status on public.invoices
  for each row execute function public.invoices_emit_events();


-- New clients and new projects. Insert triggers, so they fire however the row
-- was created - the app, a CSV import, or the Supabase dashboard.
create or replace function public.companies_emit_created() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.emit_event('client.created', 'company', new.id,
    jsonb_build_object('name', new.name, 'status', new.status));
  return new;
end $$;

drop trigger if exists companies_emit_created on public.companies;
create trigger companies_emit_created
  after insert on public.companies
  for each row execute function public.companies_emit_created();


create or replace function public.projects_emit_created() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.emit_event('project.created', 'project', new.id,
    jsonb_build_object('name', new.name, 'company_id', new.company_id, 'stage', new.stage));
  return new;
end $$;

drop trigger if exists projects_emit_created on public.projects;
create trigger projects_emit_created
  after insert on public.projects
  for each row execute function public.projects_emit_created();

notify pgrst, 'reload schema';
