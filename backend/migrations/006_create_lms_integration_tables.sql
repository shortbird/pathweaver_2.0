-- Migration: 006_create_lms_integration_tables.sql
-- Description: Create missing LMS integration tables for Canvas, Moodle, Google Classroom, Schoology, and Spark
-- Date: January 2025
-- Status: REQUIRED FOR ALL LMS INTEGRATIONS

-- ============================================
-- Table 1: lms_integrations
-- Purpose: Store user-LMS platform connections
-- ============================================

CREATE TABLE IF NOT EXISTS lms_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lms_platform VARCHAR(50) NOT NULL,  -- canvas, google_classroom, schoology, moodle, spark
    lms_user_id VARCHAR(255) NOT NULL,  -- LMS-specific user ID
    lms_course_id VARCHAR(255),         -- Optional course ID
    sync_enabled BOOLEAN DEFAULT true,
    sync_status VARCHAR(20) DEFAULT 'active',  -- active, paused, error
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT lms_integrations_unique_platform_user UNIQUE(lms_platform, lms_user_id),
    CONSTRAINT lms_integrations_valid_platform CHECK (lms_platform IN ('canvas', 'google_classroom', 'schoology', 'moodle', 'spark')),
    CONSTRAINT lms_integrations_valid_status CHECK (sync_status IN ('active', 'paused', 'error'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lms_integrations_user ON lms_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_lms_integrations_platform ON lms_integrations(lms_platform);
CREATE INDEX IF NOT EXISTS idx_lms_integrations_lms_user ON lms_integrations(lms_platform, lms_user_id);
CREATE INDEX IF NOT EXISTS idx_lms_integrations_sync_status ON lms_integrations(sync_status);

-- RLS policies (Row Level Security)
ALTER TABLE lms_integrations ENABLE ROW LEVEL SECURITY;

-- Users can view their own integrations
CREATE POLICY lms_integrations_select_own ON lms_integrations
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own integrations
CREATE POLICY lms_integrations_insert_own ON lms_integrations
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own integrations
CREATE POLICY lms_integrations_update_own ON lms_integrations
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own integrations
CREATE POLICY lms_integrations_delete_own ON lms_integrations
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- Table 2: lms_sessions
-- Purpose: Track SSO sessions from LMS platforms
-- ============================================

CREATE TABLE IF NOT EXISTS lms_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lms_platform VARCHAR(50) NOT NULL,
    session_token VARCHAR(500) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT lms_sessions_valid_platform CHECK (lms_platform IN ('canvas', 'google_classroom', 'schoology', 'moodle', 'spark'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lms_sessions_user ON lms_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_lms_sessions_token ON lms_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_lms_sessions_expires ON lms_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_lms_sessions_platform ON lms_sessions(lms_platform);

-- RLS policies
ALTER TABLE lms_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own sessions
CREATE POLICY lms_sessions_select_own ON lms_sessions
    FOR SELECT
    USING (auth.uid() = user_id);

-- ============================================
-- Table 3: lms_grade_sync
-- Purpose: Queue for syncing grades back to LMS gradebooks
-- ============================================

CREATE TABLE IF NOT EXISTS lms_grade_sync (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    lms_platform VARCHAR(50) NOT NULL,
    lms_assignment_id VARCHAR(255) NOT NULL,
    score NUMERIC(5,2) NOT NULL,
    max_score NUMERIC(5,2) DEFAULT 100,
    sync_status VARCHAR(20) DEFAULT 'pending',  -- pending, completed, failed
    sync_attempts INTEGER DEFAULT 0,
    error_message TEXT,
    synced_at TIMESTAMP WITH TIME ZONE,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT lms_grade_sync_valid_platform CHECK (lms_platform IN ('canvas', 'google_classroom', 'schoology', 'moodle', 'spark')),
    CONSTRAINT lms_grade_sync_valid_status CHECK (sync_status IN ('pending', 'completed', 'failed')),
    CONSTRAINT lms_grade_sync_valid_score CHECK (score >= 0 AND score <= max_score)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lms_grade_sync_user ON lms_grade_sync(user_id);
CREATE INDEX IF NOT EXISTS idx_lms_grade_sync_quest ON lms_grade_sync(quest_id);
CREATE INDEX IF NOT EXISTS idx_lms_grade_sync_status ON lms_grade_sync(sync_status);
CREATE INDEX IF NOT EXISTS idx_lms_grade_sync_platform ON lms_grade_sync(lms_platform);
CREATE INDEX IF NOT EXISTS idx_lms_grade_sync_pending ON lms_grade_sync(sync_status, created_at) WHERE sync_status = 'pending';

-- RLS policies
ALTER TABLE lms_grade_sync ENABLE ROW LEVEL SECURITY;

-- Users can view their own grade syncs
CREATE POLICY lms_grade_sync_select_own ON lms_grade_sync
    FOR SELECT
    USING (auth.uid() = user_id);

-- ============================================
-- Cleanup: Remove expired sessions (optional utility function)
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_expired_lms_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM lms_sessions
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Validation queries (run after migration)
-- ============================================

-- Check tables exist
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'lms_integrations');
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'lms_sessions');
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'lms_grade_sync');

-- Check indexes exist
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('lms_integrations', 'lms_sessions', 'lms_grade_sync');

-- Check RLS is enabled
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('lms_integrations', 'lms_sessions', 'lms_grade_sync');
