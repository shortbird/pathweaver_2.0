-- Link each OEA course credit to a real Optio quest in the student's account.
--
-- An OpenEd Academy "course" (one oea_credits row) now spawns a standard Optio
-- quest the student works on in the mobile app, using the normal
-- task -> evidence -> learning-journal flow. The quest carries the work + XP;
-- the oea_credit stays the parent-graded credential on top. quest_id is the seam.
--
-- ON DELETE SET NULL: deleting the quest shouldn't delete the credit (the parent
-- may still have graded it); deleting the credit leaves the quest in place as a
-- normal quest the student already invested in.

ALTER TABLE oea_credits ADD COLUMN IF NOT EXISTS quest_id uuid REFERENCES quests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_oea_credits_quest ON oea_credits(quest_id) WHERE quest_id IS NOT NULL;
