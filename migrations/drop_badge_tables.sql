-- Migration: Drop Badge Tables
-- Date: 2026-01-01
-- Description: Remove all badge-related tables as part of badge feature removal
--
-- IMPORTANT: This migration should be executed manually via Supabase Dashboard
-- or with appropriate database admin credentials
--
-- Tables to be dropped:
-- - user_badges: User-to-badge assignments
-- - badge_quests: Badge-to-quest relationships
-- - badge_requirements: Badge earning requirements
-- - badges: Badge definitions
--
-- CASCADE will automatically drop dependent objects

-- Drop tables in order (child tables first)
DROP TABLE IF EXISTS user_badges CASCADE;
DROP TABLE IF EXISTS badge_quests CASCADE;
DROP TABLE IF EXISTS badge_requirements CASCADE;
DROP TABLE IF EXISTS badges CASCADE;

-- Verification query (run after migration)
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN ('user_badges', 'badge_quests', 'badge_requirements', 'badges');
-- Expected result: 0 rows
