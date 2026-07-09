-- 0015_proposal_templates.sql
-- Proposals v2 (Phase C): reusable proposal templates + seed the two flagship offerings.
-- A template just stores a proposal's `content` (lines/taxes/terms/currency) so the builder
-- can pre-fill from it. Pricing stays fully editable per proposal. Idempotent.

-- 1. Templates table -----------------------------------------------------------
create table if not exists public.proposal_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  content     jsonb not null default '{}'::jsonb,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.proposal_templates enable row level security;

drop policy if exists "team_all_proposal_templates" on public.proposal_templates;
create policy "team_all_proposal_templates" on public.proposal_templates
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

-- 2. Seed the two flagship templates (only if not already present) --------------
-- Paid Discovery — $800 one-off, GST 10% exclusive.
insert into public.proposal_templates (name, description, content)
select
  'Paid Discovery',
  '3-hour online paid discovery program — produces the client''s detailed monthly marketing plan.',
  jsonb_build_object(
    'lines', jsonb_build_array(
      jsonb_build_object(
        'kind', 'package',
        'description', 'Paid Discovery — 3-hour online strategy session + written monthly plan',
        'quantity', 1,
        'billing_cycle', 'one_off',
        'unit_price', 800
      )
    ),
    'taxes', jsonb_build_array(
      jsonb_build_object('label', 'GST', 'rate', 10, 'inclusive', false)
    ),
    'terms', E'Scope: one 3-hour online discovery session, followed by a written month-by-month marketing plan you can run yourself or engage Marmoset to deliver.\n\nPayment: $800 + GST, payable up front to book the session.',
    'currency', 'AUD'
  )
where not exists (select 1 from public.proposal_templates where name = 'Paid Discovery');

-- Done-For-You Marketing Program — $3,000/month, GST 10% exclusive.
insert into public.proposal_templates (name, description, content)
select
  'Done-For-You Marketing Program',
  'Flagship monthly retainer — Marmoset executes the discovery plan, hits milestones, reports monthly.',
  jsonb_build_object(
    'lines', jsonb_build_array(
      jsonb_build_object(
        'kind', 'package',
        'description', 'Done-For-You Marketing Program — monthly retainer',
        'quantity', 1,
        'billing_cycle', 'monthly',
        'unit_price', 3000
      )
    ),
    'taxes', jsonb_build_array(
      jsonb_build_object('label', 'GST', 'rate', 10, 'inclusive', false)
    ),
    'terms', E'Scope: Marmoset delivers the marketing plan produced in discovery — working the agreed milestones and providing a monthly progress report.\n\nEngagement: $3,000 + GST per month. Month-to-month; either party may end the engagement with 30 days'' notice.',
    'currency', 'AUD'
  )
where not exists (select 1 from public.proposal_templates where name = 'Done-For-You Marketing Program');

-- 3. Seed matching Services-catalogue items (so they can be added as proposal lines) ---
insert into public.services (name, description, pricing_type, fixed_price, sort_order, is_active)
select 'Paid Discovery', '3-hour online paid discovery program — produces the client''s monthly marketing plan.', 'fixed', 800, 1, true
where not exists (select 1 from public.services where name = 'Paid Discovery');

insert into public.services (name, description, pricing_type, monthly_fee, sort_order, is_active)
select 'Done-For-You Marketing Program', 'Flagship monthly retainer — Marmoset executes the plan, hits milestones, reports monthly.', 'subscription', 3000, 2, true
where not exists (select 1 from public.services where name = 'Done-For-You Marketing Program');
