-- Migration: Add AI Access Controls
-- Date: 2026-01-02
-- Description: Adds AI feature access controls at user level (for dependents) and organization level
-- COPPA Compliance: Parents can control AI feature access for their children
-- Organization Control: Org admins can enable/disable AI features for their organization

-- ============================================================================
-- USER LEVEL AI CONTROLS (for dependents)
-- ============================================================================

-- Add AI features enabled flag to users table
-- Default is FALSE - parent must explicitly enable for dependent children
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_features_enabled BOOLEAN DEFAULT FALSE;

-- Track when AI features were enabled
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_features_enabled_at TIMESTAMPTZ;

-- Track who enabled AI features (parent user ID)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_features_enabled_by UUID REFERENCES users(id);

-- Add comment for documentation
COMMENT ON COLUMN users.ai_features_enabled IS 'Whether AI features (tutor, suggestions) are enabled for this user. For dependents, parent must enable.';
COMMENT ON COLUMN users.ai_features_enabled_at IS 'Timestamp when AI features were enabled/disabled';
COMMENT ON COLUMN users.ai_features_enabled_by IS 'User ID of parent who enabled AI features for this dependent';

-- ============================================================================
-- GRANULAR USER LEVEL AI CONTROLS
-- ============================================================================

-- Individual AI feature toggles for users (dependents)
-- These only apply when ai_features_enabled = TRUE
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_chatbot_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_lesson_helper_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_task_generation_enabled BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN users.ai_chatbot_enabled IS 'Whether AI Tutor chatbot is enabled for this user';
COMMENT ON COLUMN users.ai_lesson_helper_enabled IS 'Whether Lesson Helper AI is enabled for this user';
COMMENT ON COLUMN users.ai_task_generation_enabled IS 'Whether AI task generation/suggestions are enabled for this user';

-- ============================================================================
-- ORGANIZATION LEVEL AI CONTROLS
-- ============================================================================

-- Add AI features enabled flag to organizations table
-- Default is TRUE - orgs have AI enabled by default, can opt out
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_features_enabled BOOLEAN DEFAULT TRUE;

-- Granular organization-level AI controls
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_chatbot_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_lesson_helper_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_task_generation_enabled BOOLEAN DEFAULT TRUE;

-- Add comment for documentation
COMMENT ON COLUMN organizations.ai_features_enabled IS 'Whether AI features are enabled for all users in this organization. Org admin can toggle.';
COMMENT ON COLUMN organizations.ai_chatbot_enabled IS 'Whether AI Tutor chatbot is enabled org-wide';
COMMENT ON COLUMN organizations.ai_lesson_helper_enabled IS 'Whether Lesson Helper AI is enabled org-wide';
COMMENT ON COLUMN organizations.ai_task_generation_enabled IS 'Whether AI task generation is enabled org-wide';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for quick lookup of dependents with AI enabled
CREATE INDEX IF NOT EXISTS idx_users_ai_features_enabled
ON users(ai_features_enabled)
WHERE is_dependent = TRUE;

-- Index for org AI feature lookup
CREATE INDEX IF NOT EXISTS idx_organizations_ai_features_enabled
ON organizations(ai_features_enabled);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify columns were added
DO $$
BEGIN
    -- Check users table columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'ai_features_enabled') THEN
        RAISE EXCEPTION 'Column users.ai_features_enabled was not created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'organizations' AND column_name = 'ai_features_enabled') THEN
        RAISE EXCEPTION 'Column organizations.ai_features_enabled was not created';
    END IF;

    RAISE NOTICE 'AI access control columns created successfully';
END $$;
