-- Directions at the top of a checklist (iCreate, 2026-08-22).
--
-- "Can we add a place to put directions at the top of the checklists?" Today the
-- only prose on a checklist is per-item: the template carries a name and a list
-- of items, and the person opening it sees "Employee onboarding, 0/9 complete"
-- and nothing telling them what this packet is or in what order to work.
--
-- The column lands on BOTH tables on purpose. Assigning a template snapshots its
-- items and name onto the assignment, so later template edits never rewrite an
-- in-flight checklist; directions have to be snapshotted the same way or an edit
-- would silently change the instructions under somebody mid-way through.

ALTER TABLE public.sis_onboarding_templates ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.sis_onboarding_assignments ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.sis_onboarding_templates.description IS
  'Directions shown at the top of the checklist, above the items. Snapshotted '
  'onto each assignment at assign time, like name and items.';

COMMENT ON COLUMN public.sis_onboarding_assignments.description IS
  'Directions copied from the template when this checklist was assigned. A later '
  'template edit does not reach it (see the Sync assigned checklists action).';
