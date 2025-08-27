-- Check existing schema to understand what we're working with

-- Check if quest_xp_awards exists and its columns
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'quest_xp_awards'
ORDER BY ordinal_position;

-- Check if quest_skill_xp exists and its columns
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'quest_skill_xp'
ORDER BY ordinal_position;

-- Check if user_skill_xp exists and its columns
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'user_skill_xp'
ORDER BY ordinal_position;

-- Check quests table columns
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'quests'
AND column_name LIKE '%xp%' OR column_name LIKE '%skill%'
ORDER BY ordinal_position;

-- Check if users table exists
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name LIKE '%xp%' OR column_name = 'level'
ORDER BY ordinal_position;

-- Sample data from quest_xp_awards if it exists
SELECT * FROM quest_xp_awards LIMIT 5;