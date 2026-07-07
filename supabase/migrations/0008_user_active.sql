-- 0008_user_active.sql
-- Team/Users management: add an is_active flag so people can be deactivated
-- (kept, but blocked from login + hidden from pickers) without deleting their
-- row, which would break FKs from tasks, time_logs, comments, etc. Idempotent.

alter table public.users
  add column if not exists is_active boolean not null default true;
