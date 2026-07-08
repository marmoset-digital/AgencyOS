-- 0013_proposal_public.sql
-- Public proposal sign-off: give proposals a shareable token, capture the client's decision
-- (signer name + comment), and link the project created on acceptance. Also allow a
-- 'changes_requested' status. Idempotent.

alter table public.proposals
  add column if not exists token            text,
  add column if not exists signed_name      text,
  add column if not exists decision_comment text,
  add column if not exists project_id       uuid references public.projects(id) on delete set null;

-- Backfill a token for any existing proposals, then enforce uniqueness.
update public.proposals set token = replace(gen_random_uuid()::text, '-', '') where token is null;

create unique index if not exists proposals_token_key on public.proposals (token);

-- Allow 'changes_requested' alongside the existing statuses.
alter table public.proposals drop constraint if exists proposals_status_check;
alter table public.proposals add constraint proposals_status_check
  check (status in ('draft', 'sent', 'accepted', 'declined', 'changes_requested', 'expired'));
