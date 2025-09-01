-- Complete migration to fix subscription_tier enum
-- Run this in Supabase SQL Editor

-- Step 1: Add a temporary column
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier_new TEXT;

-- Step 2: Copy current values to temporary column, mapping old to new
UPDATE users 
SET subscription_tier_new = 
  CASE 
    WHEN subscription_tier::text = 'explorer' THEN 'free'
    WHEN subscription_tier::text = 'creator' THEN 'supported'
    WHEN subscription_tier::text = 'visionary' THEN 'academy'
    ELSE subscription_tier::text
  END;

-- Step 3: Drop the old column
ALTER TABLE users DROP COLUMN subscription_tier;

-- Step 4: Drop the old enum type
DROP TYPE IF EXISTS subscription_tier;

-- Step 5: Create new enum type with correct values
CREATE TYPE subscription_tier AS ENUM ('free', 'supported', 'academy', 'explorer', 'creator', 'visionary');

-- Step 6: Add the column back with new enum
ALTER TABLE users ADD COLUMN subscription_tier subscription_tier DEFAULT 'free';

-- Step 7: Copy values back from temporary column
UPDATE users 
SET subscription_tier = subscription_tier_new::subscription_tier
WHERE subscription_tier_new IS NOT NULL;

-- Step 8: Drop temporary column
ALTER TABLE users DROP COLUMN subscription_tier_new;

-- Step 9: Add missing Stripe columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE;

-- Step 10: Create indexes
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_id ON users(stripe_subscription_id);

-- Step 11: Update your user to supported (since you paid)
UPDATE users 
SET subscription_tier = 'supported',
    subscription_status = 'active',
    stripe_customer_id = 'cus_SyaFSwewEEzbse'
WHERE id = 'ad8e119c-0685-4431-8381-527273832ca9';