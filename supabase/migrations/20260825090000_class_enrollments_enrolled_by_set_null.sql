-- A parent who registered their own child can never delete their account.
--
-- 2026-08-25, Sentry OPTIO-BACKEND-75 / -76: the nightly deletion sweep has been
-- retrying one account (an iCreate parent, deletion_status='pending' since
-- 2026-08-24) and failing every time with GoTrue's opaque
--   "Database error deleting user"
-- The real cause is 11 rows of class_enrollments.enrolled_by pointing at them:
-- sis_parent_service.register_for_class() stamps `enrolled_by = user_id`, so
-- self-service registration makes every parent the author of their own
-- children's enrollment rows. NOT NULL + ON DELETE NO ACTION then blocks the
-- cascade, permanently, for any parent who ever used the family portal.
--
-- 20260819010000 already decided the policy for exactly this column -- "metadata
-- about an action, not the subject of the record, so the record must outlive the
-- account and the correct behaviour on delete is SET NULL" -- and then had to
-- skip it, along with 17 others, for one mechanical reason: SET NULL cannot be
-- applied to a NOT NULL column. That exclusion was never a judgment that a
-- parent leaving should strand their children's schedule. So: drop the NOT NULL
-- and finish the job.
--
-- The enrollment itself is untouched. `student_id` is the subject of the record
-- and still says who is in the class; only "who clicked enroll" goes blank, and
-- only for accounts that no longer exist.
--
-- Still deliberately blocking (NOT NULL, staff-authored, a 409 "archive instead"
-- rather than an erasure): class_advisors.assigned_by, class_quests.added_by,
-- courses.created_by, credit_review_messages.author_id, curriculum_attachments
-- .uploaded_by, curriculum_lessons.created_by, curriculum_uploads.uploaded_by,
-- org_classes.created_by, prior_learning_evidence.uploaded_by,
-- prior_learning_records.submitted_by, sis_secure_documents.uploaded_by,
-- student_weekly_xp_goals.set_by, task_feedback.reviewer_id,
-- transcript_share_tokens.issued_by. Those name a school's content, not a
-- family's own paperwork. purge_user() now reports whichever one blocks by name,
-- so the next occurrence is one log line instead of this investigation.

ALTER TABLE public.class_enrollments
  ALTER COLUMN enrolled_by DROP NOT NULL;

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.contype = 'f'
    AND c.conrelid = 'public.class_enrollments'::regclass
    AND c.confrelid = 'public.users'::regclass
    AND array_length(c.conkey, 1) = 1
    AND a.attname = 'enrolled_by'
    AND c.confdeltype <> 'n'
  LIMIT 1;

  IF con_name IS NULL THEN
    RETURN;  -- already ON DELETE SET NULL
  END IF;

  EXECUTE format('ALTER TABLE public.class_enrollments DROP CONSTRAINT %I', con_name);
  EXECUTE format(
    'ALTER TABLE public.class_enrollments ADD CONSTRAINT %I '
    'FOREIGN KEY (enrolled_by) REFERENCES public.users(id) ON DELETE SET NULL',
    con_name);
END $$;
