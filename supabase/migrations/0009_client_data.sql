-- 0009_client_data.sql
-- Client-data layer: contextual links (Google Docs/Sheets, dashboards, drives) and
-- ad-hoc custom fields, attached to a company or a project via a generic
-- (entity_type, entity_id) key. Google files stay in Google — we store the LINK only,
-- so access stays controlled by Google (logins/properties never live in this DB).
-- Idempotent.

create table if not exists public.resource_links (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('company','project')),
  entity_id   uuid not null,
  label       text not null,
  url         text not null,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists resource_links_entity_idx on public.resource_links (entity_type, entity_id);

alter table public.resource_links enable row level security;
drop policy if exists "team_all_resource_links" on public.resource_links;
create policy "team_all_resource_links" on public.resource_links
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

create table if not exists public.custom_fields (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('company','project')),
  entity_id   uuid not null,
  label       text not null,
  value       text,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists custom_fields_entity_idx on public.custom_fields (entity_type, entity_id);

alter table public.custom_fields enable row level security;
drop policy if exists "team_all_custom_fields" on public.custom_fields;
create policy "team_all_custom_fields" on public.custom_fields
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());
