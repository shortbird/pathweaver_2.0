-- Migration: Create quest_templates table
-- Description: Reusable quest patterns for AI generation
-- Date: 2025-09-30

CREATE TABLE IF NOT EXISTS quest_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_statement TEXT NOT NULL,
    applicable_badges UUID[] DEFAULT '{}',
    complexity_level VARCHAR(50) DEFAULT 'intermediate' CHECK (complexity_level IN ('beginner', 'intermediate', 'advanced')),
    estimated_xp INT NOT NULL,
    estimated_hours DECIMAL(5,2),
    credit_mappings JSONB DEFAULT '{}'::jsonb,
    resources JSONB[] DEFAULT '{}',
    ai_generated BOOLEAN DEFAULT false,
    usage_count INT DEFAULT 0,
    success_rate DECIMAL(3,2) DEFAULT 0.00 CHECK (success_rate >= 0 AND success_rate <= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_quest_templates_badges ON quest_templates USING gin(applicable_badges);
CREATE INDEX idx_quest_templates_complexity ON quest_templates(complexity_level);
CREATE INDEX idx_quest_templates_ai_generated ON quest_templates(ai_generated);
CREATE INDEX idx_quest_templates_success_rate ON quest_templates(success_rate DESC);
CREATE INDEX idx_quest_templates_usage_count ON quest_templates(usage_count DESC);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_quest_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_quest_templates_updated_at
    BEFORE UPDATE ON quest_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_quest_templates_updated_at();

-- Add RLS policies
ALTER TABLE quest_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view quest templates
CREATE POLICY quest_templates_select_policy ON quest_templates
    FOR SELECT
    USING (true);

-- Policy: Only admins can insert/update/delete quest templates
CREATE POLICY quest_templates_admin_policy ON quest_templates
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Add comments for documentation
COMMENT ON TABLE quest_templates IS 'Reusable quest patterns for AI generation';
COMMENT ON COLUMN quest_templates.goal_statement IS 'Main learning objective';
COMMENT ON COLUMN quest_templates.applicable_badges IS 'Array of badge IDs this quest counts toward';
COMMENT ON COLUMN quest_templates.complexity_level IS 'beginner, intermediate, or advanced';
COMMENT ON COLUMN quest_templates.credit_mappings IS 'JSONB: {"math": 0.2, "science": 0.3}';
COMMENT ON COLUMN quest_templates.resources IS 'Array of learning resources (JSONB)';
COMMENT ON COLUMN quest_templates.usage_count IS 'How many students used this template';
COMMENT ON COLUMN quest_templates.success_rate IS 'Completion rate (0.00 to 1.00)';
