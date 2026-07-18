-- 0018_archive.sql — Archive support for clients (companies) and projects.
--
-- WHY ARCHIVE AND NOT DELETE:
-- companies and projects are referenced with ON DELETE CASCADE by a lot of tables.
-- Deleting a company would destroy its invoices, projects, proposals, contacts,
-- tasks, time logs, support tickets, recurring charges, files and social posts.
-- Deleting a project would destroy its tasks, time logs, members and files.
-- Archiving hides the record everywhere without touching any of that history,
-- and it is fully reversible. Xero contacts are never affected.
--
-- Additive and idempotent: safe to run on production while the app is live.

alter table public.companies
  add column if not exists archived_at timestamptz;

alter table public.projects
  add column if not exists archived_at timestamptz;

comment on column public.companies.archived_at is
  'When set, the client is archived: hidden from lists, selectors and auto-invoicing. Never hard-deleted.';

comment on column public.projects.archived_at is
  'When set, the project is archived: hidden from lists, selectors and dashboard counts. Never hard-deleted.';

-- Partial indexes — "not archived" is by far the most common filter.
create index if not exists companies_not_archived_idx
  on public.companies (name) where archived_at is null;

create index if not exists projects_not_archived_idx
  on public.projects (created_at desc) where archived_at is null;
