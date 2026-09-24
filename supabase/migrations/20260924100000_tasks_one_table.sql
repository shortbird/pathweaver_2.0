-- Everything is a task, in one table (iCreate meeting 2026-09-23).
--
-- Requests, forms and checklists stop existing as separate concepts. The task
-- table stays sis_onboarding_assignments because the signature hold
-- (backend/utils/signature_hold.py, middleware/api_hold_gate.py) is keyed on
-- it; the rename happens in the UI, not in the schema.
--
-- ADDITIVE ONLY. Production runs the old code until the release, so:
--   * every new column is nullable (or has a default the old code never sees),
--   * CHECK constraints are only widened,
--   * kind='checklist' rows are NOT rewritten to 'task'. New code treats the
--     two as the same thing (sis_onboarding_service.TASK_KINDS); old code keeps
--     filtering on 'checklist' and still finds every row it wrote.
--
-- The data conversion that old code could not survive -- copying
-- sis_form_submissions / sis_form_comments / custom sis_form_templates into
-- tasks -- is 20260924105000_release_forms_into_tasks.sql, run at release.
--
-- Apply BEFORE the new code deploys: it writes kind='task', audience='student'
-- and status='expired', each of which the old constraints refuse.

-- ── Recurring schedules ─────────────────────────────────────────────────────
-- Created first: sis_onboarding_assignments.schedule_id references it.
--
-- One row per "assign this every M/W/F" decision. The cron
-- (/api/sis/internal/task-occurrences) creates that day's assignment rows in
-- the org's timezone; each occurrence is due that day and expires at the end
-- of it. days_of_week uses Python's weekday(): 0 = Monday .. 6 = Sunday.
CREATE TABLE IF NOT EXISTS public.sis_task_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    -- The steps each occurrence gets, snapshotted the way an assignment
    -- snapshots a template's items.
    items jsonb NOT NULL DEFAULT '[]'::jsonb,
    template_id uuid REFERENCES public.sis_onboarding_templates(id) ON DELETE SET NULL,
    -- [{"id": user_id, "audience": "staff"|"family"|"student"}]
    recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
    days_of_week smallint[] NOT NULL DEFAULT '{0,1,2,3,4}',
    start_date date NOT NULL,
    end_date date,
    priority text CHECK (priority IS NULL OR priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])),
    active boolean NOT NULL DEFAULT true,
    -- The last org-local day the cron created occurrences for. Lets a run
    -- that already did today return after one read.
    last_run_on date,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sis_task_schedules_days_nonempty CHECK (cardinality(days_of_week) > 0),
    CONSTRAINT sis_task_schedules_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS sis_task_schedules_org_active_idx
    ON public.sis_task_schedules (organization_id, active);

-- Service-role only, like every other SIS task table: the console reaches it
-- through the backend, which enforces the role + org gate.
ALTER TABLE public.sis_task_schedules ENABLE ROW LEVEL SECURITY;

-- ── The task table ──────────────────────────────────────────────────────────

ALTER TABLE public.sis_onboarding_assignments
    ADD COLUMN IF NOT EXISTS priority text,
    ADD COLUMN IF NOT EXISTS due_date date,
    ADD COLUMN IF NOT EXISTS source_conversation_id uuid,
    ADD COLUMN IF NOT EXISTS source_group_id uuid,
    ADD COLUMN IF NOT EXISTS source_message_id uuid,
    ADD COLUMN IF NOT EXISTS action text DEFAULT 'do',
    ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.sis_task_schedules(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS occurrence_date date,
    ADD COLUMN IF NOT EXISTS expires_at timestamptz,
    -- The sis_form_submissions row a task was copied from by the release
    -- migration. Its unique index is what makes that copy safe to re-run.
    ADD COLUMN IF NOT EXISTS legacy_submission_id uuid;

ALTER TABLE public.sis_onboarding_assignments
    DROP CONSTRAINT IF EXISTS sis_onboarding_assignments_priority_check;
ALTER TABLE public.sis_onboarding_assignments
    ADD CONSTRAINT sis_onboarding_assignments_priority_check
    CHECK (priority IS NULL OR priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]));

-- 'reply' is a task made from a message: the work is answering that thread.
ALTER TABLE public.sis_onboarding_assignments
    DROP CONSTRAINT IF EXISTS sis_onboarding_assignments_action_check;
ALTER TABLE public.sis_onboarding_assignments
    ADD CONSTRAINT sis_onboarding_assignments_action_check
    CHECK (action IS NULL OR action = ANY (ARRAY['do'::text, 'reply'::text]));

ALTER TABLE public.sis_onboarding_assignments
    DROP CONSTRAINT IF EXISTS valid_onboarding_kind;
ALTER TABLE public.sis_onboarding_assignments
    ADD CONSTRAINT valid_onboarding_kind
    CHECK (kind = ANY (ARRAY['checklist'::text, 'signature_request'::text, 'task'::text]));

ALTER TABLE public.sis_onboarding_assignments
    DROP CONSTRAINT IF EXISTS sis_onboarding_assignments_audience_check;
ALTER TABLE public.sis_onboarding_assignments
    ADD CONSTRAINT sis_onboarding_assignments_audience_check
    CHECK (audience = ANY (ARRAY['staff'::text, 'family'::text, 'student'::text]));

-- 'expired': a recurring occurrence nobody finished on its day.
ALTER TABLE public.sis_onboarding_assignments
    DROP CONSTRAINT IF EXISTS sis_onboarding_assignments_status_check;
ALTER TABLE public.sis_onboarding_assignments
    ADD CONSTRAINT sis_onboarding_assignments_status_check
    CHECK (status = ANY (ARRAY['in_progress'::text, 'complete'::text, 'expired'::text]));

-- One occurrence per person per day per schedule: the cron may run many times
-- a day, and a second run must find the row the first one made.
CREATE UNIQUE INDEX IF NOT EXISTS sis_onboarding_assignments_occurrence_uniq
    ON public.sis_onboarding_assignments (schedule_id, user_id, occurrence_date)
    WHERE schedule_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sis_onboarding_assignments_legacy_submission_uniq
    ON public.sis_onboarding_assignments (legacy_submission_id)
    WHERE legacy_submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sis_onboarding_assignments_batch_idx
    ON public.sis_onboarding_assignments (batch_id) WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sis_onboarding_assignments_org_status_due_idx
    ON public.sis_onboarding_assignments (organization_id, status, due_date);

CREATE INDEX IF NOT EXISTS sis_onboarding_assignments_expiry_idx
    ON public.sis_onboarding_assignments (expires_at)
    WHERE expires_at IS NOT NULL AND status = 'in_progress';

-- ── Templates ───────────────────────────────────────────────────────────────
-- A custom sis_form_templates row becomes a task template at release, one
-- question per step; this is the key that keeps that copy idempotent.
ALTER TABLE public.sis_onboarding_templates
    ADD COLUMN IF NOT EXISTS legacy_form_template_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS sis_onboarding_templates_legacy_form_uniq
    ON public.sis_onboarding_templates (legacy_form_template_id)
    WHERE legacy_form_template_id IS NOT NULL;

-- ── Comments ────────────────────────────────────────────────────────────────
-- The thread under one task. Readable by the assignee, the assigner and the
-- school's admins (enforced by the backend: sis_tasks_service.may_see_task).
-- A request's comment thread moves here at release; so the assignee of a
-- former request can finally read what the office wrote on it.
CREATE TABLE IF NOT EXISTS public.sis_task_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES public.sis_onboarding_assignments(id) ON DELETE CASCADE,
    author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    body text NOT NULL CHECK (length(btrim(body)) > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    legacy_comment_id uuid
);

CREATE INDEX IF NOT EXISTS sis_task_comments_task_idx
    ON public.sis_task_comments (task_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS sis_task_comments_legacy_uniq
    ON public.sis_task_comments (legacy_comment_id)
    WHERE legacy_comment_id IS NOT NULL;

ALTER TABLE public.sis_task_comments ENABLE ROW LEVEL SECURITY;
