-- 0011_approval_context.sql
-- Make approvals contextual: tie them to a specific task and/or client contact, on top of
-- the existing project_id / company_id. Both nullable so an approval can be task-level
-- (with task_id) or project-level (task_id null). Idempotent.

alter table public.approvals
  add column if not exists task_id    uuid references public.tasks(id)    on delete set null,
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists approvals_task_idx on public.approvals (task_id);

-- Per-task flag: does this task need client sign-off? Most day-to-day ops tasks don't;
-- some (e.g. a design draft) do. Off by default.
alter table public.tasks
  add column if not exists requires_approval boolean not null default false;
