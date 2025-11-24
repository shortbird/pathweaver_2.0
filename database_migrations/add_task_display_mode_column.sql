-- Add task_display_mode column to user_quests table
-- This column stores the user's preferred display mode for quest tasks
-- Options: 'timeline' (sequential numbered tasks) or 'flexible' (pick any order)
-- Default: 'flexible' to give students freedom

ALTER TABLE user_quests
ADD COLUMN IF NOT EXISTS task_display_mode TEXT DEFAULT 'flexible';

-- Add check constraint to ensure only valid values
ALTER TABLE user_quests
ADD CONSTRAINT task_display_mode_check
CHECK (task_display_mode IN ('timeline', 'flexible'));

-- Add index for potential future filtering/querying
CREATE INDEX IF NOT EXISTS idx_user_quests_display_mode
ON user_quests(task_display_mode);

-- Update any existing NULL values to default
UPDATE user_quests
SET task_display_mode = 'flexible'
WHERE task_display_mode IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN user_quests.task_display_mode IS
'Display mode for quest tasks: timeline (sequential) or flexible (any order). Default: flexible.';
