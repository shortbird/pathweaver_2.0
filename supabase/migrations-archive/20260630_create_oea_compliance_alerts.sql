-- OEA HS Diploma Phase 2: compliance alert dedup (admin "flag me" sweep).
--
-- The compliance sweep (backend/services/oea_compliance_sweep_service.py) runs on
-- the shared cron dispatcher. After a quarter closes, for each enrolled student's
-- in-progress course it checks the upload minimums (9 logs, 3 artifacts, 1 summary)
-- and notifies org admins about any that fell short. This table dedups those
-- notifications so an org admin is flagged at most once per (student, course,
-- quarter) -- exactly mirroring sis_attendance_alerts.

CREATE TABLE IF NOT EXISTS oea_compliance_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credit_id       uuid REFERENCES oea_credits(id) ON DELETE CASCADE,
  school_year     text NOT NULL,
  term_index      smallint NOT NULL,
  context         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, credit_id, school_year, term_index)
);

CREATE INDEX IF NOT EXISTS idx_oea_compliance_alerts_org
  ON oea_compliance_alerts(organization_id, school_year);

ALTER TABLE oea_compliance_alerts ENABLE ROW LEVEL SECURITY;
