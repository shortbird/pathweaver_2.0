-- Drop the student-curated classes feature (Aug 2026 admin panel cleanup).
-- Reverts the schema added by 20260423_student_curated_classes.sql. All
-- application code was removed in the same change (StudentClassForm,
-- PublicClassPage, AdminClassesHub/ReviewQueue/PlatformSettings,
-- routes/courses/invites.py, routes/courses/kickoff.py,
-- routes/platform_settings.py, the invite-flow registration branch).
--
-- DESTRUCTIVE: drops course_invites and platform_settings, plus the
-- student-class columns on courses / course_enrollments.
-- Pre-flight (run before applying):
--   SELECT count(*) FROM courses WHERE course_source = 'student_curated';
--   SELECT count(*) FROM courses WHERE status = 'pending_review';
-- Any student-curated courses left will survive as plain courses; any
-- pending_review rows are folded back to draft below.

-- Drop the dependent columns first: course_enrollments.invite_token_id holds
-- an FK onto course_invites, which otherwise blocks the table drop.
ALTER TABLE course_enrollments
  DROP COLUMN IF EXISTS invite_token_id,
  DROP COLUMN IF EXISTS kickoff_attended,
  DROP COLUMN IF EXISTS kickoff_attended_at;

DROP TABLE IF EXISTS course_invites;
DROP TABLE IF EXISTS platform_settings;

-- Fold the retired review status back to draft before tightening the constraint
UPDATE courses SET status = 'draft' WHERE status = 'pending_review';

ALTER TABLE courses DROP CONSTRAINT IF EXISTS valid_course_status;
ALTER TABLE courses ADD CONSTRAINT valid_course_status
  CHECK (status IN ('draft', 'published', 'archived'));

-- NOTE: credit_subject / credit_amount are deliberately KEPT — although they
-- arrived with the student-curated migration, the partner course-purchase flow
-- (EnrollStudentForm, parent child_overview) reads them on admin courses.
ALTER TABLE courses
  DROP CONSTRAINT IF EXISTS valid_course_source,
  DROP COLUMN IF EXISTS course_source,
  DROP COLUMN IF EXISTS teacher_of_record_id,
  DROP COLUMN IF EXISTS teacher_bio,
  DROP COLUMN IF EXISTS teacher_credentials,
  DROP COLUMN IF EXISTS kickoff_at,
  DROP COLUMN IF EXISTS kickoff_meeting_url,
  DROP COLUMN IF EXISTS max_cohort_size;
