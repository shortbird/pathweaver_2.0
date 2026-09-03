-- Migration: Student-Curated Classes
-- Date: 2026-04-23
-- Purpose: Let Optio students author a simple "class" (a Course under the hood)
--   that friends can sign up for via a shareable invite link. Adds teacher-of-record,
--   kickoff, and credit-target fields to courses; a new course_invites table; and
--   enrollment tracking for invite source and kickoff attendance.

BEGIN;

-- ============================================================
-- 1. courses: new fields for student-curated classes
-- ============================================================

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS course_source TEXT NOT NULL DEFAULT 'admin';

ALTER TABLE courses DROP CONSTRAINT IF EXISTS valid_course_source;
ALTER TABLE courses ADD CONSTRAINT valid_course_source
  CHECK (course_source IN ('admin', 'student_curated'));

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS teacher_of_record_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS teacher_bio TEXT;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS teacher_credentials TEXT;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS kickoff_at TIMESTAMPTZ;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS kickoff_meeting_url TEXT;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS credit_subject TEXT;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS credit_amount NUMERIC(3, 2);

ALTER TABLE courses DROP CONSTRAINT IF EXISTS valid_credit_amount;
ALTER TABLE courses ADD CONSTRAINT valid_credit_amount
  CHECK (credit_amount IS NULL OR (credit_amount > 0 AND credit_amount <= 5));

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS max_cohort_size INTEGER;

-- Extend status enum to include 'pending_review' for student classes awaiting admin approval
ALTER TABLE courses DROP CONSTRAINT IF EXISTS valid_course_status;
ALTER TABLE courses ADD CONSTRAINT valid_course_status
  CHECK (status IN ('draft', 'pending_review', 'published', 'archived'));

CREATE INDEX IF NOT EXISTS idx_courses_source ON courses(course_source);
CREATE INDEX IF NOT EXISTS idx_courses_teacher ON courses(teacher_of_record_id);
CREATE INDEX IF NOT EXISTS idx_courses_source_status ON courses(course_source, status);

COMMENT ON COLUMN courses.course_source IS
  'admin = created by staff/org_admin; student_curated = created by a student via the class builder';
COMMENT ON COLUMN courses.teacher_of_record_id IS
  'Licensed teacher who sponsors the class and evaluates work for credit';
COMMENT ON COLUMN courses.kickoff_at IS
  'Scheduled kickoff video call datetime (UTC); attendance is required for enrolled students';
COMMENT ON COLUMN courses.credit_subject IS
  'Subject area the class maps to (e.g., Science, Math, Language Arts)';
COMMENT ON COLUMN courses.credit_amount IS
  'Credits awarded on full completion (e.g., 0.50 for a half-credit class)';

-- ============================================================
-- 2. course_invites: shareable signup tokens
-- ============================================================

CREATE TABLE IF NOT EXISTS course_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  uses_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at TIMESTAMPTZ,

  CONSTRAINT valid_max_uses CHECK (max_uses IS NULL OR max_uses > 0)
);

CREATE INDEX IF NOT EXISTS idx_course_invites_course ON course_invites(course_id);
CREATE INDEX IF NOT EXISTS idx_course_invites_token_active
  ON course_invites(token) WHERE is_active = TRUE;

COMMENT ON TABLE course_invites IS
  'Shareable signup tokens for class enrollment via invite link';
COMMENT ON COLUMN course_invites.max_uses IS
  'NULL = unlimited uses; integer caps total signups via this token';

-- ============================================================
-- 3. course_enrollments: track invite source + kickoff attendance
-- ============================================================

ALTER TABLE course_enrollments
  ADD COLUMN IF NOT EXISTS invite_token_id UUID
    REFERENCES course_invites(id) ON DELETE SET NULL;

ALTER TABLE course_enrollments
  ADD COLUMN IF NOT EXISTS kickoff_attended BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE course_enrollments
  ADD COLUMN IF NOT EXISTS kickoff_attended_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_enrollments_invite
  ON course_enrollments(invite_token_id)
  WHERE invite_token_id IS NOT NULL;

COMMENT ON COLUMN course_enrollments.invite_token_id IS
  'Invite token used to enroll (for student-curated classes)';
COMMENT ON COLUMN course_enrollments.kickoff_attended IS
  'True once the teacher of record marks the student as having attended the kickoff call';

-- ============================================================
-- 4. RLS for course_invites
-- ============================================================

ALTER TABLE course_invites ENABLE ROW LEVEL SECURITY;

-- Course creator and superadmins can view/manage invites for their course
CREATE POLICY "creators_admins_manage_invites" ON course_invites
  FOR ALL
  USING (
    created_by = auth.uid()
    OR course_id IN (
      SELECT id FROM courses WHERE created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'superadmin'
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR course_id IN (
      SELECT id FROM courses WHERE created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'superadmin'
    )
  );

COMMIT;
