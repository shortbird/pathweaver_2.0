-- Migration: Add source_task_id to user_quest_tasks
-- Purpose: Track which template task was copied from for course enrollment task mapping
-- Date: 2026-01-02

-- Add source_task_id column to track the original task ID when copying tasks
ALTER TABLE user_quest_tasks ADD COLUMN IF NOT EXISTS source_task_id UUID;

-- Index for fast lookups when resolving task IDs from lesson links
CREATE INDEX IF NOT EXISTS idx_user_quest_tasks_source_task_id
ON user_quest_tasks(source_task_id);

-- Add comment for documentation
COMMENT ON COLUMN user_quest_tasks.source_task_id IS
'Original task ID this was copied from (for course enrollment task mapping)';
