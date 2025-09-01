-- Complete migration for all subscription-related columns
-- Run this in Supabase SQL editor

-- Add stripe_customer_id if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- Add stripe_subscription_id if missing  
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Add subscription_status if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';

-- Add subscription_current_period_end if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE;

-- Add subscription_cancel_at_period_end if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN DEFAULT FALSE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_id ON users(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);

-- Add comments for documentation
COMMENT ON COLUMN users.stripe_customer_id IS 'Stripe customer ID for payment processing';
COMMENT ON COLUMN users.stripe_subscription_id IS 'Active Stripe subscription ID';
COMMENT ON COLUMN users.subscription_status IS 'Current subscription status from Stripe';
COMMENT ON COLUMN users.subscription_current_period_end IS 'When the current subscription period ends';
COMMENT ON COLUMN users.subscription_cancel_at_period_end IS 'Whether subscription will cancel at period end';