-- File: migrations/003_hard_delete_tables.sql
-- Purpose: Permanently delete deprecated tables
-- WARNING: Only run after 3-5 days of testing with soft delete
-- Date: January 2025

-- Only run after soft delete testing period
DROP TABLE IF EXISTS quest_collaborations_deprecated CASCADE;
DROP TABLE IF EXISTS task_collaborations_deprecated CASCADE;
DROP TABLE IF EXISTS quest_ratings_deprecated CASCADE;
DROP TABLE IF EXISTS subscription_tiers_deprecated CASCADE;
DROP TABLE IF EXISTS subscription_requests_deprecated CASCADE;
DROP TABLE IF EXISTS subscription_history_deprecated CASCADE;

-- Verify deletion
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'quest_collaborations',
    'task_collaborations',
    'quest_ratings',
    'subscription_tiers',
    'subscription_requests',
    'subscription_history',
    'quest_collaborations_deprecated',
    'task_collaborations_deprecated',
    'quest_ratings_deprecated',
    'subscription_tiers_deprecated',
    'subscription_requests_deprecated',
    'subscription_history_deprecated'
  );
-- Should return 0 rows
