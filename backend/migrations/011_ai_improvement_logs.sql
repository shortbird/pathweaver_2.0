-- Migration 011: AI Improvement Logs Table
-- Tracks historical AI performance analysis and recommendations
-- Run this in Supabase SQL editor

-- ============================================================================
-- AI IMPROVEMENT LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_improvement_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Analysis parameters
    analysis_period_days INTEGER NOT NULL,

    -- Summary statistics
    total_prompts INTEGER NOT NULL,
    prompts_needing_optimization INTEGER NOT NULL,
    avg_performance_score DECIMAL(5,2) NOT NULL,

    -- Trend information
    trend_direction VARCHAR(20) NOT NULL, -- improving, declining, stable
    quality_change DECIMAL(5,2) NOT NULL,

    -- Best/worst prompt tracking
    best_prompt_version VARCHAR(50),
    best_prompt_score DECIMAL(5,2),
    worst_prompt_version VARCHAR(50),
    worst_prompt_score DECIMAL(5,2),

    -- Recommendations summary
    recommendations_count INTEGER NOT NULL DEFAULT 0,

    -- Full insights data (JSON)
    detailed_insights JSONB NOT NULL,

    -- Metadata
    updated_at TIMESTAMPTZ
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_improvement_logs_created_at
    ON ai_improvement_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_improvement_logs_trend
    ON ai_improvement_logs(trend_direction);

CREATE INDEX IF NOT EXISTS idx_ai_improvement_logs_performance
    ON ai_improvement_logs(avg_performance_score);

-- Add RLS policies
ALTER TABLE ai_improvement_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view improvement logs
CREATE POLICY "Admins can view improvement logs"
    ON ai_improvement_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Only system can insert logs (service role)
CREATE POLICY "Service role can insert improvement logs"
    ON ai_improvement_logs
    FOR INSERT
    WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get latest improvement insights
CREATE OR REPLACE FUNCTION get_latest_improvement_insights(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    created_at TIMESTAMPTZ,
    avg_performance_score DECIMAL,
    trend_direction VARCHAR,
    quality_change DECIMAL,
    prompts_needing_optimization INTEGER
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        created_at,
        avg_performance_score,
        trend_direction,
        quality_change,
        prompts_needing_optimization
    FROM ai_improvement_logs
    ORDER BY created_at DESC
    LIMIT limit_count;
$$;

-- Function to get performance trend over time
CREATE OR REPLACE FUNCTION get_performance_trend(days INTEGER DEFAULT 30)
RETURNS TABLE (
    date DATE,
    avg_score DECIMAL,
    trend VARCHAR
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        DATE(created_at) as date,
        AVG(avg_performance_score) as avg_score,
        MODE() WITHIN GROUP (ORDER BY trend_direction) as trend
    FROM ai_improvement_logs
    WHERE created_at >= NOW() - INTERVAL '1 day' * days
    GROUP BY DATE(created_at)
    ORDER BY date DESC;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE ai_improvement_logs IS 'Tracks historical AI performance analysis and improvement recommendations';
COMMENT ON COLUMN ai_improvement_logs.detailed_insights IS 'Full JSON of insights including all recommendations and metrics';
COMMENT ON COLUMN ai_improvement_logs.trend_direction IS 'Overall quality trend: improving, declining, or stable';
COMMENT ON COLUMN ai_improvement_logs.quality_change IS 'Change in quality score between analysis periods';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify table was created
SELECT
    'ai_improvement_logs' as table_name,
    COUNT(*) as row_count
FROM ai_improvement_logs;

-- Verify indexes were created
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'ai_improvement_logs';

-- Verify RLS policies
SELECT
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'ai_improvement_logs';
