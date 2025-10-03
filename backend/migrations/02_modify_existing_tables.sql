-- ============================================================================
-- PERSONALIZED QUEST SYSTEM - MODIFY EXISTING TABLES
-- Run this in Supabase SQL Editor AFTER 01_create_personalized_tables.sql
-- ============================================================================

-- Part 2: Modify existing tables for personalized quest system
-- ============================================================================

-- Add personalization tracking to user_quests
ALTER TABLE user_quests
ADD COLUMN IF NOT EXISTS personalization_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS personalization_session_id UUID REFERENCES quest_personalization_sessions(id);

-- Add index for personalization queries
CREATE INDEX IF NOT EXISTS idx_user_quests_personalization
    ON user_quests(user_id, quest_id, personalization_completed);

-- Add user_quest_task_id to quest_task_completions (links to personalized tasks)
ALTER TABLE quest_task_completions
ADD COLUMN IF NOT EXISTS user_quest_task_id UUID REFERENCES user_quest_tasks(id);

-- Add index for new FK
CREATE INDEX IF NOT EXISTS idx_task_completions_user_task
    ON quest_task_completions(user_quest_task_id);

-- Update existing enrollments to mark as personalization_completed = true
-- (These were created before the personalized system, so no personalization was needed)
UPDATE user_quests
SET personalization_completed = true
WHERE personalization_completed IS NULL OR personalization_completed = false;

-- Comment on changes
COMMENT ON COLUMN user_quests.personalization_completed IS 'Indicates if user has completed the AI personalization wizard for this quest';
COMMENT ON COLUMN user_quests.personalization_session_id IS 'Links to the personalization session used to create this quest';
COMMENT ON COLUMN quest_task_completions.user_quest_task_id IS 'Links to the specific user-personalized task that was completed';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Part 2 Complete: Existing tables modified successfully';
END $$;
