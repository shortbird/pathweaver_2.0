-- Migration: Add Tutorial Quest Infrastructure
-- Created: 2025-01-10
-- Description: Adds support for programmatically-verified tutorial quests

-- Add is_tutorial flag to quests table
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS is_tutorial BOOLEAN DEFAULT FALSE;

-- Add auto_complete flag to user_quest_tasks table
ALTER TABLE user_quest_tasks
ADD COLUMN IF NOT EXISTS auto_complete BOOLEAN DEFAULT FALSE;

-- Add verification_query column to store verification logic
ALTER TABLE user_quest_tasks
ADD COLUMN IF NOT EXISTS verification_query JSONB DEFAULT NULL;

-- Add tutorial_completed_at to track when users finish tutorial
ALTER TABLE users
ADD COLUMN IF NOT EXISTS tutorial_completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for tutorial quest lookups
CREATE INDEX IF NOT EXISTS idx_quests_is_tutorial ON quests(is_tutorial) WHERE is_tutorial = TRUE;

-- Create index for user tutorial completion
CREATE INDEX IF NOT EXISTS idx_users_tutorial_completed ON users(tutorial_completed_at);

-- Create table to track tutorial task verification history
CREATE TABLE IF NOT EXISTS tutorial_verification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES user_quest_tasks(id) ON DELETE CASCADE,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verification_data JSONB DEFAULT NULL,
    UNIQUE(user_id, task_id)
);

-- Create index for verification log queries
CREATE INDEX IF NOT EXISTS idx_tutorial_verification_user ON tutorial_verification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_tutorial_verification_task ON tutorial_verification_log(task_id);

-- Add comment for documentation
COMMENT ON COLUMN quests.is_tutorial IS 'Indicates if this quest is the platform tutorial with auto-verified tasks';
COMMENT ON COLUMN user_quest_tasks.auto_complete IS 'If true, task completion is verified programmatically via database checks';
COMMENT ON COLUMN user_quest_tasks.verification_query IS 'JSONB object containing verification logic for auto-complete tasks';
COMMENT ON TABLE tutorial_verification_log IS 'Tracks when tutorial tasks are automatically verified for users';
