-- ============================================================================
-- 0003_billing_foundation.sql  (Phase 2a — billing foundation, no Xero)
-- Adds internal cost rates, per-client billable rates + global defaults, and a
-- recurring_charges table for monthly retainers + yearly fixed fees.
-- ============================================================================

BEGIN;

-- Notional internal cost rate per team member ($/hr) — for cost/profitability.
-- NOT what clients are billed.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cost_rate numeric(10,2);

-- Client-facing billable hourly rate per company. NULL → global default.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS billable_rate numeric(10,2);

-- Key/value app settings (global default billable + cost rates live here).
CREATE TABLE IF NOT EXISTS public.app_settings (
    key text PRIMARY KEY,
    value text,
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Team members manage settings" ON public.app_settings;
CREATE POLICY "Team members manage settings" ON public.app_settings
    FOR ALL TO authenticated
    USING (public.is_team_member())
    WITH CHECK (public.is_team_member());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

-- Recurring fixed charges: monthly retainers + yearly fees (hosting/domains).
CREATE TABLE IF NOT EXISTS public.recurring_charges (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    description text NOT NULL,
    amount numeric(10,2) NOT NULL,
    cadence text NOT NULL,
    start_date date NOT NULL DEFAULT CURRENT_DATE,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT recurring_charges_cadence_check CHECK (cadence = ANY (ARRAY['monthly'::text, 'yearly'::text]))
);
ALTER TABLE public.recurring_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Team members manage recurring charges" ON public.recurring_charges;
CREATE POLICY "Team members manage recurring charges" ON public.recurring_charges
    FOR ALL TO authenticated
    USING (public.is_team_member())
    WITH CHECK (public.is_team_member());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_charges TO authenticated;
GRANT ALL ON public.recurring_charges TO service_role;

-- Seed the global default rate keys at 0 — set real values in Settings.
INSERT INTO public.app_settings (key, value) VALUES
    ('default_billable_rate', '0'),
    ('default_cost_rate', '0')
ON CONFLICT (key) DO NOTHING;

COMMIT;
