-- ============================================================================
-- 0002_active_timers.sql
-- Time tracking: persisted start/stop timers.
-- A row in active_timers = a timer currently RUNNING for a user. On stop, the
-- elapsed time is written to public.time_logs and the active_timers row removed.
-- One running timer per user (starting a new one auto-stops the previous).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.active_timers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    description text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT active_timers_one_per_user UNIQUE (user_id)
);

ALTER TABLE public.active_timers ENABLE ROW LEVEL SECURITY;

-- Each team member can see/manage only their own running timer.
DROP POLICY IF EXISTS "Users manage own active timer" ON public.active_timers;
CREATE POLICY "Users manage own active timer" ON public.active_timers
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Table privileges (RLS still gates row access).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_timers TO authenticated;
GRANT ALL ON public.active_timers TO service_role;
