-- Migration: Update get_parent_dependents to include ai_features_enabled
-- Date: 2026-01-02
-- Purpose: Add AI features toggle visibility to parent dashboard

-- Must drop first since return type is changing
DROP FUNCTION IF EXISTS get_parent_dependents(UUID);

-- Recreate the function with new columns
CREATE OR REPLACE FUNCTION get_parent_dependents(p_parent_id UUID)
RETURNS TABLE(
  dependent_id UUID,
  dependent_name VARCHAR,
  date_of_birth DATE,
  avatar_url TEXT,
  promotion_eligible BOOLEAN,
  total_xp INTEGER,
  active_quest_count INTEGER,
  ai_features_enabled BOOLEAN,
  email VARCHAR(255)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.display_name,
    u.date_of_birth,
    u.avatar_url,
    is_promotion_eligible(u.id),
    COALESCE(u.total_xp, 0)::INTEGER,
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM user_quests uq
      WHERE uq.user_id = u.id AND uq.status = 'active'
    ), 0),
    COALESCE(u.ai_features_enabled, FALSE),
    u.email
  FROM users u
  WHERE u.managed_by_parent_id = p_parent_id
    AND u.is_dependent = TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_parent_dependents(UUID) IS 'Get parent dependents with AI features status and email for login status check';
