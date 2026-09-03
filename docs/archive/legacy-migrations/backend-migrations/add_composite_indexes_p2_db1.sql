-- P2-DB-1: Add composite indexes for common query patterns
-- Date: December 19, 2025
-- Purpose: Improve query performance for user completions and friendship lookups

-- Index for sorting user's task completions by date (portfolio, activity feed)
-- Supports: SELECT * FROM quest_task_completions WHERE user_id = ? ORDER BY completed_at DESC
CREATE INDEX IF NOT EXISTS idx_quest_completions_user_completed
ON quest_task_completions (user_id, completed_at DESC);

-- Index for filtering friendships by requester and status (connections page)
-- Supports: SELECT * FROM friendships WHERE requester_id = ? AND status = 'pending'
CREATE INDEX IF NOT EXISTS idx_friendships_requester_status
ON friendships (requester_id, status);

-- Index for filtering friendships by addressee and status (connection requests received)
-- Supports: SELECT * FROM friendships WHERE addressee_id = ? AND status = 'pending'
CREATE INDEX IF NOT EXISTS idx_friendships_addressee_status
ON friendships (addressee_id, status);

-- Note: The following indexes already exist and don't need to be created:
-- - idx_user_quest_tasks_user_quest (user_id, quest_id) on user_quest_tasks
-- - idx_user_skill_xp (user_id, pillar) on user_skill_xp
