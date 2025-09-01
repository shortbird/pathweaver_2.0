-- Simplest fix - just use the existing enum values
-- Run this in Supabase SQL Editor

-- First check what values the enum currently has:
SELECT unnest(enum_range(NULL::subscription_tier));

-- If it has 'explorer', 'creator', 'visionary', then just use those
-- and update the user with the old naming:
UPDATE users 
SET subscription_tier = 'creator'  -- This is "supported" in old naming
WHERE id = 'ad8e119c-0685-4431-8381-527273832ca9';

-- Add missing Stripe columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE;

-- Update with Stripe info
UPDATE users 
SET stripe_customer_id = 'cus_SyaFSwewEEzbse',
    subscription_status = 'active'
WHERE id = 'ad8e119c-0685-4431-8381-527273832ca9';