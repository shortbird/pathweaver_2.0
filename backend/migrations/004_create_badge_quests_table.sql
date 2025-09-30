-- Migration: Create badge_quests table
-- Description: Link badges to their required quests
-- Date: 2025-09-30

CREATE TABLE IF NOT EXISTS badge_quests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT true,
    order_index INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(badge_id, quest_id)
);

-- Create indexes for performance
CREATE INDEX idx_badge_quests_badge ON badge_quests(badge_id);
CREATE INDEX idx_badge_quests_quest ON badge_quests(quest_id);
CREATE INDEX idx_badge_quests_required ON badge_quests(badge_id, is_required) WHERE is_required = true;
CREATE INDEX idx_badge_quests_order ON badge_quests(badge_id, order_index);

-- Add RLS policies
ALTER TABLE badge_quests ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view badge-quest relationships
CREATE POLICY badge_quests_select_policy ON badge_quests
    FOR SELECT
    USING (true);

-- Policy: Only admins can insert/update/delete badge-quest relationships
CREATE POLICY badge_quests_admin_policy ON badge_quests
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Add comments for documentation
COMMENT ON TABLE badge_quests IS 'Links badges to their required/optional quests';
COMMENT ON COLUMN badge_quests.is_required IS 'Must complete for badge?';
COMMENT ON COLUMN badge_quests.order_index IS 'Suggested order (0-based)';
