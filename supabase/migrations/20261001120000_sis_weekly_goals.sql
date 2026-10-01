-- One student's goals for one school week, and how the week went.
--
-- Apogee Cache Valley, 2026-09-30: "Coaches use this to write down each
-- students goals on Monday, and then check in with them on Thursday to write
-- down what was accomplished." Their Master Planner sheet holds, per student
-- per week, a goal for each learning area (Reading, Writing, Math, Language
-- Arts, Fitness, Other, Passion Project), what was completed, complaints,
-- valid complaints and notes. A student who completes the week's goals with
-- no valid complaint earns "freedom"; that is computed from this row
-- (services/sis_weekly_goal_service.freedom_for), never stored, so it cannot
-- disagree with the goals it is made of.
--
-- goals is [{subject, goal, completed}], subjects from the org's
-- sis_settings.goal_subjects (the same list the annual goals in
-- sis_student_goals use). completed is null until the Thursday check-in.
-- week_start is the Monday of the week.
--
-- RLS on, no policies: read and written through the service role by
-- backend/repositories/sis_weekly_goal_repository.py, behind the role and
-- relationship checks in routes/sis/weekly_goals.py. No per-table GRANT (Data
-- API grants are inherited).

CREATE TABLE IF NOT EXISTS public.sis_weekly_goals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    student_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    week_start date NOT NULL,
    goals jsonb NOT NULL DEFAULT '[]'::jsonb,
    complaints integer NOT NULL DEFAULT 0,
    valid_complaints integer NOT NULL DEFAULT 0,
    notes text,
    goals_set_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    goals_set_at timestamptz,
    checked_in_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    checked_in_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sis_weekly_goals_monday CHECK (extract(isodow FROM week_start) = 1),
    CONSTRAINT sis_weekly_goals_complaints CHECK (complaints >= 0 AND valid_complaints >= 0
                                                  AND valid_complaints <= complaints),
    CONSTRAINT sis_weekly_goals_unique UNIQUE (organization_id, student_user_id, week_start)
);

CREATE INDEX IF NOT EXISTS sis_weekly_goals_org_week_idx
    ON public.sis_weekly_goals (organization_id, week_start);
CREATE INDEX IF NOT EXISTS sis_weekly_goals_student_week_idx
    ON public.sis_weekly_goals (student_user_id, week_start DESC);

ALTER TABLE public.sis_weekly_goals ENABLE ROW LEVEL SECURITY;

-- A school job a student may do again once their last claim is reviewed:
-- daily chores (Apogee Cache Valley's ClassDojo replacement, 2026-10-01). A
-- one-time bounty keeps one claim per student.
ALTER TABLE public.bounties ADD COLUMN IF NOT EXISTS repeatable boolean NOT NULL DEFAULT false;
