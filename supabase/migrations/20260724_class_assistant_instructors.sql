-- iCreate feedback: allow a class to have one or more assistant teachers in
-- addition to its primary instructor. Stored as an array of user ids on the
-- class; validated backend-side to be org members. Additive and nullable.
ALTER TABLE public.org_classes
  ADD COLUMN IF NOT EXISTS assistant_instructor_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.org_classes.assistant_instructor_ids IS
  'Optional assistant teachers for this class (user ids), in addition to primary_instructor_id.';
