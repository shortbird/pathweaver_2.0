-- Migration: Create ai_content_metrics table
-- Description: Track AI-generated content performance
-- Date: 2025-09-30

CREATE TABLE IF NOT EXISTS ai_content_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('badge', 'quest', 'task')),
    content_id UUID NOT NULL,
    engagement_score DECIMAL(3,2) DEFAULT 0.00 CHECK (engagement_score >= 0 AND engagement_score <= 1),
    completion_rate DECIMAL(3,2) DEFAULT 0.00 CHECK (completion_rate >= 0 AND completion_rate <= 1),
    avg_time_to_complete INT,
    student_feedback_avg DECIMAL(3,2) DEFAULT 0.00 CHECK (student_feedback_avg >= 0 AND student_feedback_avg <= 5),
    teacher_override_count INT DEFAULT 0,
    view_count INT DEFAULT 0,
    start_count INT DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_ai_metrics_content ON ai_content_metrics(content_type, content_id);
CREATE INDEX idx_ai_metrics_engagement ON ai_content_metrics(engagement_score DESC);
CREATE INDEX idx_ai_metrics_completion ON ai_content_metrics(completion_rate DESC);
CREATE INDEX idx_ai_metrics_feedback ON ai_content_metrics(student_feedback_avg DESC);
CREATE INDEX idx_ai_metrics_updated ON ai_content_metrics(last_updated DESC);

-- Add trigger to update last_updated timestamp
CREATE OR REPLACE FUNCTION update_ai_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ai_metrics_updated_at
    BEFORE UPDATE ON ai_content_metrics
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_metrics_updated_at();

-- Add RLS policies
ALTER TABLE ai_content_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view metrics
CREATE POLICY ai_metrics_admin_select_policy ON ai_content_metrics
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Policy: Only admins can modify metrics
CREATE POLICY ai_metrics_admin_modify_policy ON ai_content_metrics
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Add comments for documentation
COMMENT ON TABLE ai_content_metrics IS 'Performance metrics for AI-generated content';
COMMENT ON COLUMN ai_content_metrics.content_type IS 'badge, quest, or task';
COMMENT ON COLUMN ai_content_metrics.engagement_score IS '0-1 score based on views/starts/completions';
COMMENT ON COLUMN ai_content_metrics.completion_rate IS 'Percentage of starters who finish (0.00 to 1.00)';
COMMENT ON COLUMN ai_content_metrics.avg_time_to_complete IS 'Average hours to complete';
COMMENT ON COLUMN ai_content_metrics.student_feedback_avg IS 'Average rating (0-5 stars)';
COMMENT ON COLUMN ai_content_metrics.teacher_override_count IS 'How often modified by admin';
