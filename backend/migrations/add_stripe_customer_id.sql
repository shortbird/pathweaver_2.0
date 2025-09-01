-- Add stripe_customer_id column if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);

-- Add comment for documentation
COMMENT ON COLUMN users.stripe_customer_id IS 'Stripe customer ID for payment processing';