-- BADGE SYSTEM MIGRATION GUIDE
-- =============================
-- This directory contains SQL migration scripts for the badge system feature.
-- Run these scripts in order in your Supabase SQL Editor.

-- EXECUTION ORDER:
-- ---------------
-- 1. 001_create_badges_table.sql
-- 2. 002_enhance_user_badges_table.sql
-- 3. 003_create_quest_templates_table.sql
-- 4. 004_create_badge_quests_table.sql
-- 5. 005_create_credit_ledger_table.sql
-- 6. 006_create_ai_content_metrics_table.sql
-- 7. 007_add_applicable_badges_to_quests.sql
-- 8. 008_create_performance_indexes.sql

-- PRE-MIGRATION CHECKLIST:
-- -----------------------
-- [ ] Backup your database
-- [ ] Test migrations on development database first
-- [ ] Review RLS policies for your specific needs
-- [ ] Ensure all referenced tables exist (users, quests, quest_tasks)
-- [ ] Check that auth.uid() works in your Supabase setup

-- POST-MIGRATION CHECKLIST:
-- ------------------------
-- [ ] Verify all tables created successfully
-- [ ] Check that indexes exist (use \d+ table_name in psql)
-- [ ] Test RLS policies with different user roles
-- [ ] Run ANALYZE on new tables
-- [ ] Update application environment variables if needed
-- [ ] Test basic CRUD operations on new tables

-- ROLLBACK INSTRUCTIONS:
-- ---------------------
-- If you need to rollback, run these commands in reverse order:

/*
DROP VIEW IF EXISTS user_credit_summary;
DROP TABLE IF EXISTS ai_content_metrics CASCADE;
DROP TABLE IF EXISTS credit_ledger CASCADE;
DROP TABLE IF EXISTS badge_quests CASCADE;
DROP TABLE IF EXISTS quest_templates CASCADE;
ALTER TABLE user_badges
    DROP COLUMN IF EXISTS badge_id,
    DROP COLUMN IF EXISTS is_active,
    DROP COLUMN IF EXISTS progress_percentage,
    DROP COLUMN IF EXISTS started_at,
    DROP COLUMN IF EXISTS completed_at,
    DROP COLUMN IF EXISTS quests_completed,
    DROP COLUMN IF EXISTS xp_earned;
ALTER TABLE quests DROP COLUMN IF EXISTS applicable_badges;
DROP TABLE IF EXISTS badges CASCADE;
DROP FUNCTION IF EXISTS update_badges_updated_at();
DROP FUNCTION IF EXISTS update_quest_templates_updated_at();
DROP FUNCTION IF EXISTS update_ai_metrics_updated_at();
*/

-- TESTING QUERIES:
-- ---------------

-- 1. Verify all tables exist:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('badges', 'user_badges', 'quest_templates', 'badge_quests', 'credit_ledger', 'ai_content_metrics')
ORDER BY table_name;

-- 2. Check table row counts:
SELECT
    'badges' as table_name, COUNT(*) as rows FROM badges
UNION ALL
SELECT 'user_badges', COUNT(*) FROM user_badges
UNION ALL
SELECT 'quest_templates', COUNT(*) FROM quest_templates
UNION ALL
SELECT 'badge_quests', COUNT(*) FROM badge_quests
UNION ALL
SELECT 'credit_ledger', COUNT(*) FROM credit_ledger
UNION ALL
SELECT 'ai_content_metrics', COUNT(*) FROM ai_content_metrics;

-- 3. Verify indexes:
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('badges', 'user_badges', 'quest_templates', 'badge_quests', 'credit_ledger', 'ai_content_metrics')
ORDER BY tablename, indexname;

-- 4. Test RLS policies:
-- (Run these as a non-admin user to verify policies work correctly)
SELECT * FROM badges LIMIT 1;
SELECT * FROM user_badges WHERE user_id = auth.uid() LIMIT 1;

-- NOTES:
-- -----
-- - All timestamps use TIMESTAMP WITH TIME ZONE for consistency
-- - RLS policies assume you have a 'users' table with 'role' column
-- - Foreign keys use ON DELETE CASCADE where appropriate
-- - Indexes are created for common query patterns
-- - JSONB columns use GIN indexes for efficient querying
