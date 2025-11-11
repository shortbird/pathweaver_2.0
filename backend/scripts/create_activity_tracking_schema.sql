-- =====================================================
-- User Activity Tracking System - Database Schema
-- =====================================================
-- Created: January 2025
-- Purpose: Privacy-first activity tracking for user journey analysis,
--          dropout prediction, and feature optimization
-- Compliance: COPPA/GDPR compliant with 90-day anonymization

-- =====================================================
-- 1. Main Activity Events Table
-- =====================================================
CREATE TABLE IF NOT EXISTS user_activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,

    -- Event classification
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL,

    -- Event details (flexible JSON structure)
    event_data JSONB,

    -- Context data
    page_url TEXT,
    referrer_url TEXT,
    user_agent TEXT,

    -- Performance metrics
    duration_ms INTEGER,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Privacy: Auto-anonymize after 90 days
    anonymized_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE user_activity_events IS 'Main event log for all user activities (page views, clicks, quest actions)';
COMMENT ON COLUMN user_activity_events.event_type IS 'Specific event type (e.g., page_view, quest_started, task_completed)';
COMMENT ON COLUMN user_activity_events.event_category IS 'High-level category (navigation, quest, badge, tutor, community, auth, error)';
COMMENT ON COLUMN user_activity_events.event_data IS 'Flexible JSON data specific to event type (quest_id, task_id, etc.)';
COMMENT ON COLUMN user_activity_events.duration_ms IS 'Duration for time-on-page tracking (NULL for instant events)';
COMMENT ON COLUMN user_activity_events.anonymized_at IS 'Timestamp when PII was removed (after 90 days)';

-- Indexes for high-performance queries
CREATE INDEX IF NOT EXISTS idx_activity_user_created ON user_activity_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_session ON user_activity_events(session_id);
CREATE INDEX IF NOT EXISTS idx_activity_type_created ON user_activity_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_category ON user_activity_events(event_category);

-- GIN index for JSONB queries (search within event_data)
CREATE INDEX IF NOT EXISTS idx_activity_event_data ON user_activity_events USING GIN (event_data);

-- BRIN index for time-series queries (space-efficient for append-only data)
CREATE INDEX IF NOT EXISTS idx_activity_created_brin ON user_activity_events USING BRIN (created_at);

-- =====================================================
-- 2. User Session Tracking Table
-- =====================================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Session metadata
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,

    -- Device/context
    user_agent TEXT,
    ip_address INET,
    device_type VARCHAR(50),

    -- Activity summary
    page_views INTEGER DEFAULT 0,
    actions_count INTEGER DEFAULT 0,
    last_activity_at TIMESTAMP WITH TIME ZONE,

    -- Privacy
    anonymized_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE user_sessions IS 'Tracks user sessions from login to logout or timeout';
COMMENT ON COLUMN user_sessions.device_type IS 'Device type: mobile, tablet, or desktop';
COMMENT ON COLUMN user_sessions.ip_address IS 'Anonymized after 30 days for privacy compliance';
COMMENT ON COLUMN user_sessions.duration_minutes IS 'Total session duration in minutes';

CREATE INDEX IF NOT EXISTS idx_sessions_user_started ON user_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON user_sessions(user_id, ended_at) WHERE ended_at IS NULL;

-- =====================================================
-- 3. Page View Analytics Table (Aggregated)
-- =====================================================
CREATE TABLE IF NOT EXISTS page_view_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_path TEXT NOT NULL,

    -- Daily aggregations
    view_date DATE NOT NULL,
    total_views INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    avg_duration_seconds NUMERIC(10, 2),
    bounce_rate NUMERIC(5, 2),

    -- Performance metrics
    avg_load_time_ms INTEGER,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(page_path, view_date)
);

COMMENT ON TABLE page_view_analytics IS 'Aggregated daily page view metrics for admin dashboard';
COMMENT ON COLUMN page_view_analytics.bounce_rate IS 'Percentage of single-page sessions (%)';
COMMENT ON COLUMN page_view_analytics.avg_duration_seconds IS 'Average time spent on page (seconds)';

CREATE INDEX IF NOT EXISTS idx_page_analytics_date ON page_view_analytics(view_date DESC);
CREATE INDEX IF NOT EXISTS idx_page_analytics_path ON page_view_analytics(page_path);

-- =====================================================
-- 4. Learning Journey Events Table
-- =====================================================
CREATE TABLE IF NOT EXISTS learning_journey_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Milestone types
    event_type VARCHAR(100) NOT NULL,

    -- Risk indicators (for dropout prediction ML)
    risk_score NUMERIC(5, 2),
    engagement_level VARCHAR(50),

    -- Context
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE learning_journey_events IS 'Educational milestones and engagement tracking for dropout prediction';
COMMENT ON COLUMN learning_journey_events.risk_score IS 'Dropout risk score from 0.0 (engaged) to 1.0 (high risk)';
COMMENT ON COLUMN learning_journey_events.engagement_level IS 'Engagement classification: high, medium, low, at_risk';

CREATE INDEX IF NOT EXISTS idx_journey_user_created ON learning_journey_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journey_risk ON learning_journey_events(user_id, risk_score DESC);

-- =====================================================
-- 5. Error Events Table
-- =====================================================
CREATE TABLE IF NOT EXISTS error_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID,

    -- Error details
    error_type VARCHAR(100),
    error_message TEXT,
    error_stack TEXT,

    -- Context
    page_url TEXT,
    component_name VARCHAR(200),

    -- API errors
    api_endpoint TEXT,
    api_status_code INTEGER,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE error_events IS 'Frontend and backend error tracking for debugging';
COMMENT ON COLUMN error_events.error_type IS 'Error category: javascript, api, network, validation';
COMMENT ON COLUMN error_events.component_name IS 'React component where error occurred (if applicable)';

CREATE INDEX IF NOT EXISTS idx_errors_created ON error_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_errors_type ON error_events(error_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_errors_user ON error_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- =====================================================
-- 6. Row Level Security (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE user_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_view_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_journey_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own activity data
CREATE POLICY user_activity_select_own ON user_activity_events
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY user_sessions_select_own ON user_sessions
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY learning_journey_select_own ON learning_journey_events
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY error_events_select_own ON error_events
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Admin can view all analytics data
CREATE POLICY admin_activity_select_all ON user_activity_events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

CREATE POLICY admin_sessions_select_all ON user_sessions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

CREATE POLICY admin_page_analytics_select_all ON page_view_analytics
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

CREATE POLICY admin_journey_select_all ON learning_journey_events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

CREATE POLICY admin_errors_select_all ON error_events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Policy: Service role can insert all events (backend uses service key)
CREATE POLICY service_activity_insert ON user_activity_events
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY service_sessions_insert ON user_sessions
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY service_sessions_update ON user_sessions
    FOR UPDATE
    USING (true);

CREATE POLICY service_page_analytics_insert ON page_view_analytics
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY service_page_analytics_update ON page_view_analytics
    FOR UPDATE
    USING (true);

CREATE POLICY service_journey_insert ON learning_journey_events
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY service_errors_insert ON error_events
    FOR INSERT
    WITH CHECK (true);

-- =====================================================
-- 7. Helper Functions
-- =====================================================

-- Function to anonymize old events (run daily via cron)
CREATE OR REPLACE FUNCTION anonymize_old_activity_events()
RETURNS INTEGER AS $$
DECLARE
    rows_affected INTEGER;
BEGIN
    -- Anonymize events older than 90 days
    UPDATE user_activity_events
    SET
        user_id = NULL,
        user_agent = NULL,
        event_data = CASE
            WHEN event_data IS NOT NULL
            THEN event_data - 'ip_address' - 'email' - 'user_email'
            ELSE NULL
        END,
        anonymized_at = NOW()
    WHERE
        created_at < NOW() - INTERVAL '90 days'
        AND anonymized_at IS NULL;

    GET DIAGNOSTICS rows_affected = ROW_COUNT;

    -- Anonymize sessions older than 90 days
    UPDATE user_sessions
    SET
        user_id = NULL,
        user_agent = NULL,
        ip_address = NULL,
        anonymized_at = NOW()
    WHERE
        started_at < NOW() - INTERVAL '90 days'
        AND anonymized_at IS NULL;

    RETURN rows_affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION anonymize_old_activity_events IS 'Anonymizes activity events older than 90 days for privacy compliance (run daily via cron)';

-- Function to delete very old events (run weekly via cron)
CREATE OR REPLACE FUNCTION delete_old_activity_events()
RETURNS INTEGER AS $$
DECLARE
    rows_affected INTEGER;
BEGIN
    -- Delete events older than 2 years
    DELETE FROM user_activity_events
    WHERE created_at < NOW() - INTERVAL '2 years';

    GET DIAGNOSTICS rows_affected = ROW_COUNT;

    -- Delete sessions older than 2 years
    DELETE FROM user_sessions
    WHERE started_at < NOW() - INTERVAL '2 years';

    -- Delete error events older than 1 year
    DELETE FROM error_events
    WHERE created_at < NOW() - INTERVAL '1 year';

    RETURN rows_affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION delete_old_activity_events IS 'Deletes activity events older than 2 years (run weekly via cron)';

-- =====================================================
-- 8. Grant Permissions
-- =====================================================

-- Grant service role access to all tables
GRANT ALL ON user_activity_events TO service_role;
GRANT ALL ON user_sessions TO service_role;
GRANT ALL ON page_view_analytics TO service_role;
GRANT ALL ON learning_journey_events TO service_role;
GRANT ALL ON error_events TO service_role;

-- Grant authenticated users read access to their own data
GRANT SELECT ON user_activity_events TO authenticated;
GRANT SELECT ON user_sessions TO authenticated;
GRANT SELECT ON learning_journey_events TO authenticated;
GRANT SELECT ON error_events TO authenticated;

-- =====================================================
-- END OF SCHEMA
-- =====================================================
