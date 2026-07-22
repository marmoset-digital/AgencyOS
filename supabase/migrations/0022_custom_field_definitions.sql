-- 0022_custom_field_definitions.sql — global custom fields.
--
-- Today custom_fields is ad-hoc: a label+value added to ONE company or project.
-- This adds *defined* fields — a field set configured once that appears on every
-- client (or every project), ready to fill in.
--
-- Design (settled 19 Jul):
--   - Entities: company + project (not tasks).
--   - Types: text, number, date, select (dropdown with fixed options).
--   - Uniform: every record of a type shows every definition for that type.
--   - Ad-hoc fields stay: a value row with definition_id = NULL is a one-off, exactly
--     as before. A row with definition_id set is the answer to a global field.
--   - Required bites on next edit only (enforced in the action, not retroactively).
--
-- Values reuse the existing custom_fields table (one place for all answers). Every
-- type is stored as text: numbers as their digits, dates as YYYY-MM-DD, select as
-- the chosen option. The definition says how to render it.
--
-- Additive + idempotent: safe on a live database. Existing rows get definition_id
-- NULL, so they keep behaving as ad-hoc fields.

create table if not exists public.custom_field_definitions (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('company','project')),
  label       text not null,
  field_type  text not null default 'text' check (field_type in ('text','number','date','select')),
  options     jsonb not null default '[]'::jsonb,   -- for 'select': array of option strings
  required    boolean not null default false,
  sort_order  integer not null default 0,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.custom_field_definitions is
  'Global custom field definitions. Every record of entity_type shows every definition.';

create index if not exists custom_field_definitions_entity_idx
  on public.custom_field_definitions (entity_type, sort_order, created_at);

alter table public.custom_field_definitions enable row level security;
drop policy if exists "team_all_custom_field_definitions" on public.custom_field_definitions;
create policy "team_all_custom_field_definitions" on public.custom_field_definitions
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());
grant select, insert, update, delete on public.custom_field_definitions to authenticated;

-- Link a value row to a definition. NULL = ad-hoc one-off (unchanged behaviour).
-- Deleting a definition removes its stored answers across all records.
alter table public.custom_fields
  add column if not exists definition_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'custom_fields_definition_id_fkey') then
    alter table public.custom_fields
      add constraint custom_fields_definition_id_fkey
      foreign key (definition_id) references public.custom_field_definitions(id) on delete cascade;
  end if;
end $$;

comment on column public.custom_fields.definition_id is
  'Global field this value answers. NULL = ad-hoc one-off field on a single record.';

-- One answer per (definition, record). Used by the value-save lookup.
create index if not exists custom_fields_definition_entity_idx
  on public.custom_fields (definition_id, entity_id) where definition_id is not null;
