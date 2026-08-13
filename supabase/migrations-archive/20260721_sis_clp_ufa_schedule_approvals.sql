-- iCreate feedback 2026-07-21 (docs/icreate/feedback-2026-07-21-ufa-clp.md):
-- CLP meeting records, UFA learning-day selections, and the parent
-- schedule-approval flow. All three tables are backend-only (RLS enabled with
-- no policies; the service-role client is the only reader/writer), matching
-- the posture of the other SIS tables.

-- 1) CLP meeting record: per-student "CLP finished" flag + staff meeting notes.
CREATE TABLE IF NOT EXISTS sis_clp_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  finished_at timestamptz,
  finished_by uuid REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  notes_updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, student_user_id)
);

COMMENT ON TABLE sis_clp_records IS
  'Per-student CLP meeting state: finished_at set = the CLP was completed for this year; notes are staff-only meeting notes (hidden in presentation mode).';

ALTER TABLE sis_clp_records ENABLE ROW LEVEL SECURITY;

-- 2) Learning-day selection: a UFA private school student''s third instructional
-- day when they have fewer than 3 campus days. `answers` will hold the
-- Elementary At-Home options form once iCreate provides the document.
CREATE TABLE IF NOT EXISTS sis_learning_day_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  choice text NOT NULL CHECK (choice IN ('quest_learning_day', 'elementary_at_home')),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, student_user_id)
);

COMMENT ON TABLE sis_learning_day_selections IS
  'UFA private school learning-day choice (Quest Learning Day or Elementary At-Home Academic Learning Day). Not an enrollable class; counts toward the 3 instructional days but not the 5 in-person blocks.';

ALTER TABLE sis_learning_day_selections ENABLE ROW LEVEL SECURITY;

-- 3) Schedule submissions: a parent submits the finished schedule for the
-- school to approve and bill. Submitting locks self-service changes; staff
-- approve (stays locked) or send back (unlocks). One live row per student.
CREATE TABLE IF NOT EXISTS sis_schedule_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'approved', 'sent_back')),
  submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, student_user_id)
);

COMMENT ON TABLE sis_schedule_submissions IS
  'Parent "Submit for approval" state per student schedule. submitted/approved lock parent self-service changes; sent_back unlocks. Approval is status-only (billing happens outside Optio).';

CREATE INDEX IF NOT EXISTS sis_schedule_submissions_org_idx
  ON sis_schedule_submissions (organization_id, status, submitted_at);

ALTER TABLE sis_schedule_submissions ENABLE ROW LEVEL SECURITY;
