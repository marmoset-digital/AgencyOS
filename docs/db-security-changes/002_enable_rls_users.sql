-- ============================================================================
-- 002_enable_rls_users.sql
-- Purpose: Close the one real RLS gap in the Agency OS database.
-- Date:    17 June 2026
-- ============================================================================
--
-- VERIFIED LIVE STATE (project vrjwlckjhdyjqcyopcoe, production):
--   * RLS is ENABLED on all 20 public tables EXCEPT `users` (rls_enabled = false).
--   * The earlier briefing's claim that "RLS is disabled on ALL tables" was NOT
--     accurate. Only `public.users` is exposed.
--   * `public.users` currently has 4 policies but, because RLS is OFF, none are
--     enforced -- so anyone holding the anon key can read/write every user row.
--
-- ROOT CAUSE (why RLS on `users` was switched off):
--   The policy "Team members can view all users" is self-referential --
--   its USING clause runs a sub-SELECT on `users` itself:
--       auth.uid() IN (SELECT id FROM users WHERE role = ANY(ARRAY['admin',
--                                              'team_member','intern']))
--   With RLS enabled on `users`, evaluating this policy re-triggers the same
--   policy => Postgres error 42P17 "infinite recursion detected in policy".
--   That recursion is the "auth loop" the previous session worked around by
--   disabling RLS entirely.
--
-- WHY THIS FIX IS SAFE:
--   * That recursive policy is REDUNDANT: `authenticated_read_users`
--     (SELECT, role authenticated, USING true) already grants authenticated
--     users read access to `users`, and `users_update_own` handles updates.
--   * New-user provisioning is unaffected: trigger `on_auth_user_created`
--     calls `handle_new_user()` which is SECURITY DEFINER, so inserts into
--     `public.users` bypass RLS.
--   * Sub-queries on `users` from OTHER tables' policies keep working, because
--     the surviving `users` SELECT policy is a plain `true` (no recursion).
--
-- NET EFFECT AFTER RUNNING:
--   * anonymous (anon) role  -> NO access to `users` (no anon policy exists).
--   * authenticated role     -> read all users; update only own row.
--   * service_role           -> unrestricted (as before).
--
-- This script is idempotent and transactional.
-- ============================================================================

BEGIN;

-- 1) Remove the self-referential SELECT policy that causes infinite recursion.
--    (Redundant with authenticated_read_users.)
DROP POLICY IF EXISTS "Team members can view all users" ON public.users;

-- 2) Enable Row Level Security on the only unprotected table.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ============================================================================
-- POST-RUN VERIFICATION (run separately; should all look correct)
-- ============================================================================
-- a) Confirm RLS is now on and no table is left unprotected:
--    SELECT c.relname, c.relrowsecurity
--    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false;
--    -- expect: 0 rows
--
-- b) Confirm the surviving, non-recursive policies on users:
--    SELECT policyname, cmd, roles::text, qual, with_check
--    FROM pg_policies WHERE schemaname='public' AND tablename='users'
--    ORDER BY policyname;
--    -- expect: authenticated_read_users (SELECT, true),
--    --         "Users can update own profile" (UPDATE, auth.uid()=id),
--    --         users_update_own (UPDATE, id=auth.uid())
--
-- c) Smoke test the app: log in as admin@marmoset.com.au, load the client
--    list, add/edit a client, and confirm no "infinite recursion" errors.
-- ============================================================================
