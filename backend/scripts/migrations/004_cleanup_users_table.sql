-- File: migrations/004_cleanup_users_table.sql
-- Purpose: Remove subscription-related columns from users table
-- NOTE: achievement_level, momentum_rank columns do NOT exist (verified via MCP)
-- Date: January 2025

-- Remove subscription-related columns ONLY
ALTER TABLE users
  DROP COLUMN IF EXISTS subscription_tier CASCADE,
  DROP COLUMN IF EXISTS subscription_status CASCADE,
  DROP COLUMN IF EXISTS subscription_end_date CASCADE,
  DROP COLUMN IF EXISTS stripe_customer_id CASCADE,
  DROP COLUMN IF EXISTS stripe_subscription_id CASCADE;

-- Verify columns removed
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN (
    'subscription_tier',
    'subscription_status',
    'subscription_end_date',
    'stripe_customer_id',
    'stripe_subscription_id'
  );
-- Should return 0 rows
