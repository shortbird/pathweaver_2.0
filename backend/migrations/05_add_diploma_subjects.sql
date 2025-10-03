-- Add diploma_subjects column to user_quest_tasks table
ALTER TABLE user_quest_tasks
ADD COLUMN IF NOT EXISTS diploma_subjects JSONB DEFAULT '["Electives"]'::jsonb;

-- Add comment
COMMENT ON COLUMN user_quest_tasks.diploma_subjects IS 'Array of diploma subjects this task contributes to (Language Arts, Mathematics, Science, etc.)';
