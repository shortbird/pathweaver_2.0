-- Enrollment-level age-group waitlist (iCreate; Marika Connole feedback 2026-07-15).
--
-- Distinct from the per-class waitlist (sis_waitlist_entries): here the STUDENT
-- is waitlisted at registration time because their age falls in a band the org
-- gated (feature_flags.sis_settings.enrollment_age_gates). A waiting student
-- completes registration but cannot select classes; staff release students
-- individually ("room for 9 of the 12") from the SIS Registration page, which
-- unlocks class selection and emails the guardian.

CREATE TABLE IF NOT EXISTS sis_enrollment_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id uuid REFERENCES households(id) ON DELETE SET NULL,
  guardian_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Snapshots at registration time (the gate bands may change later).
  age_snapshot smallint,
  band_min_age smallint,
  band_max_age smallint,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'released')),
  released_by uuid REFERENCES users(id) ON DELETE SET NULL,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One live waitlist row per student per org.
CREATE UNIQUE INDEX IF NOT EXISTS sis_enrollment_waitlist_waiting_uniq
  ON sis_enrollment_waitlist (organization_id, student_user_id)
  WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS sis_enrollment_waitlist_org_idx
  ON sis_enrollment_waitlist (organization_id, status, created_at);

COMMENT ON TABLE sis_enrollment_waitlist IS
  'Students waitlisted at registration because their age falls in a gated band (sis_settings.enrollment_age_gates). Waiting students cannot select classes; staff release them individually.';

-- Backend-only access, same posture as the other SIS tables.
ALTER TABLE sis_enrollment_waitlist ENABLE ROW LEVEL SECURITY;

-- Fee deferral: when every kid in a registration is waitlisted, the funnel
-- completes without payment; the fee comes due when the first student is
-- released (the registration reopens at the fee step).
ALTER TABLE icreate_registrations
  ADD COLUMN IF NOT EXISTS fee_deferred boolean NOT NULL DEFAULT false;
