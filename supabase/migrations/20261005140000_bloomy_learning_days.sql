-- Bloomy (bloomylearning.com) work coming into Optio as quest tasks.
--
-- Apogee Cache Valley, 2026-09-29: "several students use this resource for
-- language arts and math. The website shows what they've learned, the time
-- they've spent". Mandie sent the school's Bloomy Data API key on 2026-10-02.
-- The API is read-only and scoped to one school: a daily feed of the skills
-- each student worked on and mastered (today plus the seven days before), and
-- a roster with lifetime learning hours.
--
-- A Bloomy student is linked to an Optio student by a coach, in
-- lms_integrations (lms_platform 'bloomy', lms_user_id the Bloomy student_id).
-- Bloomy sends no roster id Optio knows, so a name is the only automatic
-- match, and a wrong automatic match would put one child's work on another
-- child's record. The coach confirms each link.
--
-- external_learning_days holds one row per (student, platform, subject, Pacific
-- day) that the sync has read. It is the sync's memory -- the unique key is
-- what makes a re-run write nothing new -- and the source of the "Bloomy this
-- week" line on the weekly check-in. user_quest_task_id is the task the day
-- became, null when the student worked but mastered nothing.
--
-- learning_hours_total is the student's lifetime Bloomy hours as the roster
-- read them when the row was written. It is a snapshot, not a daily amount:
-- Bloomy reports no per-day time. The check-in derives a week's hours from the
-- difference between two snapshots.
--
-- RLS on, no policies: read and written through the service role by
-- backend/repositories/external_learning_repository.py, behind the role checks
-- in routes/sis/bloomy.py and the cron secret. No per-table GRANT (Data API
-- grants are inherited).

ALTER TABLE public.lms_integrations DROP CONSTRAINT IF EXISTS lms_integrations_valid_platform;
ALTER TABLE public.lms_integrations ADD CONSTRAINT lms_integrations_valid_platform
    CHECK (lms_platform::text = ANY (ARRAY['canvas', 'google_classroom', 'schoology',
                                           'moodle', 'spark', 'bloomy']::text[]));

CREATE TABLE IF NOT EXISTS public.external_learning_days (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    platform text NOT NULL,
    subject text NOT NULL,
    activity_date date NOT NULL,
    skills_worked integer NOT NULL DEFAULT 0,
    skills_mastered integer NOT NULL DEFAULT 0,
    skills jsonb NOT NULL DEFAULT '[]'::jsonb,
    learning_hours_total numeric,
    user_quest_task_id uuid REFERENCES public.user_quest_tasks(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT external_learning_days_platform CHECK (platform IN ('bloomy')),
    CONSTRAINT external_learning_days_counts CHECK (skills_worked >= 0 AND skills_mastered >= 0),
    CONSTRAINT external_learning_days_unique UNIQUE (user_id, platform, subject, activity_date)
);

CREATE INDEX IF NOT EXISTS external_learning_days_org_date_idx
    ON public.external_learning_days (organization_id, activity_date);

ALTER TABLE public.external_learning_days ENABLE ROW LEVEL SECURITY;
