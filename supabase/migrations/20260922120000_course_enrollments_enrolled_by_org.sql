-- Who sold a course enrolment, so a partner can still see it when the student
-- is not one of theirs.
--
-- A partner org (OnFire Learning) sells one-off Optio courses to homeschool
-- families. Until now the registration form refused any email that already had
-- an Optio account outside the partner's org, because adopting that account
-- would overwrite its role. The form now enrols the existing account instead,
-- touching nothing on the user row -- but the partner's "Active Enrolments"
-- tab lists users by organization_id, so those enrolments would be invisible
-- to the person who created them, and "Remove access" would refuse them.
--
-- This column is the missing link. It is set only when the enrolment row is
-- created (or reactivated) through the partner registration route, which is
-- also the boundary for removal: a partner may withdraw what it sold and
-- nothing else. unenroll_user() deletes user_quests and user_quest_tasks, so
-- letting a partner remove an enrolment it did not create would destroy
-- another school's student work.
ALTER TABLE public.course_enrollments
  ADD COLUMN IF NOT EXISTS enrolled_by_organization_id uuid
    REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_course_enrollments_enrolled_by_org
  ON public.course_enrollments (enrolled_by_organization_id)
  WHERE enrolled_by_organization_id IS NOT NULL;

COMMENT ON COLUMN public.course_enrollments.enrolled_by_organization_id IS
  'The organization that created this enrolment on a student''s behalf, set by the partner course-registration route. NULL for every other enrolment path, including a student enrolling themselves.';
