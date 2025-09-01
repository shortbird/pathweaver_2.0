-- Fix subscription_tier enum to include new values
-- Run this in Supabase SQL Editor

-- First, check current enum values
SELECT unnest(enum_range(NULL::subscription_tier));

-- Add new values to the enum if they don't exist
ALTER TYPE subscription_tier ADD VALUE IF NOT EXISTS 'free';
ALTER TYPE subscription_tier ADD VALUE IF NOT EXISTS 'supported';
ALTER TYPE subscription_tier ADD VALUE IF NOT EXISTS 'academy';

-- Add missing columns for Stripe integration
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_id ON users(stripe_subscription_id);

-- Update any users with old tier names to new ones
UPDATE users SET subscription_tier = 'free' WHERE subscription_tier = 'explorer';
UPDATE users SET subscription_tier = 'supported' WHERE subscription_tier = 'creator';
UPDATE users SET subscription_tier = 'academy' WHERE subscription_tier = 'visionary';

-- Update your specific user to supported tier (since you paid)
UPDATE users 
SET subscription_tier = 'supported',
    subscription_status = 'active',
    stripe_customer_id = 'cus_SyaFSwewEEzbse'
WHERE id = 'ad8e119c-0685-4431-8381-527273832ca9';