-- Migration: Create additional performance indexes
-- Description: Optimize common query patterns for badge system
-- Date: 2025-09-30

-- Indexes for users table (if not already present)
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active DESC);

-- Indexes for quests table
CREATE INDEX IF NOT EXISTS idx_quests_is_active ON quests(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_quests_created_at ON quests(created_at DESC);

-- Indexes for quest_tasks table
CREATE INDEX IF NOT EXISTS idx_quest_tasks_quest ON quest_tasks(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_tasks_pillar ON quest_tasks(pillar);
CREATE INDEX IF NOT EXISTS idx_quest_tasks_xp ON quest_tasks(xp_amount DESC);
CREATE INDEX IF NOT EXISTS idx_quest_tasks_order ON quest_tasks(quest_id, order_index);

-- Indexes for quest_task_completions table
CREATE INDEX IF NOT EXISTS idx_task_completions_user ON quest_task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_quest ON quest_task_completions(quest_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_task ON quest_task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_date ON quest_task_completions(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_completions_user_quest ON quest_task_completions(user_id, quest_id);

-- Indexes for user_quests table
CREATE INDEX IF NOT EXISTS idx_user_quests_active ON user_quests(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_quests_completed ON user_quests(user_id, completed_at) WHERE completed_at IS NOT NULL;

-- Composite index for common badge progress queries
CREATE INDEX IF NOT EXISTS idx_user_badges_progress_lookup
    ON user_badges(user_id, badge_id, is_active)
    WHERE is_active = true;

-- Composite index for credit calculations
CREATE INDEX IF NOT EXISTS idx_credit_ledger_summary
    ON credit_ledger(user_id, credit_type, academic_year, credits_earned);

-- Index for finding popular badges
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_count
    ON user_badges(badge_id)
    WHERE completed_at IS NOT NULL;

-- Add statistics for query planner
ANALYZE badges;
ANALYZE user_badges;
ANALYZE quest_templates;
ANALYZE badge_quests;
ANALYZE credit_ledger;
ANALYZE ai_content_metrics;
ANALYZE quests;
ANALYZE quest_tasks;
ANALYZE quest_task_completions;
