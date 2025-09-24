-- Migration: Create AI Tutor schema
-- Creates tables for tutor conversations, messages, settings, and safety monitoring

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for conversation modes
DO $$ BEGIN
    CREATE TYPE conversation_mode AS ENUM (
        'study_buddy',
        'teacher',
        'discovery',
        'review',
        'creative'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create enum for safety levels
DO $$ BEGIN
    CREATE TYPE safety_level AS ENUM (
        'safe',
        'warning',
        'blocked',
        'requires_review'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create enum for message roles
DO $$ BEGIN
    CREATE TYPE message_role AS ENUM (
        'user',
        'assistant',
        'system'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Tutor conversations table
-- Stores conversation sessions between users and AI tutor
CREATE TABLE IF NOT EXISTS tutor_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    conversation_mode conversation_mode DEFAULT 'study_buddy',
    quest_id UUID REFERENCES quests(id) ON DELETE SET NULL,
    task_id UUID REFERENCES quest_tasks(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tutor messages table
-- Stores individual messages within conversations
CREATE TABLE IF NOT EXISTS tutor_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES tutor_conversations(id) ON DELETE CASCADE,
    role message_role NOT NULL,
    content TEXT NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    safety_level safety_level DEFAULT 'safe',
    safety_reasons TEXT[],
    flagged_terms TEXT[],
    context_data JSONB, -- Stores additional context like quest info, user state
    xp_bonus_awarded BOOLEAN DEFAULT FALSE,
    parent_notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tutor settings table
-- User-specific tutor preferences and settings
CREATE TABLE IF NOT EXISTS tutor_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    preferred_mode conversation_mode DEFAULT 'study_buddy',
    daily_message_limit INTEGER DEFAULT 50,
    messages_used_today INTEGER DEFAULT 0,
    last_reset_date DATE DEFAULT CURRENT_DATE,
    parent_monitoring_enabled BOOLEAN DEFAULT TRUE,
    notification_preferences JSONB DEFAULT '{}',
    age_verification INTEGER, -- For age-appropriate content
    learning_style VARCHAR(50), -- visual, auditory, kinesthetic, mixed
    topic_restrictions TEXT[], -- Topics to avoid or restrict
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Safety reports table
-- Logs safety incidents and blocked content
CREATE TABLE IF NOT EXISTS tutor_safety_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES tutor_conversations(id) ON DELETE SET NULL,
    message_id UUID REFERENCES tutor_messages(id) ON DELETE SET NULL,
    incident_type VARCHAR(50) NOT NULL, -- blocked_content, personal_info, off_topic, etc.
    safety_level safety_level NOT NULL,
    original_message TEXT NOT NULL,
    flagged_terms TEXT[],
    safety_reasons TEXT[],
    confidence_score DECIMAL(3,2),
    admin_reviewed BOOLEAN DEFAULT FALSE,
    admin_notes TEXT,
    parent_notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Parent access table
-- Tracks parent access to children's tutor conversations
CREATE TABLE IF NOT EXISTS tutor_parent_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    child_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    access_level VARCHAR(20) DEFAULT 'full', -- full, summary, notification_only
    notification_frequency VARCHAR(20) DEFAULT 'daily', -- real_time, daily, weekly
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(parent_user_id, child_user_id)
);

-- Tutor analytics table
-- Tracks usage patterns and learning insights
CREATE TABLE IF NOT EXISTS tutor_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    messages_sent INTEGER DEFAULT 0,
    topics_discussed TEXT[],
    learning_pillars_covered TEXT[],
    average_session_length INTEGER, -- in minutes
    xp_bonuses_earned INTEGER DEFAULT 0,
    safety_flags INTEGER DEFAULT 0,
    engagement_score DECIMAL(3,2), -- 0.00 to 1.00
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tutor_conversations_user_id ON tutor_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_tutor_conversations_active ON tutor_conversations(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_tutor_conversations_quest ON tutor_conversations(quest_id) WHERE quest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tutor_messages_conversation_id ON tutor_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tutor_messages_created_at ON tutor_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_tutor_messages_safety_level ON tutor_messages(safety_level);

CREATE INDEX IF NOT EXISTS idx_tutor_settings_user_id ON tutor_settings(user_id);

CREATE INDEX IF NOT EXISTS idx_tutor_safety_reports_user_id ON tutor_safety_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_tutor_safety_reports_created_at ON tutor_safety_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_tutor_safety_reports_admin_reviewed ON tutor_safety_reports(admin_reviewed) WHERE admin_reviewed = FALSE;

CREATE INDEX IF NOT EXISTS idx_tutor_parent_access_parent ON tutor_parent_access(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_tutor_parent_access_child ON tutor_parent_access(child_user_id);

CREATE INDEX IF NOT EXISTS idx_tutor_analytics_user_date ON tutor_analytics(user_id, date);
CREATE INDEX IF NOT EXISTS idx_tutor_analytics_date ON tutor_analytics(date);

-- Create function to update message count in conversations
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tutor_conversations
        SET message_count = message_count + 1,
            last_message_at = NEW.created_at,
            updated_at = NOW()
        WHERE id = NEW.conversation_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update conversation stats
DROP TRIGGER IF EXISTS trigger_update_conversation_stats ON tutor_messages;
CREATE TRIGGER trigger_update_conversation_stats
    AFTER INSERT ON tutor_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_stats();

-- Create function to reset daily message limits
CREATE OR REPLACE FUNCTION reset_daily_message_limits()
RETURNS INTEGER AS $$
DECLARE
    reset_count INTEGER;
BEGIN
    UPDATE tutor_settings
    SET messages_used_today = 0,
        last_reset_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE last_reset_date < CURRENT_DATE;

    GET DIAGNOSTICS reset_count = ROW_COUNT;
    RETURN reset_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to check daily message limit
CREATE OR REPLACE FUNCTION check_daily_message_limit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_settings RECORD;
BEGIN
    SELECT * INTO user_settings
    FROM tutor_settings
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        -- Create default settings if none exist
        INSERT INTO tutor_settings (user_id) VALUES (p_user_id);
        RETURN TRUE;
    END IF;

    -- Reset counter if it's a new day
    IF user_settings.last_reset_date < CURRENT_DATE THEN
        UPDATE tutor_settings
        SET messages_used_today = 0,
            last_reset_date = CURRENT_DATE
        WHERE user_id = p_user_id;
        RETURN TRUE;
    END IF;

    -- Check if under limit
    RETURN user_settings.messages_used_today < user_settings.daily_message_limit;
END;
$$ LANGUAGE plpgsql;

-- Create function to increment message usage
CREATE OR REPLACE FUNCTION increment_message_usage(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO tutor_settings (user_id, messages_used_today, last_reset_date)
    VALUES (p_user_id, 1, CURRENT_DATE)
    ON CONFLICT (user_id)
    DO UPDATE SET
        messages_used_today = tutor_settings.messages_used_today + 1,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Create RLS policies for data security
ALTER TABLE tutor_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_safety_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_parent_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_analytics ENABLE ROW LEVEL SECURITY;

-- Policies for tutor_conversations
CREATE POLICY "Users can view own conversations" ON tutor_conversations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own conversations" ON tutor_conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations" ON tutor_conversations
    FOR UPDATE USING (auth.uid() = user_id);

-- Policies for tutor_messages
CREATE POLICY "Users can view own messages" ON tutor_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tutor_conversations
            WHERE id = conversation_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create messages in own conversations" ON tutor_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM tutor_conversations
            WHERE id = conversation_id AND user_id = auth.uid()
        )
    );

-- Policies for tutor_settings
CREATE POLICY "Users can view own settings" ON tutor_settings
    FOR ALL USING (auth.uid() = user_id);

-- Policies for tutor_safety_reports (admin and users can view their own)
CREATE POLICY "Users can view own safety reports" ON tutor_safety_reports
    FOR SELECT USING (auth.uid() = user_id);

-- Policies for tutor_parent_access
CREATE POLICY "Parents can view own access records" ON tutor_parent_access
    FOR ALL USING (auth.uid() = parent_user_id);

-- Policies for tutor_analytics
CREATE POLICY "Users can view own analytics" ON tutor_analytics
    FOR SELECT USING (auth.uid() = user_id);

-- Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE ON tutor_conversations TO authenticated;
GRANT SELECT, INSERT ON tutor_messages TO authenticated;
GRANT ALL ON tutor_settings TO authenticated;
GRANT SELECT, INSERT ON tutor_safety_reports TO authenticated;
GRANT ALL ON tutor_parent_access TO authenticated;
GRANT SELECT ON tutor_analytics TO authenticated;

-- Insert default subscription tier limits
-- This will be used by the application to enforce tier-based message limits
CREATE TABLE IF NOT EXISTS tutor_tier_limits (
    tier VARCHAR(20) PRIMARY KEY,
    daily_message_limit INTEGER NOT NULL,
    features TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO tutor_tier_limits (tier, daily_message_limit, features) VALUES
    ('free', 10, ARRAY['basic_explanations', 'simple_chat']),
    ('explorer', 10, ARRAY['basic_explanations', 'simple_chat']),
    ('supported', 50, ARRAY['basic_explanations', 'advanced_features', 'quest_integration', 'learning_analytics']),
    ('creator', 50, ARRAY['basic_explanations', 'advanced_features', 'quest_integration', 'learning_analytics']),
    ('academy', 999, ARRAY['unlimited_chat', 'all_features', 'priority_support', 'advanced_analytics']),
    ('visionary', 999, ARRAY['unlimited_chat', 'all_features', 'priority_support', 'advanced_analytics']),
    ('enterprise', 999, ARRAY['unlimited_chat', 'all_features', 'priority_support', 'advanced_analytics'])
ON CONFLICT (tier) DO UPDATE SET
    daily_message_limit = EXCLUDED.daily_message_limit,
    features = EXCLUDED.features;

COMMENT ON TABLE tutor_conversations IS 'Stores AI tutor conversation sessions';
COMMENT ON TABLE tutor_messages IS 'Stores individual messages within tutor conversations';
COMMENT ON TABLE tutor_settings IS 'User-specific tutor preferences and settings';
COMMENT ON TABLE tutor_safety_reports IS 'Logs safety incidents and blocked content for admin review';
COMMENT ON TABLE tutor_parent_access IS 'Manages parent access to children tutor conversations';
COMMENT ON TABLE tutor_analytics IS 'Tracks usage patterns and learning insights';
COMMENT ON TABLE tutor_tier_limits IS 'Defines message limits and features by subscription tier';