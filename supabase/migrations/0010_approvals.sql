-- 0010_approvals.sql
-- Approval-link engine: a generic, tokenised approval request that an external client can
-- open WITHOUT logging in (via /approve/<token>) to Approve or Request changes, signing with
-- their typed name. Shared enabler for proposal sign-off, deliverable approval, social, etc.
-- Idempotent.

create table if not exists public.approvals (
  id               uuid primary key default gen_random_uuid(),
  token            text not null unique,
  title            text not null,
  message          text,
  link_url         text,
  project_id       uuid references public.projects(id)  on delete set null,
  company_id       uuid references public.companies(id) on delete set null,
  status           text not null default 'pending'
                     check (status in ('pending','approved','changes_requested','revoked')),
  signed_name      text,
  decision_comment text,
  decided_at       timestamptz,
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now()
);
create index if not exists approvals_token_idx  on public.approvals (token);
create index if not exists approvals_status_idx on public.approvals (status);

alter table public.approvals enable row level security;

-- Team members manage approvals from inside the app.
drop policy if exists "team_all_approvals" on public.approvals;
create policy "team_all_approvals" on public.approvals
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

-- NOTE: deliberately NO anon policy. The public /approve/<token> page + its decision action
-- run server-side with the service-role key and match strictly on the secret token, so
-- anonymous visitors never get direct table access.
