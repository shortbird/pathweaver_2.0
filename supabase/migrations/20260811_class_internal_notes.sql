-- Staff-only internal notes on a class.
--
-- iCreate, 2026-08-11: "Can you add a section to have internal notes for each
-- class?"
--
-- One free-text column on org_classes, edited wherever the class is edited
-- (the SIS class editor). Internal means internal: the catalog service strips
-- it from every non-staff audience (the parent Schedule Builder and the public
-- embed both read classes with audience='family'), and org_classes' RLS
-- policies only grant direct reads to org admins and advisors, so families
-- can't reach it through the Data API either.

ALTER TABLE public.org_classes
  ADD COLUMN IF NOT EXISTS internal_notes text;

COMMENT ON COLUMN public.org_classes.internal_notes IS
  'Staff-only notes about the class (room setup, supplies, office reminders). '
  'Never serialized to family or public audiences.';
