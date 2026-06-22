-- ============================================================================
-- 003_tighten_rls_followups.sql
-- Purpose: Close the two remaining RLS exposures found on 17 June 2026.
-- Verified safe against the deployed app (marmoset-digital/AgencyOS, main):
--   only Clients/Dashboard/Projects modules are built; there is no social-
--   approvals feature and no client-portal route, so neither change below
--   affects deployed functionality.
-- ============================================================================

BEGIN;

-- ── Fix 1: social_approvals — remove blanket public read ─────────────────────
-- The "Social approvals readable by token" policy granted SELECT to the public
-- (incl. anonymous) role with USING (true) — anyone could read/enumerate ALL
-- approval rows, including their tokens. No deployed code reads this table yet.
-- When the public approval page is built, expose a SECURITY DEFINER function
-- that returns a SINGLE row by token (and checks expires_at) instead of
-- granting blanket table read.
DROP POLICY IF EXISTS "Social approvals readable by token" ON public.social_approvals;

-- ── Fix 2: users — restrict reads to internal team members ───────────────────
-- authenticated_read_users used USING (true): ANY authenticated session
-- (e.g. a future client-portal user) could read every internal user row
-- (full_name, email, role). Replace it with a team-membership check.
-- SECURITY DEFINER bypasses RLS, so this does NOT cause policy recursion.
CREATE OR REPLACE FUNCTION public.is_team_member()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()) $$;

DROP POLICY IF EXISTS "authenticated_read_users" ON public.users;

CREATE POLICY "team_read_users" ON public.users
  FOR SELECT TO authenticated
  USING (public.is_team_member());

COMMIT;

-- ============================================================================
-- Why this is safe for the existing app:
--   * Team members have a row in public.users -> is_team_member() = true ->
--     they can still read the full team list (assignee dropdowns, login, etc.).
--   * Other tables' policies that sub-SELECT public.users keep working for team
--     members and correctly deny non-team sessions.
--   * service_role (server-side admin) bypasses RLS as before.
--
-- POST-RUN VERIFICATION:
--   SELECT policyname, cmd, roles::text, qual FROM pg_policies
--   WHERE schemaname='public' AND tablename IN ('users','social_approvals')
--   ORDER BY tablename, policyname;
-- ============================================================================
