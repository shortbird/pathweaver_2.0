-- File: migrations/002_soft_delete_tables.sql
-- Purpose: Rename tables instead of dropping (safety net)
-- Date: January 2025

-- Rename tables instead of dropping (safety net)
ALTER TABLE IF EXISTS quest_collaborations
  RENAME TO quest_collaborations_deprecated;

ALTER TABLE IF EXISTS task_collaborations
  RENAME TO task_collaborations_deprecated;

ALTER TABLE IF EXISTS quest_ratings
  RENAME TO quest_ratings_deprecated;

ALTER TABLE IF EXISTS subscription_tiers
  RENAME TO subscription_tiers_deprecated;

ALTER TABLE IF EXISTS subscription_requests
  RENAME TO subscription_requests_deprecated;

ALTER TABLE IF EXISTS subscription_history
  RENAME TO subscription_history_deprecated;

-- Verify tables renamed
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%_deprecated'
ORDER BY table_name;

-- Expected result: 6 tables with _deprecated suffix
