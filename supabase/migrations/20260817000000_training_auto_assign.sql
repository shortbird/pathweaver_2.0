-- Training quests that put themselves on people's accounts.
--
-- Background. sis_staff_training is a catalog: it records which quests a school
-- has set for its teachers and its families, and progress is read back from the
-- ordinary quest tables. Nothing ever created the enrollment -- each person had
-- to find the quest and pick it up themselves, and "required" was a label with
-- nothing behind it.
--
-- iCreate, 2026-08-17, running family orientation and teacher training as
-- quests: the quest has to already be on the account. An admin can now press
-- "assign to everyone", which enrolls the current roster. This flag covers the
-- rest -- with it set, somebody who joins the org afterwards is enrolled when
-- they next load their training page or family portal, so an orientation quest
-- does not quietly miss the family that registered on Thursday.
--
-- Default false: an existing catalog row keeps behaving exactly as it does now.

ALTER TABLE public.sis_staff_training
    ADD COLUMN IF NOT EXISTS auto_assign boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sis_staff_training.auto_assign IS
    'Enroll everyone in the audience automatically, including people who join later. Checked on the audience''s own read path (GET /api/sis/training, GET /api/sis/parent/quests).';
