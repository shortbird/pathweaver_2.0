-- Migration: Add Granular AI Access Controls
-- Date: 2026-01-02
-- Description: Adds granular AI feature toggles for chatbot, lesson helper, and task generation
-- Depends on: 20260102_add_ai_access_controls.sql (master toggle)

-- ============================================================================
-- USER LEVEL GRANULAR AI CONTROLS (for dependents)
-- ============================================================================

-- AI Chatbot enabled (AI tutor conversations)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_chatbot_enabled BOOLEAN DEFAULT TRUE;

-- AI Lesson Helper enabled (contextual help within lessons)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_lesson_helper_enabled BOOLEAN DEFAULT TRUE;

-- AI Task Generation enabled (suggestions, recommendations)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_task_generation_enabled BOOLEAN DEFAULT TRUE;

-- Add comments for documentation
COMMENT ON COLUMN users.ai_chatbot_enabled IS 'Whether AI chatbot/tutor feature is enabled. Only applies if ai_features_enabled is TRUE.';
COMMENT ON COLUMN users.ai_lesson_helper_enabled IS 'Whether AI lesson helper feature is enabled. Only applies if ai_features_enabled is TRUE.';
COMMENT ON COLUMN users.ai_task_generation_enabled IS 'Whether AI task generation/suggestions feature is enabled. Only applies if ai_features_enabled is TRUE.';

-- ============================================================================
-- ORGANIZATION LEVEL GRANULAR AI CONTROLS
-- ============================================================================

-- AI Chatbot enabled (sets ceiling for org)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_chatbot_enabled BOOLEAN DEFAULT TRUE;

-- AI Lesson Helper enabled (sets ceiling for org)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_lesson_helper_enabled BOOLEAN DEFAULT TRUE;

-- AI Task Generation enabled (sets ceiling for org)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_task_generation_enabled BOOLEAN DEFAULT TRUE;

-- Add comments for documentation
COMMENT ON COLUMN organizations.ai_chatbot_enabled IS 'Whether AI chatbot is enabled for org. Sets ceiling - parents cannot enable if org disables.';
COMMENT ON COLUMN organizations.ai_lesson_helper_enabled IS 'Whether AI lesson helper is enabled for org. Sets ceiling - parents cannot enable if org disables.';
COMMENT ON COLUMN organizations.ai_task_generation_enabled IS 'Whether AI task generation is enabled for org. Sets ceiling - parents cannot enable if org disables.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
    -- Check users table columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'ai_chatbot_enabled') THEN
        RAISE EXCEPTION 'Column users.ai_chatbot_enabled was not created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'ai_lesson_helper_enabled') THEN
        RAISE EXCEPTION 'Column users.ai_lesson_helper_enabled was not created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'ai_task_generation_enabled') THEN
        RAISE EXCEPTION 'Column users.ai_task_generation_enabled was not created';
    END IF;

    -- Check organizations table columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'organizations' AND column_name = 'ai_chatbot_enabled') THEN
        RAISE EXCEPTION 'Column organizations.ai_chatbot_enabled was not created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'organizations' AND column_name = 'ai_lesson_helper_enabled') THEN
        RAISE EXCEPTION 'Column organizations.ai_lesson_helper_enabled was not created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'organizations' AND column_name = 'ai_task_generation_enabled') THEN
        RAISE EXCEPTION 'Column organizations.ai_task_generation_enabled was not created';
    END IF;

    RAISE NOTICE 'Granular AI control columns created successfully';
END $$;
