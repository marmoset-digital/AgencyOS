-- 0017_support_portal.sql
-- Support Tickets v2: public tokenised client support portal.
-- support_tickets already has assignee_id (→users), project_id (→projects), contact_id (→contacts);
-- ticket_replies already has author_type ('team'|'client'), author_user_id (→users),
-- author_contact_id (→contacts), content. So the ONLY schema change is a per-company support
-- token that powers the no-login /support/[token] portal (served via the service-role client,
-- exactly like /proposal/[token]). Idempotent.

alter table public.companies
  add column if not exists support_token text;

-- Backfill a token for every existing company.
update public.companies
  set support_token = replace(gen_random_uuid()::text, '-', '')
  where support_token is null;

-- Unique + auto-generate for new companies.
create unique index if not exists companies_support_token_key on public.companies(support_token);

alter table public.companies
  alter column support_token set default replace(gen_random_uuid()::text, '-', '');
