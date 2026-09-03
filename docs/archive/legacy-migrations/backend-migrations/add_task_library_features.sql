-- Migration: Add Task Library Features
-- Date: 2025-01-27
-- Description: Add usage tracking, flagging system to quest_sample_tasks

-- Add new columns to quest_sample_tasks
ALTER TABLE quest_sample_tasks
  ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flag_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false;

-- Create quest_task_flags table for tracking individual flag reports
CREATE TABLE IF NOT EXISTS quest_task_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_task_id UUID REFERENCES quest_sample_tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  flag_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quest_sample_tasks_usage
  ON quest_sample_tasks(quest_id, usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_quest_sample_tasks_pillar
  ON quest_sample_tasks(quest_id, pillar);

CREATE INDEX IF NOT EXISTS idx_quest_sample_tasks_flagged
  ON quest_sample_tasks(quest_id, is_flagged);

CREATE INDEX IF NOT EXISTS idx_quest_task_flags_sample_task
  ON quest_task_flags(sample_task_id);

-- Add comment explaining the flagging system
COMMENT ON COLUMN quest_sample_tasks.flag_count IS 'Number of times this task has been flagged by users';
COMMENT ON COLUMN quest_sample_tasks.is_flagged IS 'Auto-set to true when flag_count >= 3, requires admin review';
COMMENT ON TABLE quest_task_flags IS 'Individual flag reports from users for inappropriate or low-quality tasks';
