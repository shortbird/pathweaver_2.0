-- One targeting model for training, whatever shape the training takes.
--
-- The Training page lists two kinds of row: a quest (sis_staff_training) and
-- a link to a video or document (org_resources.is_training, 2026-09-15). The
-- link took the document library's targeting -- which roles, and which named
-- people -- while a quest could only be aimed at roles, so the page carried
-- two "who is this for" forms that answered slightly different questions
-- (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, NB1/NW1; consolidation
-- move M18). A quest now carries the same named-people column, read by the
-- same filter (sis_service.filter_role_visible) and the same eligibility
-- predicate, so one form serves both kinds.
--
-- NULL means "nobody in particular": roles alone, or everyone. Additive; no
-- row changes meaning.

ALTER TABLE public.sis_staff_training
    ADD COLUMN IF NOT EXISTS visible_to_user_ids uuid[];

COMMENT ON COLUMN public.sis_staff_training.visible_to_user_ids IS
  'Named people this training is for, ORed with visible_to_roles (the same pair org_resources carries). NULL = nobody in particular.';
