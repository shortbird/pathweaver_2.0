-- Show/hide for class materials (iCreate/Horizon, 2026-09-02: "teachers/admin
-- need to be able to hide/show materials as well").
--
-- Same switch curriculum resources got in 20260902210000, on the other list a
-- class shows students, so a teacher gets one rule for both: a handout is
-- staged or it is handed out, and the switch says which.
--
-- DEFAULT TRUE, and that is the OPPOSITE of sis_curriculum_materials on
-- purpose. Do not "make them consistent" -- the defaults differ because the two
-- lists start from opposite places:
--
--   - sis_curriculum_materials defaults FALSE. A curriculum has been staff-only
--     since it was built (answer keys, teacher's guides, planning notes), so
--     hanging a student-facing list off it had to be opt-in or shipping it would
--     have published all of that at once.
--   - class_materials defaults TRUE. These have ALWAYS been visible to enrolled
--     students -- that is the entire purpose of the table -- so defaulting false
--     would hide every handout already there the moment this deploys. On
--     2026-09-02 that was 17 rows across Gryffin, Horizon and iCreate,
--     including the flash cards and IXL quiz Horizon's Science class is using
--     this week.
--
-- NOT NULL with a default backfills the existing rows to visible, which is what
-- they already are. Nothing changes for anyone until a teacher flips a switch.

ALTER TABLE public.class_materials
  ADD COLUMN IF NOT EXISTS visible_to_students boolean DEFAULT true NOT NULL;
