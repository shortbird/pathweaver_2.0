-- ========================================
-- STEP 1: EXPORT DATA FROM SUPABASE
-- ========================================

-- METHOD 1: Export as JSON (Works in Supabase SQL Editor)
-- Run each query separately and copy the results

-- Export users table as JSON
SELECT json_agg(users.*) FROM users;

-- Export quests table as JSON
SELECT json_agg(quests.*) FROM quests;

-- Export quest_tasks table as JSON
SELECT json_agg(quest_tasks.*) FROM quest_tasks;

-- Export quest_task_completions table as JSON
SELECT json_agg(quest_task_completions.*) FROM quest_task_completions;

-- Export user_skill_xp table as JSON
SELECT json_agg(user_skill_xp.*) FROM user_skill_xp;

-- Export quest_submissions table as JSON
SELECT json_agg(quest_submissions.*) FROM quest_submissions;

-- Export user_quests table as JSON
SELECT json_agg(user_quests.*) FROM user_quests;

-- Export quest_collaborations table as JSON (if exists)
SELECT json_agg(quest_collaborations.*) FROM quest_collaborations;

-- Export site_settings table as JSON (if exists)
SELECT json_agg(site_settings.*) FROM site_settings;

-- ========================================
-- METHOD 2: Using Supabase Dashboard
-- ========================================
-- 1. Go to Table Editor in Supabase Dashboard
-- 2. Select each table
-- 3. Click the "Export" button (download icon)
-- 4. Choose "Export as CSV"

-- ========================================
-- METHOD 3: Using pg_dump (Command Line)
-- ========================================
-- Get your connection string from Supabase Dashboard > Settings > Database
-- Run this in your terminal:
/*
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  --data-only \
  --column-inserts \
  --no-owner \
  --no-privileges \
  > supabase_backup.sql
*/

-- ========================================
-- METHOD 4: Create Export Views (For Large Tables)
-- ========================================
-- Create views that can be exported in chunks

CREATE OR REPLACE VIEW export_users AS
SELECT * FROM users ORDER BY created_at;

CREATE OR REPLACE VIEW export_quests AS
SELECT * FROM quests ORDER BY created_at;

CREATE OR REPLACE VIEW export_completions AS
SELECT * FROM quest_task_completions ORDER BY completed_at;

-- Then export with pagination:
-- SELECT * FROM export_users LIMIT 1000 OFFSET 0;
-- SELECT * FROM export_users LIMIT 1000 OFFSET 1000;
-- etc.