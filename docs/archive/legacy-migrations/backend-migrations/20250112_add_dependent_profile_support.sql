-- Migration: Add Dependent Profile Support
-- Date: January 12, 2025
-- Purpose: Enable parents to create and manage dependent child profiles (ages 5-12)
-- COPPA Compliance: Dependents have no email/password

-- ============================================================
-- PHASE 1.1: Add Dependent Profile Columns to Users Table
-- ============================================================

-- Add dependent profile columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_dependent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS managed_by_parent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS promotion_eligible_at DATE;

-- Add indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_managed_by_parent
  ON users(managed_by_parent_id)
  WHERE managed_by_parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_is_dependent
  ON users(is_dependent)
  WHERE is_dependent = TRUE;

-- Add constraint: dependent accounts must have managed_by_parent_id
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS check_dependent_has_parent;

ALTER TABLE users
  ADD CONSTRAINT check_dependent_has_parent
  CHECK (
    (is_dependent = FALSE) OR
    (is_dependent = TRUE AND managed_by_parent_id IS NOT NULL)
  );

-- Add constraint: dependent accounts cannot have email (COPPA compliance)
-- Note: This is optional - some implementations allow email with parental consent
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS check_dependent_no_email;

ALTER TABLE users
  ADD CONSTRAINT check_dependent_no_email
  CHECK (
    (is_dependent = FALSE) OR
    (is_dependent = TRUE AND email IS NULL)
  );

-- ============================================================
-- PHASE 1.2: Add RLS Policies for Dependent Profiles
-- ============================================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS parent_view_dependents ON users;
DROP POLICY IF EXISTS parent_create_dependents ON users;
DROP POLICY IF EXISTS parent_update_dependents ON users;
DROP POLICY IF EXISTS parent_delete_dependents ON users;

-- Parents can view their dependent children
CREATE POLICY parent_view_dependents ON users
  FOR SELECT
  USING (
    managed_by_parent_id = auth.uid()
  );

-- Parents can insert dependent children
CREATE POLICY parent_create_dependents ON users
  FOR INSERT
  WITH CHECK (
    is_dependent = TRUE AND
    managed_by_parent_id = auth.uid()
  );

-- Parents can update their dependent children
CREATE POLICY parent_update_dependents ON users
  FOR UPDATE
  USING (managed_by_parent_id = auth.uid())
  WITH CHECK (managed_by_parent_id = auth.uid());

-- Parents can delete their dependent children
CREATE POLICY parent_delete_dependents ON users
  FOR DELETE
  USING (managed_by_parent_id = auth.uid());

-- ============================================================
-- PHASE 1.3: Create Database Helper Functions
-- ============================================================

-- Function: Calculate promotion eligibility date (13th birthday)
CREATE OR REPLACE FUNCTION calculate_promotion_eligible_date(dob DATE)
RETURNS DATE AS $$
BEGIN
  RETURN dob + INTERVAL '13 years';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Check if dependent is eligible for promotion to independent account
CREATE OR REPLACE FUNCTION is_promotion_eligible(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  eligible_date DATE;
BEGIN
  SELECT promotion_eligible_at INTO eligible_date
  FROM users
  WHERE id = user_id AND is_dependent = TRUE;

  RETURN eligible_date IS NOT NULL AND eligible_date <= CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Function: Get parent's dependents with metadata (active quests, XP, promotion status)
CREATE OR REPLACE FUNCTION get_parent_dependents(p_parent_id UUID)
RETURNS TABLE(
  dependent_id UUID,
  dependent_name VARCHAR,
  date_of_birth DATE,
  avatar_url TEXT,
  promotion_eligible BOOLEAN,
  total_xp INTEGER,
  active_quest_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.display_name,
    u.date_of_birth,
    u.avatar_url,
    (u.promotion_eligible_at IS NOT NULL AND u.promotion_eligible_at <= CURRENT_DATE) AS promotion_eligible,
    u.total_xp,
    COUNT(DISTINCT uq.quest_id)::INTEGER AS active_quest_count
  FROM users u
  LEFT JOIN user_quests uq ON u.id = uq.user_id AND uq.is_active = TRUE AND uq.completed_at IS NULL
  WHERE u.managed_by_parent_id = p_parent_id
    AND u.is_dependent = TRUE
  GROUP BY u.id, u.display_name, u.date_of_birth, u.avatar_url, u.promotion_eligible_at, u.total_xp
  ORDER BY u.date_of_birth DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Verification Queries (for manual testing)
-- ============================================================

-- Check that columns were added
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'users'
--   AND column_name IN ('is_dependent', 'managed_by_parent_id', 'promotion_eligible_at');

-- Check that indexes were created
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'users'
--   AND indexname IN ('idx_users_managed_by_parent', 'idx_users_is_dependent');

-- Check that functions were created
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name IN ('calculate_promotion_eligible_date', 'is_promotion_eligible', 'get_parent_dependents');