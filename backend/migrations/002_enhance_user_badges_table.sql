-- Migration: Enhance user_badges table for badge tracking
-- Description: Add columns to track badge pursuit and completion
-- Date: 2025-09-30

-- Add new columns to existing user_badges table
ALTER TABLE user_badges
    ADD COLUMN IF NOT EXISTS badge_id UUID REFERENCES badges(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS progress_percentage INT DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS quests_completed INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS xp_earned INT DEFAULT 0;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON user_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_active ON user_badges(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_badges_completed ON user_badges(user_id, completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_badges_progress ON user_badges(user_id, progress_percentage);

-- Update RLS policies if they don't exist
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own badges and public badges of others
DROP POLICY IF EXISTS user_badges_select_policy ON user_badges;
CREATE POLICY user_badges_select_policy ON user_badges
    FOR SELECT
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = user_badges.user_id
            AND users.role IN ('student', 'advisor', 'admin')
        )
    );

-- Policy: Users can update their own badges
DROP POLICY IF EXISTS user_badges_update_policy ON user_badges;
CREATE POLICY user_badges_update_policy ON user_badges
    FOR UPDATE
    USING (user_id = auth.uid());

-- Policy: Users can insert their own badges
DROP POLICY IF EXISTS user_badges_insert_policy ON user_badges;
CREATE POLICY user_badges_insert_policy ON user_badges
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Add comments for documentation
COMMENT ON COLUMN user_badges.badge_id IS 'Reference to badges table';
COMMENT ON COLUMN user_badges.is_active IS 'Currently pursuing this badge';
COMMENT ON COLUMN user_badges.progress_percentage IS '0-100% completion';
COMMENT ON COLUMN user_badges.started_at IS 'When user selected badge';
COMMENT ON COLUMN user_badges.completed_at IS 'When badge earned';
COMMENT ON COLUMN user_badges.quests_completed IS 'Count of quests done for this badge';
COMMENT ON COLUMN user_badges.xp_earned IS 'XP earned toward this badge';
