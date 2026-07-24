-- Track whether a SIS form submission came from staff (teacher/admin filing an
-- internal form) or from a parent/guardian (family request landing in the same
-- staff review queue). Existing rows are all staff-filed, hence the default.
ALTER TABLE public.sis_form_submissions
    ADD COLUMN IF NOT EXISTS submitter_role text NOT NULL DEFAULT 'staff';

COMMENT ON COLUMN public.sis_form_submissions.submitter_role IS
    'Who filed this submission: ''staff'' (teacher/admin) or ''parent'' (guardian family request).';
