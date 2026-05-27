-- Extend the quests.quest_type CHECK constraint to allow 'class', the new
-- mobile transcript-class quest type. Previously only 'optio' (user-created)
-- and 'course' (course-linked) were permitted.

ALTER TABLE quests DROP CONSTRAINT IF EXISTS check_quest_type;
ALTER TABLE quests
  ADD CONSTRAINT check_quest_type
  CHECK (quest_type IN ('optio', 'course', 'class'));
