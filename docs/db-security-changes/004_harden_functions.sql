-- ============================================================================
-- 004_harden_functions.sql
-- Purpose: Clear Supabase Security Advisor warnings on database functions.
-- Date:    17 June 2026
--
-- Addresses:
--   * "Function Search Path Mutable" — pin search_path on the 3 flagged funcs.
--   * "Public/Signed-In Can Execute SECURITY DEFINER Function" — revoke the
--     default PUBLIC EXECUTE grant so these aren't callable via the public API.
--
-- Safety:
--   * handle_new_user / handle_updated_at are TRIGGER functions; trigger
--     invocation does NOT require the caller to hold EXECUTE, so revoking it
--     does not affect signup or updated_at maintenance.
--   * get_my_role is not referenced by any live RLS policy (the live policies
--     use inline sub-selects on public.users), so revoking EXECUTE is safe.
--   * is_team_member IS used by the team_read_users policy (TO authenticated),
--     so authenticated must KEEP EXECUTE; we only revoke from public/anon.
-- ============================================================================

BEGIN;

-- 1) Pin search_path on the flagged functions (is_team_member already has it).
ALTER FUNCTION public.get_my_role()        SET search_path = public;
ALTER FUNCTION public.handle_new_user()    SET search_path = public;
ALTER FUNCTION public.handle_updated_at()  SET search_path = public;

-- 2) Remove broad EXECUTE grants.
-- Trigger-only function: no role needs direct EXECUTE.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()   FROM PUBLIC, anon, authenticated;

-- Unused helper: lock it down fully.
REVOKE EXECUTE ON FUNCTION public.get_my_role()       FROM PUBLIC, anon, authenticated;

-- Used by the team_read_users RLS policy -> authenticated must retain EXECUTE.
REVOKE EXECUTE ON FUNCTION public.is_team_member()    FROM PUBLIC, anon;

COMMIT;

-- ============================================================================
-- After running, rerun the Security Advisor. Expected remaining warnings:
--   * "Signed-In Users Can Execute" for is_team_member()  -> EXPECTED &
--     required (the RLS policy calls it as the authenticated role); it only
--     reveals whether the caller themselves is a team member.
--   * "Leaked Password Protection Disabled" (Auth setting, not addressed here).
-- ============================================================================
