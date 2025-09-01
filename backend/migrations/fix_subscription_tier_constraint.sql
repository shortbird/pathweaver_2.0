-- Fix subscription_tier constraint to allow new tier names
-- Run this in Supabase SQL editor IMMEDIATELY

-- First, drop the old constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_subscription_tier_check;

-- Add new constraint with correct tier values
ALTER TABLE users ADD CONSTRAINT users_subscription_tier_check 
CHECK (subscription_tier IN ('free', 'supported', 'academy', 'explorer', 'creator', 'visionary'));

-- Update any legacy tier names to new ones
UPDATE users SET subscription_tier = 'free' WHERE subscription_tier = 'explorer';
UPDATE users SET subscription_tier = 'supported' WHERE subscription_tier = 'creator';
UPDATE users SET subscription_tier = 'academy' WHERE subscription_tier = 'visionary';

-- Add missing columns if they don't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE;

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_id ON users(stripe_subscription_id);