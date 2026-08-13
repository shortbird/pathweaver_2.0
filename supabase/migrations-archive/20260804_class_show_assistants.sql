-- Per-class control over whether families see the assistant teacher's name.
--
-- iCreate, 2026-08-04: "Can we have a way to add an assistant? And maybe a
-- toggle to show the assistant or not."
--
-- The assistant list (org_classes.assistant_instructor_ids) already existed and
-- already reached the catalog payload, but nothing family-facing rendered it, so
-- there was neither a display nor a way to suppress one. This adds the display
-- and the switch together.
--
-- Default TRUE: an assistant you deliberately named is normally someone families
-- should be able to see. Schools turn it off per class for the cases where the
-- assistant is an aide, a parent volunteer, or still being decided.
--
-- Staff surfaces ignore this flag entirely — the SIS class list always names the
-- assistant, because the office needs to know who is assigned regardless.

ALTER TABLE public.org_classes
  ADD COLUMN IF NOT EXISTS show_assistants boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.org_classes.show_assistants IS
  'Whether family/public catalog views name this class''s assistant teachers. '
  'Staff views always show them.';
