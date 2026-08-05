-- ============================================================================
-- 0023_standalone_task_time.sql
-- Allow time tracking on standalone (internal) tasks that have no project.
--
-- Tasks can already be created with project_id = NULL (internal tasks). But a
-- timer / time log could not be recorded against them because both
-- active_timers.project_id and time_logs.project_id were NOT NULL. Making them
-- nullable lets a running timer and its logged time attach to just the task.
--
-- RLS is unaffected: active_timers is gated by user_id = auth.uid(), and
-- time_logs by team-membership (role in admin/team_member/intern) — neither
-- policy joins to projects, so project-less rows are handled the same way.
--
-- Idempotent: DROP NOT NULL on an already-nullable column is a no-op.
-- ============================================================================

alter table public.active_timers alter column project_id drop not null;
alter table public.time_logs     alter column project_id drop not null;

-- Refresh PostgREST's cached schema so the API picks up the change immediately.
notify pgrst, 'reload schema';
