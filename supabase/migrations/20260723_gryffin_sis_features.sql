-- Gryffin SIS feature set (2026-07-23). All additive, org-generic, RLS-locked to
-- the backend (no policies: the Flask backend's service role is the only reader).
-- Data API grants are inherited via the 20260527 default-privileges migration.

-- 1. Goal/direction setting (post-registration flow for orgs with
--    feature_flags.sis_settings.post_registration_flow = 'goals')
CREATE TABLE IF NOT EXISTS sis_student_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_year text NOT NULL,
  direction text,
  direction_notes text,
  subjects jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{subject, year_goal, long_term}]
  status text NOT NULL DEFAULT 'draft',        -- draft | submitted | reviewed
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, student_user_id, school_year)
);
CREATE INDEX IF NOT EXISTS idx_sis_student_goals_org_status
  ON sis_student_goals(organization_id, status);
ALTER TABLE sis_student_goals ENABLE ROW LEVEL SECURITY;

-- 2. Gradebook-lite: reusable assignment sequences + per-student tracked rows.
--    Scores live HERE, never on the XP model.
CREATE TABLE IF NOT EXISTS sis_assignment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  class_id uuid REFERENCES org_classes(id) ON DELETE CASCADE,
  name text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{name, sort_order}]
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sis_assignment_templates_org
  ON sis_assignment_templates(organization_id);
ALTER TABLE sis_assignment_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sis_student_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  class_id uuid REFERENCES org_classes(id) ON DELETE SET NULL,
  student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  date_scheduled date,
  date_completed date,
  score numeric,
  max_score numeric,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sis_student_assignments_org_student
  ON sis_student_assignments(organization_id, student_user_id);
CREATE INDEX IF NOT EXISTS idx_sis_student_assignments_class
  ON sis_student_assignments(class_id);
ALTER TABLE sis_student_assignments ENABLE ROW LEVEL SECURITY;

-- 3. Curriculum materials per student (paid / received checklist)
CREATE TABLE IF NOT EXISTS sis_student_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  received boolean NOT NULL DEFAULT false,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sis_student_materials_org_student
  ON sis_student_materials(organization_id, student_user_id);
ALTER TABLE sis_student_materials ENABLE ROW LEVEL SECURITY;

-- 4. Structured student record: profile fields + paired BOY/EOY assessments.
--    Assessment keys are org-defined (feature_flags.sis_settings.assessment_fields).
CREATE TABLE IF NOT EXISTS sis_student_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,     -- {preferred_name, grade, hobbies, other_notes, ...}
  assessments jsonb NOT NULL DEFAULT '{}'::jsonb, -- {key: {label, boy, eoy}}
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, student_user_id)
);
ALTER TABLE sis_student_records ENABLE ROW LEVEL SECURITY;

-- 5. Org-generic kiosk devices (generalizes the Treehouse kiosk; gated by
--    feature_flags.kiosk). Token stored as sha256 hash.
CREATE TABLE IF NOT EXISTS org_kiosk_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  class_id uuid REFERENCES org_classes(id) ON DELETE SET NULL, -- optional roster scope
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_org_kiosk_devices_org
  ON org_kiosk_devices(organization_id);
ALTER TABLE org_kiosk_devices ENABLE ROW LEVEL SECURITY;

-- 6. Portfolio curation: per-completion opt-in for the portfolio page
ALTER TABLE quest_task_completions
  ADD COLUMN IF NOT EXISTS in_portfolio boolean NOT NULL DEFAULT false;

-- 7. Payment reminder log (dedupe for the monthly reminder sweep)
CREATE TABLE IF NOT EXISTS sis_payment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES sis_invoices(id) ON DELETE CASCADE,
  installment_id uuid REFERENCES sis_installments(id) ON DELETE CASCADE,
  sent_to text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sis_payment_reminders_invoice
  ON sis_payment_reminders(invoice_id, sent_at);
ALTER TABLE sis_payment_reminders ENABLE ROW LEVEL SECURITY;

-- 8. Teacher XP adjustments audit trail
CREATE TABLE IF NOT EXISTS sis_xp_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id uuid,
  quest_id uuid,
  adjusted_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  xp_before integer,
  xp_after integer,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sis_xp_adjustments_student
  ON sis_xp_adjustments(student_user_id, created_at);
ALTER TABLE sis_xp_adjustments ENABLE ROW LEVEL SECURITY;

-- 9. Quest engagement (inactivity) alerts for teachers
CREATE TABLE IF NOT EXISTS sis_engagement_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  class_id uuid REFERENCES org_classes(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id uuid,
  alert_type text NOT NULL, -- 'unfinished_next_released' | 'inactive_two_weeks'
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sis_engagement_alerts_open_dedupe
  ON sis_engagement_alerts(organization_id, student_user_id, quest_id, alert_type)
  WHERE resolved_at IS NULL;
ALTER TABLE sis_engagement_alerts ENABLE ROW LEVEL SECURITY;

-- 10. Teacher submissions inbox: review state per completion (absence = "new")
CREATE TABLE IF NOT EXISTS sis_submission_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  completion_id uuid NOT NULL UNIQUE REFERENCES quest_task_completions(id) ON DELETE CASCADE,
  reviewed_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'accepted', -- accepted | commented
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sis_submission_reviews_org
  ON sis_submission_reviews(organization_id, reviewed_at);
ALTER TABLE sis_submission_reviews ENABLE ROW LEVEL SECURITY;
