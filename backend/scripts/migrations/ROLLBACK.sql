-- File: migrations/ROLLBACK.sql
-- Purpose: Emergency rollback script if migrations fail
-- WARNING: Only use if absolutely necessary
-- Date: January 2025

-- ==========================================================
-- ROLLBACK INSTRUCTIONS
-- ==========================================================
-- 1. Run this script ONLY if migrations cause critical issues
-- 2. This will restore tables from backup_schema
-- 3. Database will be restored to pre-migration state
-- 4. Loss of any data changes after migration start
-- ==========================================================

-- Step 1: Restore deleted tables from backup
CREATE TABLE IF NOT EXISTS quest_collaborations AS
  SELECT * FROM backup_schema.quest_collaborations;

CREATE TABLE IF NOT EXISTS task_collaborations AS
  SELECT * FROM backup_schema.task_collaborations;

CREATE TABLE IF NOT EXISTS quest_ratings AS
  SELECT * FROM backup_schema.quest_ratings;

CREATE TABLE IF NOT EXISTS subscription_tiers AS
  SELECT * FROM backup_schema.subscription_tiers;

CREATE TABLE IF NOT EXISTS subscription_requests AS
  SELECT * FROM backup_schema.subscription_requests;

CREATE TABLE IF NOT EXISTS subscription_history AS
  SELECT * FROM backup_schema.subscription_history;

-- Step 2: Restore users table columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50),
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);

-- Restore data from backup
UPDATE users u
SET
  subscription_tier = b.subscription_tier,
  subscription_status = b.subscription_status,
  subscription_end_date = b.subscription_end_date,
  stripe_customer_id = b.stripe_customer_id,
  stripe_subscription_id = b.stripe_subscription_id
FROM backup_schema.users_backup b
WHERE u.id = b.id;

-- Step 3: Restore quests table columns (if changed)
-- Add restore commands here if quest table was modified

-- Verify rollback
SELECT 'Rollback complete - verify table restoration' as status;

-- Check restored tables
SELECT table_name, (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = t.table_name) as exists
FROM (VALUES
  ('quest_collaborations'),
  ('task_collaborations'),
  ('quest_ratings'),
  ('subscription_tiers'),
  ('subscription_requests'),
  ('subscription_history')
) AS t(table_name);
