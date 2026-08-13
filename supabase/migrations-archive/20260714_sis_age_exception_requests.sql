-- Age-exception requests: a family asks the school to allow a student into a
-- class outside its posted age band. The Schedule Builder hides out-of-band
-- classes; this is the deliberate, low-key escape hatch (kept quiet on purpose
-- so it isn't overused). Staff review timestamped requests on the SIS
-- Registration page; approving one enrolls the student immediately.

CREATE TABLE IF NOT EXISTS sis_age_exception_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  guardian_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES org_classes(id) ON DELETE CASCADE,
  -- Snapshots at request time (the class band or the student's DOB may change later).
  student_age smallint,
  class_min_age smallint,
  class_max_age smallint,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One live request per student+class; re-requesting after a decision is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS sis_age_exception_requests_pending_uniq
  ON sis_age_exception_requests (organization_id, student_user_id, class_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS sis_age_exception_requests_org_idx
  ON sis_age_exception_requests (organization_id, status, created_at DESC);

COMMENT ON TABLE sis_age_exception_requests IS
  'Family requests to enroll a student in a class outside its age band. Timestamped; staff approve (enrolls immediately) or decline on the SIS Registration page.';

-- Backend-only access, same posture as the other SIS tables.
ALTER TABLE sis_age_exception_requests ENABLE ROW LEVEL SECURITY;
