-- Add Stripe subscription management fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN DEFAULT FALSE;

-- Create subscription history table for better tracking
CREATE TABLE IF NOT EXISTS subscription_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT NOT NULL,
    tier TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    stripe_event_id TEXT UNIQUE,
    event_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_subscription_history_user_id ON subscription_history(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_history_stripe_event ON subscription_history(stripe_event_id);

-- Update subscription_tier to use new tier names
-- First, update existing data
UPDATE users SET subscription_tier = 'free' WHERE subscription_tier = 'explorer';
UPDATE users SET subscription_tier = 'supported' WHERE subscription_tier = 'creator';
UPDATE users SET subscription_tier = 'academy' WHERE subscription_tier = 'visionary';

-- Add comment for reference
COMMENT ON COLUMN users.subscription_tier IS 'Subscription tier: free, supported ($10/mo), academy ($25/mo)';