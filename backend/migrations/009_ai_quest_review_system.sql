-- AI Quest Review System Migration
-- Creates tables for managing AI-generated quest review workflow and performance tracking

-- ============================================
-- AI Quest Review Queue Table
-- ============================================
-- Stores AI-generated quests awaiting admin review
CREATE TABLE IF NOT EXISTS ai_quest_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Quest data (full AI-generated structure before database creation)
    quest_data JSONB NOT NULL,

    -- AI Quality Assessment
    quality_score DECIMAL(3, 2) CHECK (quality_score >= 0 AND quality_score <= 10),
    ai_feedback JSONB, -- {strengths: [], weaknesses: [], improvements: [], missing_elements: []}

    -- Review Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'edited')),

    -- Review Details
    reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    review_notes TEXT,
    was_edited BOOLEAN DEFAULT FALSE,

    -- Resulting Quest (if approved)
    created_quest_id UUID REFERENCES quests(id) ON DELETE SET NULL,

    -- Timestamps
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,

    -- Metadata
    generation_source VARCHAR(50) DEFAULT 'manual' CHECK (generation_source IN ('manual', 'batch', 'student_idea', 'badge_aligned')),
    badge_id UUID REFERENCES badges(id) ON DELETE SET NULL, -- If generated for specific badge

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_quest_review_queue_status ON ai_quest_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_ai_quest_review_queue_submitted_at ON ai_quest_review_queue(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_quest_review_queue_reviewer ON ai_quest_review_queue(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_ai_quest_review_queue_quality ON ai_quest_review_queue(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_quest_review_queue_badge ON ai_quest_review_queue(badge_id) WHERE badge_id IS NOT NULL;

-- RLS Policies
ALTER TABLE ai_quest_review_queue ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage all review queue items
CREATE POLICY admin_all_access ON ai_quest_review_queue
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- ============================================
-- AI Generation Metrics Table
-- ============================================
-- Tracks detailed metrics for each AI generation attempt
CREATE TABLE IF NOT EXISTS ai_generation_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to review queue item
    review_queue_id UUID REFERENCES ai_quest_review_queue(id) ON DELETE CASCADE,

    -- Link to final quest (if approved)
    quest_id UUID REFERENCES quests(id) ON DELETE SET NULL,

    -- Generation Details
    generation_source VARCHAR(50) NOT NULL CHECK (generation_source IN ('manual', 'batch', 'student_idea', 'badge_aligned')),
    prompt_version VARCHAR(50), -- For A/B testing different prompts

    -- AI Model Performance
    model_name VARCHAR(100),
    time_to_generate_ms INTEGER,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,

    -- Quality Metrics
    quality_score DECIMAL(3, 2),

    -- Review Outcome
    approved BOOLEAN,
    rejection_reason TEXT,

    -- Performance Tracking (populated after quest is live)
    completion_rate DECIMAL(5, 4), -- Updated periodically
    average_rating DECIMAL(3, 2), -- Updated periodically
    engagement_score DECIMAL(5, 4), -- Updated periodically

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_performance_update TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_generation_metrics_review_queue ON ai_generation_metrics(review_queue_id);
CREATE INDEX IF NOT EXISTS idx_ai_generation_metrics_quest ON ai_generation_metrics(quest_id) WHERE quest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_generation_metrics_source ON ai_generation_metrics(generation_source);
CREATE INDEX IF NOT EXISTS idx_ai_generation_metrics_approved ON ai_generation_metrics(approved) WHERE approved IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_generation_metrics_prompt_version ON ai_generation_metrics(prompt_version) WHERE prompt_version IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_generation_metrics_created ON ai_generation_metrics(created_at DESC);

-- RLS Policies
ALTER TABLE ai_generation_metrics ENABLE ROW LEVEL SECURITY;

-- Admins can view all metrics
CREATE POLICY admin_view_metrics ON ai_generation_metrics
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- ============================================
-- AI Prompt Versions Table
-- ============================================
-- Tracks different versions of AI prompts for A/B testing
CREATE TABLE IF NOT EXISTS ai_prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Version Info
    version_name VARCHAR(50) NOT NULL UNIQUE,
    prompt_type VARCHAR(50) NOT NULL CHECK (prompt_type IN ('quest_generation', 'task_generation', 'description_enhancement', 'quality_validation')),

    -- Prompt Content
    system_prompt TEXT,
    user_prompt_template TEXT NOT NULL,

    -- Status
    is_active BOOLEAN DEFAULT FALSE,

    -- Performance Metrics (aggregated)
    avg_quality_score DECIMAL(3, 2),
    approval_rate DECIMAL(5, 4),
    avg_completion_rate DECIMAL(5, 4),
    avg_student_rating DECIMAL(3, 2),
    total_generations INTEGER DEFAULT 0,

    -- Metadata
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ,
    deactivated_at TIMESTAMPTZ,
    last_metrics_update TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_type ON ai_prompt_versions(prompt_type);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_active ON ai_prompt_versions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_performance ON ai_prompt_versions(avg_quality_score DESC, approval_rate DESC);

-- RLS Policies
ALTER TABLE ai_prompt_versions ENABLE ROW LEVEL SECURITY;

-- Admins can manage prompt versions
CREATE POLICY admin_manage_prompts ON ai_prompt_versions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- ============================================
-- Update Triggers
-- ============================================

-- Auto-update updated_at on ai_quest_review_queue
CREATE OR REPLACE FUNCTION update_ai_quest_review_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_quest_review_queue_updated_at
    BEFORE UPDATE ON ai_quest_review_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_quest_review_queue_updated_at();

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get review queue statistics
CREATE OR REPLACE FUNCTION get_ai_review_queue_stats()
RETURNS TABLE (
    pending_count BIGINT,
    approved_count BIGINT,
    rejected_count BIGINT,
    avg_quality_score NUMERIC,
    avg_review_time_hours NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE status = 'pending_review') as pending_count,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
        AVG(quality_score) as avg_quality_score,
        AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at)) / 3600) FILTER (WHERE reviewed_at IS NOT NULL) as avg_review_time_hours
    FROM ai_quest_review_queue;
END;
$$ LANGUAGE plpgsql;

-- Function to update generation metrics from quest performance
CREATE OR REPLACE FUNCTION update_ai_generation_performance_metrics()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER := 0;
BEGIN
    -- Update metrics for approved quests that have performance data
    UPDATE ai_generation_metrics m
    SET
        completion_rate = perf.completion_rate,
        average_rating = perf.avg_rating,
        engagement_score = perf.engagement_score,
        last_performance_update = NOW()
    FROM (
        SELECT
            q.id as quest_id,
            COALESCE(
                COUNT(uq.completed_at)::DECIMAL / NULLIF(COUNT(uq.quest_id), 0),
                0
            ) as completion_rate,
            AVG(r.rating) as avg_rating,
            COALESCE(
                COUNT(tc.id)::DECIMAL / NULLIF(COUNT(uq.quest_id), 0) / NULLIF(
                    (SELECT COUNT(*) FROM quest_tasks WHERE quest_id = q.id),
                    0
                ),
                0
            ) as engagement_score
        FROM quests q
        LEFT JOIN user_quests uq ON uq.quest_id = q.id
        LEFT JOIN quest_ratings r ON r.quest_id = q.id
        LEFT JOIN quest_task_completions tc ON tc.quest_id = q.id
        WHERE q.source = 'ai_generated' OR q.source = 'custom'
        GROUP BY q.id
    ) perf
    WHERE m.quest_id = perf.quest_id
    AND m.approved = TRUE;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON TABLE ai_quest_review_queue IS 'Stores AI-generated quests awaiting admin review before publication';
COMMENT ON TABLE ai_generation_metrics IS 'Tracks performance metrics and A/B testing data for AI-generated content';
COMMENT ON TABLE ai_prompt_versions IS 'Version control and A/B testing for AI generation prompts';
COMMENT ON FUNCTION get_ai_review_queue_stats() IS 'Returns summary statistics for the AI review queue';
COMMENT ON FUNCTION update_ai_generation_performance_metrics() IS 'Updates performance metrics for AI-generated quests based on actual usage data';
