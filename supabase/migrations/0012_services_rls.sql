-- 0012_services_rls.sql
-- Services catalogue (foundation for proposal line items). The `services` table already
-- exists in the live schema; this just guarantees it's team-manageable from the app.
-- Idempotent.

alter table public.services enable row level security;

drop policy if exists "team_all_services" on public.services;
create policy "team_all_services" on public.services
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());
