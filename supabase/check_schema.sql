-- Check actual database schema structure
-- Run this in Supabase SQL Editor to see the actual table columns

-- Check diplomas table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'diplomas'
ORDER BY ordinal_position;

-- Check user_quests table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'user_quests'
ORDER BY ordinal_position;

-- Check learning_logs table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'learning_logs'
ORDER BY ordinal_position;

-- Check all tables that need RLS fixes
SELECT 
    table_name,
    COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name IN (
    'diplomas',
    'user_quests',
    'learning_logs',
    'learning_logs_backup',
    'submissions',
    'friendships',
    'quest_collaborations',
    'quest_reviews',
    'user_achievements',
    'leaderboards',
    'user_xp',
    'user_skill_details',
    'user_skill_xp',
    'activity_log',
    'parent_child_relationships',
    'advisor_groups',
    'advisor_group_members',
    'quest_ideas',
    'quest_ratings',
    'site_settings',
    'users',
    'role_change_log'
)
GROUP BY table_name
ORDER BY table_name;

-- Check existing RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;