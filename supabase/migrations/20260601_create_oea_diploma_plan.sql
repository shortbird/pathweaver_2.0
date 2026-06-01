-- OEA Diploma Plan: program tag + pathway enrollment + self-attested credits.
--
-- Backs the Optio <> OpenEd Academy (OEA) Diploma Plan integration (PRD V2).
-- OEA families are PLATFORM users (organization_id = NULL) carrying a lightweight
-- program tag, NOT org-managed users. A parent account is flagged at signup via
-- a marketplace partner key; each managed student picks one of three fixed
-- diploma pathways (defined as backend constants in backend/utils/oea_pathways.py,
-- NOT in the DB) and earns 24 course-credits toward an OEA diploma.
--
-- This is a SEPARATE, program-gated self-attestation path. It deliberately does
-- NOT touch the existing XP/credit_ledger + diploma_review_rounds approval flow
-- used by every other diploma user. OEA credits are parent-attested with an A-F
-- letter grade (no advisor approval round); GPA is computed from these rows.
--
-- Backend reads/writes via the admin client (Optio uses a custom JWT, not
-- Supabase auth.uid()), so RLS is enabled with NO public policies: that denies
-- direct Data API / anon access while the admin client bypasses RLS. The v2
-- frontend never touches these tables directly -- it goes through /api/oea/*.
-- Default data-API grants are already handled by
-- 20260527_restore_default_data_api_grants.sql.

-- 1. Program tag on users. NULL for everyone not in a partner program.
--    Additive nullable column -> metadata-only change, no table rewrite.
ALTER TABLE users ADD COLUMN IF NOT EXISTS program_key text;

CREATE INDEX IF NOT EXISTS idx_users_program_key
  ON users(program_key) WHERE program_key IS NOT NULL;

-- 2. Per-student pathway enrollment. One active pathway per student; the parent
--    may change it at any time (UPDATE pathway_key in place), no approval needed.
CREATE TABLE IF NOT EXISTS oea_enrollments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  parent_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  program_key  text NOT NULL DEFAULT 'opened-academy',
  pathway_key  text NOT NULL
               CHECK (pathway_key IN ('open_balanced','traditional','college_bound')),
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','withdrawn','completed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oea_enrollments_parent ON oea_enrollments(parent_id);

-- 3. Self-attested course credits. Modeled on planned_credits (subject + course
--    + credits + status) and extended with the OEA grading fields: letter grade,
--    honors/AP/IB weighting, foundation-vs-elective category, and which pathway
--    requirement slot the credit fills (requirement_key, from oea_pathways.py).
--    subject_key maps to the platform taxonomy (backend/utils/school_subjects.py)
--    for transcript alignment; it may be NULL for OEA-only slots like
--    "world_language" / "health_pe" that don't 1:1 map to a platform subject.
CREATE TABLE IF NOT EXISTS oea_credits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrollment_id   uuid REFERENCES oea_enrollments(id) ON DELETE CASCADE,
  requirement_key text NOT NULL,
  category        text NOT NULL CHECK (category IN ('foundation','elective')),
  subject_key     text,
  course_name     text NOT NULL,
  credits         numeric NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress','complete')),
  letter_grade    text CHECK (letter_grade IN ('A','B','C','D','F')),
  is_weighted     boolean NOT NULL DEFAULT false,
  completed_at    timestamptz,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oea_credits_student ON oea_credits(student_id);
CREATE INDEX IF NOT EXISTS idx_oea_credits_enrollment ON oea_credits(enrollment_id);

-- 4. RLS: enabled, no public policies. Admin-client only (RLS bypass).
ALTER TABLE oea_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE oea_credits ENABLE ROW LEVEL SECURITY;
