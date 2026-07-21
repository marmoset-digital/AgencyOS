-- 0021_project_templates.sql — reusable project templates.
--
-- Follows the proposal_templates precedent (schema 0015): the body lives in a
-- jsonb `content` column rather than a normalised child table. Templates are
-- small, always read whole, and never queried by their inner fields, so a blob
-- is the right shape and avoids a second table + join.
--
-- content = {
--   "type": "retainer" | "project" | null,
--   "tasks": [
--     { "title": "...", "description": "...|null", "priority": "medium",
--       "time_estimate": 60|null, "due_offset_days": 3|null }
--   ]
-- }
--
-- due_offset_days is days from the new project's start date, so a template
-- lays out a schedule rather than fixed dates that go stale.
--
-- Additive and idempotent: safe on a live database.

create table if not exists public.project_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  content     jsonb not null default '{}'::jsonb,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.project_templates.content is
  'Template body: { type, tasks: [{ title, description, priority, time_estimate, due_offset_days }] }';

alter table public.project_templates enable row level security;

drop policy if exists "team_all_project_templates" on public.project_templates;
create policy "team_all_project_templates" on public.project_templates
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

grant select, insert, update, delete on public.project_templates to authenticated;

create index if not exists project_templates_name_idx
  on public.project_templates (name);
