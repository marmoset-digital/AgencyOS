-- 0005_auto_invoicing.sql
-- Phase 2c-ii: scheduled auto-invoicing.
-- Idempotent.

-- Per-client opt-in: only companies with auto_invoice = true are auto-invoiced.
alter table public.companies
  add column if not exists auto_invoice boolean not null default false;

-- Duplicate guard: the YYYY-MM period a recurring charge was last invoiced for
-- (set by both the manual "Create draft" and the auto job). The auto job skips a
-- charge whose last_invoiced_period already equals the current period.
alter table public.recurring_charges
  add column if not exists last_invoiced_period text;
