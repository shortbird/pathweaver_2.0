-- Cleanup old tables after successful migration to 5-pillar system
-- WARNING: Run this ONLY after verifying that 001_migrate_to_5_pillars.sql completed successfully
-- and all data has been properly migrated

-- Step 1: Drop old subject-based tables (if they exist)
DROP TABLE IF EXISTS user_subjects CASCADE;
DROP TABLE IF EXISTS quest_subjects CASCADE;
DROP TABLE IF EXISTS subject_progress CASCADE;

-- Step 2: Drop old XP awards table (after data migration)
-- Note: Only uncomment and run after confirming all data is migrated
-- DROP TABLE IF EXISTS quest_xp_awards CASCADE;

-- Step 3: Drop old columns from quests table if they exist
ALTER TABLE quests 
DROP COLUMN IF EXISTS subject_type,
DROP COLUMN IF EXISTS category,
DROP COLUMN IF EXISTS old_skill_category;

-- Step 4: Drop old user XP tracking columns if they exist
ALTER TABLE users 
DROP COLUMN IF EXISTS total_xp_old,
DROP COLUMN IF EXISTS reading_writing_xp,
DROP COLUMN IF EXISTS thinking_skills_xp,
DROP COLUMN IF EXISTS personal_growth_xp,
DROP COLUMN IF EXISTS life_skills_xp,
DROP COLUMN IF EXISTS making_creating_xp,
DROP COLUMN IF EXISTS world_understanding_xp;

-- Step 5: Drop any old views related to the 6-category system
DROP VIEW IF EXISTS user_category_xp CASCADE;
DROP VIEW IF EXISTS quest_category_distribution CASCADE;
DROP VIEW IF EXISTS old_user_progress CASCADE;

-- Step 6: Drop any old functions related to the old system
DROP FUNCTION IF EXISTS calculate_category_xp(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_user_category_progress(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_old_xp_totals() CASCADE;

-- Cleanup complete!