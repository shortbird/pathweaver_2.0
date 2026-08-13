-- Who a school's quest is for: its teachers, or its families.
--
-- iCreate, 2026-08-06: "admin need to be able to create quests for all their
-- teachers and families. they're doing teacher training through quests and back
-- to school night with families will be a quest."
--
-- The teacher half already worked: sis_staff_training marks a quest as staff
-- training and reads completion back from the ordinary quest tables. Back to
-- school night is the same shape pointed at a different group, so this adds the
-- audience rather than building a parallel table — one catalog, one progress
-- report, one place a quest is attached.
--
-- Defaults to 'staff' so every existing row keeps meaning exactly what it meant.
-- The family audience holds GUARDIAN accounts, not students: a parent completes
-- back to school night themselves.

ALTER TABLE public.sis_staff_training
    ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'staff';

ALTER TABLE public.sis_staff_training
    DROP CONSTRAINT IF EXISTS sis_staff_training_audience_check;
ALTER TABLE public.sis_staff_training
    ADD CONSTRAINT sis_staff_training_audience_check
    CHECK (audience IN ('staff', 'family'));

-- The uniqueness that mattered was "this quest is on the catalog once". It is
-- now "once per audience" — the same quest can legitimately be set for both
-- groups (a school-values quest everyone does), and the old constraint would
-- have made adding it for families silently overwrite the staff row.
ALTER TABLE public.sis_staff_training
    DROP CONSTRAINT IF EXISTS sis_staff_training_organization_id_quest_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS sis_staff_training_org_quest_audience_key
    ON public.sis_staff_training (organization_id, quest_id, audience);

CREATE INDEX IF NOT EXISTS idx_sis_staff_training_audience
    ON public.sis_staff_training (organization_id, audience, sequence_order);

COMMENT ON COLUMN public.sis_staff_training.audience IS
  'staff = teacher training (the original meaning, and the default); '
  'family = a quest for guardians, e.g. back to school night.';
