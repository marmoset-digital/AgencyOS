-- 0007_project_members.sql
-- Phase 1: project team members (multiple users per project), on top of the existing
-- single `projects.assigned_to` owner/manager. Idempotent.

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.users(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx on public.project_members (user_id);

alter table public.project_members enable row level security;

-- Internal tool: any team member can read/manage project membership.
drop policy if exists "team_all_project_members" on public.project_members;
create policy "team_all_project_members" on public.project_members
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());
