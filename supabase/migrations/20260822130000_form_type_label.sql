-- What a form was CALLED the day it was filed (iCreate, 2026-08-22).
--
-- `form_type_label` is computed at read time from a hardcoded Python dict, so
-- every submission shows today's label for its type. That is fine while the
-- list is fixed and wrong the moment a school can edit it: renaming "Supply
-- request" to "Materials request" would silently rewrite the label on two years
-- of history, and retiring a type would leave old rows rendering a raw slug.
--
-- Denormalized ahead of the form builder rather than with it, so there is no
-- window where org-editable labels exist and history is still being rewritten.
-- Existing rows are backfilled from the built-in list; reads fall back to the
-- computed label when the column is null, so nothing depends on the backfill.

ALTER TABLE public.sis_form_submissions
  ADD COLUMN IF NOT EXISTS form_type_label text;

COMMENT ON COLUMN public.sis_form_submissions.form_type_label IS
  'The form type''s display name AS OF submission. Written at submit time so '
  'renaming or retiring a form type never rewrites what past submissions say.';

UPDATE public.sis_form_submissions SET form_type_label = CASE form_type
    WHEN 'incident' THEN 'Incident report'
    WHEN 'injury' THEN 'Injury report'
    WHEN 'behavior' THEN 'Student behavior report'
    WHEN 'student_concern' THEN 'Student concern'
    WHEN 'supply_request' THEN 'Supply request'
    WHEN 'maintenance' THEN 'Maintenance request'
    WHEN 'technology' THEN 'Technology problem'
    WHEN 'teacher_support' THEN 'Teacher support request'
    WHEN 'substitute_request' THEN 'Substitute request'
    WHEN 'substitute_notes' THEN 'Substitute notes'
    WHEN 'end_of_day' THEN 'End-of-day checklist'
    WHEN 'parent_contact' THEN 'Parent-contact record'
    WHEN 'reimbursement' THEN 'Reimbursement request'
    WHEN 'training_idea' THEN 'Training idea'
    WHEN 'employee_review' THEN 'Employee review'
    WHEN 'task' THEN 'Task'
    WHEN 'other' THEN 'Other'
    WHEN 'at_home_learning_day' THEN 'At-home learning day request'
    WHEN 'general_request' THEN 'General request'
    WHEN 'records_request' THEN 'Records request'
    WHEN 'meeting_request' THEN 'Request a meeting'
    ELSE form_type
  END
  WHERE form_type_label IS NULL;
