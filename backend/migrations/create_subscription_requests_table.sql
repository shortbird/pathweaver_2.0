-- Create subscription_requests table for tracking manual subscription upgrade requests
-- This replaces the automated Stripe flow with a human-mediated upgrade process

CREATE TABLE IF NOT EXISTS subscription_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier_requested TEXT NOT NULL CHECK (tier_requested IN ('Explore', 'Accelerate', 'Achieve', 'Excel')),
    contact_preference TEXT NOT NULL CHECK (contact_preference IN ('email', 'phone')),
    phone_number TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by UUID REFERENCES users(id),
    notes TEXT,
    CONSTRAINT valid_phone_for_phone_preference CHECK (
        contact_preference != 'phone' OR phone_number IS NOT NULL
    )
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_subscription_requests_user_id ON subscription_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_status ON subscription_requests(status);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_created_at ON subscription_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_tier ON subscription_requests(tier_requested);

-- Add RLS policies
ALTER TABLE subscription_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscription requests
CREATE POLICY "Users can view own subscription requests"
    ON subscription_requests FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own subscription requests
CREATE POLICY "Users can create own subscription requests"
    ON subscription_requests FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Admins can view all subscription requests
CREATE POLICY "Admins can view all subscription requests"
    ON subscription_requests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Admins can update subscription requests (mark as processed, add notes)
CREATE POLICY "Admins can update subscription requests"
    ON subscription_requests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Add comment for documentation
COMMENT ON TABLE subscription_requests IS 'Tracks manual subscription upgrade requests from users. Replaces automated Stripe checkout flow with human-mediated communication.';
COMMENT ON COLUMN subscription_requests.tier_requested IS 'The subscription tier the user wants to upgrade to (Explore, Accelerate, Achieve, Excel)';
COMMENT ON COLUMN subscription_requests.contact_preference IS 'User preferred contact method (email or phone)';
COMMENT ON COLUMN subscription_requests.status IS 'Current status: pending (new request), in_progress (being processed), completed (user upgraded), cancelled (user cancelled request)';
COMMENT ON COLUMN subscription_requests.processed_by IS 'Admin user ID who processed this request';
