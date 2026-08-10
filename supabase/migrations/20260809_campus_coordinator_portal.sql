-- Campus coordinator portal — DB changes for the iCreate requirements build
-- (docs/icreate/CAMPUS_COORDINATOR_PORTAL_GAP_ANALYSIS_2026-08-09.md).
--
-- Three concerns, all additive:
--   1. Role-scoped visibility on resources and training (Phase 1a).
--   2. The attendance accountability workflow (Phase 1b) — sis_attendance_alerts
--      grows from a dedupe table into a resolvable record.
--   3. The internal task system (Phase 2) — sis_form_submissions grows priority,
--      due date, two working statuses, and a comments table.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Role-scoped visibility (resources + training)
-- ════════════════════════════════════════════════════════════════════════════
-- NULL = visible to the whole audience (the pre-existing behavior, and the
-- backfill value for every current row). A non-null array narrows a
-- staff-audience record to specific staff roles. Superadmins always see
-- everything; families are governed by `audience`, not this column.
--
-- The CHECK lists the staff org roles explicitly — mirroring the doctrine that
-- adding a role to OrgRole needs a migration. When Registrar/Curriculum/
-- Financial Manager roles arrive, widen these two constraints in the same
-- migration that widens valid_org_roles.

ALTER TABLE public.org_resources
  ADD COLUMN IF NOT EXISTS visible_to_roles text[];
ALTER TABLE public.org_resources
  DROP CONSTRAINT IF EXISTS org_resources_visible_to_roles_check;
ALTER TABLE public.org_resources
  ADD CONSTRAINT org_resources_visible_to_roles_check
  CHECK (visible_to_roles IS NULL
         OR visible_to_roles <@ ARRAY['org_admin', 'campus_coordinator', 'advisor']::text[]);

ALTER TABLE public.sis_staff_training
  ADD COLUMN IF NOT EXISTS visible_to_roles text[];
ALTER TABLE public.sis_staff_training
  DROP CONSTRAINT IF EXISTS sis_staff_training_visible_to_roles_check;
ALTER TABLE public.sis_staff_training
  ADD CONSTRAINT sis_staff_training_visible_to_roles_check
  CHECK (visible_to_roles IS NULL
         OR visible_to_roles <@ ARRAY['org_admin', 'campus_coordinator', 'advisor']::text[]);

COMMENT ON COLUMN public.org_resources.visible_to_roles IS
  'NULL = whole audience. Non-null narrows a staff resource to these org roles '
  '(superadmin always sees all). Values constrained to staff roles by CHECK.';
COMMENT ON COLUMN public.sis_staff_training.visible_to_roles IS
  'NULL = whole audience. Non-null narrows staff training to these org roles '
  '(superadmin always sees all). Values constrained to staff roles by CHECK.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Attendance accountability ("STUDENT NOT ACCOUNTED FOR")
-- ════════════════════════════════════════════════════════════════════════════
-- The table so far held sweep-dedupe rows (checkin_reminder, gap_alert). The
-- new 'unaccounted' type is a workflow record: created when a teacher marks a
-- student absent and no guardian report or excusal covers them, shown on the
-- coordinator dashboard until somebody resolves it with what actually happened.
-- The existing unique (student_user_id, date, alert_type) already gives us
-- one accountability alert per student per day.

ALTER TABLE public.sis_attendance_alerts
  DROP CONSTRAINT IF EXISTS sis_attendance_alerts_alert_type_check;
ALTER TABLE public.sis_attendance_alerts
  ADD CONSTRAINT sis_attendance_alerts_alert_type_check
  CHECK (alert_type IN ('checkin_reminder', 'gap_alert', 'unaccounted'));

ALTER TABLE public.sis_attendance_alerts
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.org_classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.sis_attendance_alerts
  DROP CONSTRAINT IF EXISTS sis_attendance_alerts_status_check;
ALTER TABLE public.sis_attendance_alerts
  ADD CONSTRAINT sis_attendance_alerts_status_check
  CHECK (status IN ('open', 'resolved'));

-- What the coordinator decided happened. iCreate's list, verbatim in intent:
-- elsewhere on campus / late / absent without notice / incorrectly marked.
ALTER TABLE public.sis_attendance_alerts
  DROP CONSTRAINT IF EXISTS sis_attendance_alerts_resolution_check;
ALTER TABLE public.sis_attendance_alerts
  ADD CONSTRAINT sis_attendance_alerts_resolution_check
  CHECK (resolution IS NULL
         OR resolution IN ('elsewhere_on_campus', 'late', 'absent_no_notice',
                           'mismarked', 'other'));

-- Pre-existing rows are sweep-dedupe records, not open work. Close them so the
-- new board starts empty rather than showing months of historical gap alerts.
UPDATE public.sis_attendance_alerts SET status = 'resolved' WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_sis_attendance_alerts_open
  ON public.sis_attendance_alerts (organization_id, status)
  WHERE status = 'open';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Internal task system (on sis_form_submissions)
-- ════════════════════════════════════════════════════════════════════════════
-- iCreate's Phase 2 asks for exactly what this table almost is: a request with
-- a category, an assignee, a status, and notes. Added here: priority, due date,
-- two working statuses between review and resolution, and threaded comments.
-- Status vocabulary maps to iCreate's asks: submitted=New, under_review +
-- assigned_to=Assigned, in_progress=In Progress, waiting=Waiting,
-- resolved=Completed.

ALTER TABLE public.sis_form_submissions
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS due_date date;

ALTER TABLE public.sis_form_submissions
  DROP CONSTRAINT IF EXISTS sis_form_submissions_priority_check;
ALTER TABLE public.sis_form_submissions
  ADD CONSTRAINT sis_form_submissions_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

-- Widen-only: both original statuses stay valid, so no existing row can fail.
ALTER TABLE public.sis_form_submissions
  DROP CONSTRAINT IF EXISTS sis_form_submissions_status_check;
ALTER TABLE public.sis_form_submissions
  ADD CONSTRAINT sis_form_submissions_status_check
  CHECK (status IN ('submitted', 'under_review', 'in_progress', 'waiting', 'resolved'));

CREATE INDEX IF NOT EXISTS sis_form_submissions_assignee_idx
  ON public.sis_form_submissions (assigned_to, status);

CREATE TABLE IF NOT EXISTS public.sis_form_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.sis_form_submissions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sis_form_comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS sis_form_comments_submission_idx
  ON public.sis_form_comments (submission_id, created_at);

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.org_resources'::regclass,
                   'public.sis_staff_training'::regclass,
                   'public.sis_attendance_alerts'::regclass,
                   'public.sis_form_submissions'::regclass)
  AND contype = 'c'
ORDER BY conrelid::regclass::text, conname;
