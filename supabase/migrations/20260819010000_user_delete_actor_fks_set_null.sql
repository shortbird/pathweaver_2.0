-- Removing a person from a school 500s on an audit column nobody remembered.
--
-- 2026-08-19, iCreate: DELETE /api/sis/people/<id> died with
--   "update or delete on table \"users\" violates foreign key constraint
--    \"group_members_added_by_fkey\" on table \"group_members\""
-- (Sentry OPTIO-BACKEND-6W / -6X, and the same complaint from the front office
-- on 2026-08-08: "When I agreed to archive, it gave me an internal error.")
--
-- sis_person_service._delete clears the child rows it knows about — household
-- members, enrolments, waitlist entries — and then deletes the account. Any
-- other table pointing at users(id) is an unhandled 500. There are ~50 such
-- constraints and the Python list will never keep up with them, which is why
-- this is fixed in the schema instead.
--
-- The columns below all answer "who did this": added_by, created_by,
-- reviewed_by, uploaded_by, and friends. They are metadata about an action, not
-- the subject of the record, so the record must outlive the account and the
-- correct behaviour on delete is SET NULL. Every one is already nullable, so
-- this changes no existing row -- only what happens the next time an account is
-- erased.
--
-- Deliberately NOT included:
--   * NOT NULL actor columns (class_enrollments.enrolled_by,
--     courses.created_by, and 16 others). SET NULL would fail at runtime. These
--     stay blocking, and sis_person_service now reports them as a 409 "archive
--     instead" rather than a 500.
--   * sis_form_submissions.student_user_id — the subject of the submission, not
--     an actor. Nulling it would orphan the record's identity.

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('advisor_student_assignments', 'assigned_by'),
      ('ai_prompt_components',        'modified_by'),
      ('curriculum_attachments',      'deleted_by'),
      ('curriculum_lessons',          'last_edited_by'),
      ('curriculum_uploads',          'reviewed_by'),
      ('diploma_review_rounds',       'reviewer_id'),
      ('diplomas',                    'public_consent_given_by'),
      ('group_members',               'added_by'),
      ('org_invitations',             'accepted_by'),
      ('organization_course_access',  'granted_by'),
      ('organization_quest_access',   'granted_by'),
      ('parental_consent_log',        'reviewed_by_admin_id'),
      ('planned_credits',             'created_by'),
      ('prior_learning_records',      'credited_by'),
      ('prior_learning_records',      'reviewed_by'),
      ('quest_task_completions',      'credit_reviewer_id'),
      ('quest_task_completions',      'reviewed_by'),
      ('quests',                      'created_by'),
      ('quests',                      'curriculum_last_edited_by'),
      ('role_change_log',             'changed_by'),
      ('sis_form_submissions',        'assigned_to'),
      ('sis_form_submissions',        'resolved_by'),
      ('sis_onboarding_assignments',  'assigned_by'),
      ('sis_onboarding_templates',    'created_by'),
      ('sis_staff_assignments',       'created_by'),
      ('sis_time_entries',            'approved_by'),
      ('sis_time_entries',            'edited_by'),
      ('transcript_overrides',        'updated_by'),
      ('transcript_share_tokens',     'revoked_by'),
      ('transfer_credits',            'created_by'),
      ('users',                       'ai_features_enabled_by'),
      ('users',                       'parental_consent_verified_by')
    ) AS t(child_table, child_column)
  LOOP
    -- Find the existing constraint by (table, column) -> users, whatever it is
    -- named, and only touch it if it is not already SET NULL.
    DECLARE
      child_oid oid;
      con_name  text;
      col_notnull boolean;
    BEGIN
      -- to_regclass rather than a cast: a table that does not exist must skip,
      -- not abort the migration.
      child_oid := to_regclass(format('public.%I', fk.child_table));
      IF child_oid IS NULL THEN
        CONTINUE;
      END IF;

      SELECT c.conname INTO con_name
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f'
        AND c.conrelid = child_oid
        AND c.confrelid = 'public.users'::regclass
        AND array_length(c.conkey, 1) = 1
        AND a.attname = fk.child_column
        AND c.confdeltype <> 'n'
      LIMIT 1;

      IF con_name IS NULL THEN
        CONTINUE;  -- already SET NULL, or the column/constraint is gone
      END IF;

      SELECT a.attnotnull INTO col_notnull
      FROM pg_attribute a
      WHERE a.attrelid = child_oid
        AND a.attname = fk.child_column;

      IF col_notnull THEN
        RAISE WARNING 'skipping %.% — NOT NULL, cannot SET NULL',
          fk.child_table, fk.child_column;
        CONTINUE;
      END IF;

      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',
                     fk.child_table, con_name);
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) '
        'REFERENCES public.users(id) ON DELETE SET NULL',
        fk.child_table, con_name, fk.child_column);
    END;
  END LOOP;
END $$;
