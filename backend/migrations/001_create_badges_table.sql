-- Migration: Create badges table
-- Description: Core table for badge-driven learning paths
-- Date: 2025-09-30

CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    identity_statement VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    pillar_primary VARCHAR(100) NOT NULL,
    pillar_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
    min_quests INT NOT NULL DEFAULT 5,
    min_xp INT NOT NULL DEFAULT 1500,
    portfolio_requirement TEXT,
    ai_generated BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'beta', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_badges_status ON badges(status) WHERE status = 'active';
CREATE INDEX idx_badges_pillar ON badges(pillar_primary);
CREATE INDEX idx_badges_ai_generated ON badges(ai_generated);
CREATE INDEX idx_badges_created_at ON badges(created_at DESC);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_badges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_badges_updated_at
    BEFORE UPDATE ON badges
    FOR EACH ROW
    EXECUTE FUNCTION update_badges_updated_at();

-- Add RLS policies
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active badges
CREATE POLICY badges_select_policy ON badges
    FOR SELECT
    USING (status = 'active' OR status = 'beta');

-- Policy: Only admins can insert/update/delete badges
CREATE POLICY badges_admin_policy ON badges
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Add comments for documentation
COMMENT ON TABLE badges IS 'Identity-based learning paths for students';
COMMENT ON COLUMN badges.identity_statement IS 'e.g., "I am a...", "I can...", "I have..."';
COMMENT ON COLUMN badges.pillar_weights IS 'JSONB: {"STEM & Logic": 60, "Society & Culture": 40}';
COMMENT ON COLUMN badges.min_quests IS 'Minimum quests to complete for badge';
COMMENT ON COLUMN badges.min_xp IS 'Minimum XP required for badge';
COMMENT ON COLUMN badges.portfolio_requirement IS 'Special portfolio piece needed (optional)';
COMMENT ON COLUMN badges.status IS 'active, beta, or archived';
