# DB security changes (human-readable record)

These three migrations were applied to the **live** Supabase database during the
17–20 June 2026 security session:

- `002_enable_rls_users.sql` — enable RLS on `users`; drop the recursive
  self-referential policy that had forced RLS off.
- `003_tighten_rls_followups.sql` — remove the public `USING(true)` read on
  `social_approvals`; scope `users` reads to team members via `is_team_member()`.
- `004_harden_functions.sql` — pin `search_path` on functions; revoke broad
  EXECUTE grants on SECURITY DEFINER functions.

**They are already reflected in the live database**, and therefore already
included in the regenerated baseline (see `../../BASELINE_RUNBOOK.md`). Keep them
here as documentation of *why* the schema looks the way it does. **Do not** add
them back into `supabase/migrations/` — that would double-define the objects.
