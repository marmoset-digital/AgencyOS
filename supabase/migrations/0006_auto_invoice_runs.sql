-- 0006_auto_invoice_runs.sql
-- Phase 2c-ii+: log of auto-invoicing runs, so activity is visible in-app.
-- Written by the service-role client only; team members can read. Idempotent.

create table if not exists public.auto_invoice_runs (
  id            uuid primary key default gen_random_uuid(),
  ran_at        timestamptz not null default now(),
  trigger       text not null,                       -- 'cron' | 'manual'
  period        text,                                -- YYYY-MM
  created_count int not null default 0,
  details       jsonb not null default '[]'::jsonb,  -- [{company,total,invoiceId,number}]
  errors        jsonb not null default '[]'::jsonb,  -- [{company,error}]
  created_at    timestamptz not null default now()
);

create index if not exists auto_invoice_runs_ran_at_idx
  on public.auto_invoice_runs (ran_at desc);

alter table public.auto_invoice_runs enable row level security;

drop policy if exists "team_read_auto_invoice_runs" on public.auto_invoice_runs;
create policy "team_read_auto_invoice_runs" on public.auto_invoice_runs
  for select to authenticated
  using (public.is_team_member());
-- Inserts happen via the service-role client (bypasses RLS); no write policy needed.
