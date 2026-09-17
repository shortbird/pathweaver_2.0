-- One writer for emergency contacts (M4, docs/sis/CONSOLIDATION_PLAN.md).
--
-- The funnel replaced a student's contacts wholesale whenever a family
-- re-submitted the details step, deleting the ones the office had added. A
-- row now says who wrote it, so the funnel replaces only its own.
ALTER TABLE public.emergency_contacts
  ADD COLUMN IF NOT EXISTS source text;

COMMENT ON COLUMN public.emergency_contacts.source IS
  'Who wrote the row: registration_funnel for the family''s own details step; NULL for rows the office added (or from before this column).';
