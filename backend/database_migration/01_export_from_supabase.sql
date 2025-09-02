-- ========================================
-- STEP 1: EXPORT DATA FROM SUPABASE
-- ========================================
-- Run these commands in Supabase SQL Editor to export your data

-- Export users table
COPY (SELECT * FROM users) TO STDOUT WITH CSV HEADER;

-- Export quests table
COPY (SELECT * FROM quests) TO STDOUT WITH CSV HEADER;

-- Export quest_tasks table
COPY (SELECT * FROM quest_tasks) TO STDOUT WITH CSV HEADER;

-- Export quest_task_completions table
COPY (SELECT * FROM quest_task_completions) TO STDOUT WITH CSV HEADER;

-- Export user_skill_xp table
COPY (SELECT * FROM user_skill_xp) TO STDOUT WITH CSV HEADER;

-- Export quest_submissions table
COPY (SELECT * FROM quest_submissions) TO STDOUT WITH CSV HEADER;

-- Export user_quests table
COPY (SELECT * FROM user_quests) TO STDOUT WITH CSV HEADER;

-- Export quest_collaborations table (if exists)
COPY (SELECT * FROM quest_collaborations) TO STDOUT WITH CSV HEADER;

-- Export site_settings table (if exists)
COPY (SELECT * FROM site_settings) TO STDOUT WITH CSV HEADER;

-- Alternative: Use pg_dump for complete backup
-- pg_dump -h your-supabase-host -U postgres -d postgres --data-only --column-inserts > supabase_backup.sql