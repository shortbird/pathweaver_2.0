-- Migration: Create webhook infrastructure for LMS integrations
-- Date: 2025-12-26
-- Purpose: Enable webhook notifications for external systems (Canvas, Moodle, Blackboard)

-- Create webhook_subscriptions table
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'quest.completed', 'task.completed', 'badge.earned', etc.
    target_url TEXT NOT NULL,
    secret TEXT NOT NULL, -- For HMAC-SHA256 signature verification
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Constraints
    CONSTRAINT valid_event_type CHECK (
        event_type IN (
            'quest.completed',
            'task.completed',
            'task.submitted',
            'badge.earned',
            'user.registered',
            'grade.updated',
            'quest.started',
            'evidence.uploaded'
        )
    ),
    CONSTRAINT valid_url CHECK (target_url ~* '^https?://'),
    CONSTRAINT unique_org_event_url UNIQUE (organization_id, event_type, target_url)
);

-- Create indexes for webhook_subscriptions
CREATE INDEX idx_webhook_subscriptions_org ON webhook_subscriptions(organization_id) WHERE is_active = TRUE;
CREATE INDEX idx_webhook_subscriptions_event ON webhook_subscriptions(event_type) WHERE is_active = TRUE;
CREATE INDEX idx_webhook_subscriptions_active ON webhook_subscriptions(is_active, created_at DESC);

-- Create webhook_deliveries table for tracking delivery status and retries
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'delivered', 'failed', 'retrying'
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    last_attempt_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    response_code INT,
    response_body TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    next_retry_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('pending', 'delivered', 'failed', 'retrying')),
    CONSTRAINT valid_attempts CHECK (attempts >= 0 AND attempts <= max_attempts)
);

-- Create indexes for webhook_deliveries
CREATE INDEX idx_webhook_deliveries_subscription ON webhook_deliveries(subscription_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status, next_retry_at) WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_webhook_deliveries_event ON webhook_deliveries(event_type, created_at DESC);
CREATE INDEX idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_webhook_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER webhook_subscription_updated_at
    BEFORE UPDATE ON webhook_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_webhook_subscription_updated_at();

-- Add RLS policies for webhook_subscriptions
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;

-- Organization admins can view their org's webhooks
CREATE POLICY webhook_subscriptions_org_admin_select ON webhook_subscriptions
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id
            FROM users
            WHERE id = auth.uid()
            AND role IN ('org_admin', 'admin')
        )
    );

-- Organization admins can insert webhooks for their org
CREATE POLICY webhook_subscriptions_org_admin_insert ON webhook_subscriptions
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM users
            WHERE id = auth.uid()
            AND role IN ('org_admin', 'admin')
        )
    );

-- Organization admins can update their org's webhooks
CREATE POLICY webhook_subscriptions_org_admin_update ON webhook_subscriptions
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id
            FROM users
            WHERE id = auth.uid()
            AND role IN ('org_admin', 'admin')
        )
    );

-- Organization admins can delete their org's webhooks
CREATE POLICY webhook_subscriptions_org_admin_delete ON webhook_subscriptions
    FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id
            FROM users
            WHERE id = auth.uid()
            AND role IN ('org_admin', 'admin')
        )
    );

-- Add RLS policies for webhook_deliveries (read-only for org admins)
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Organization admins can view delivery logs for their webhooks
CREATE POLICY webhook_deliveries_org_admin_select ON webhook_deliveries
    FOR SELECT
    USING (
        subscription_id IN (
            SELECT id
            FROM webhook_subscriptions
            WHERE organization_id IN (
                SELECT organization_id
                FROM users
                WHERE id = auth.uid()
                AND role IN ('org_admin', 'admin')
            )
        )
    );

-- Add comments for documentation
COMMENT ON TABLE webhook_subscriptions IS 'Webhook subscriptions for external integrations (LMS, analytics platforms)';
COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery tracking with retry logic and status monitoring';
COMMENT ON COLUMN webhook_subscriptions.secret IS 'HMAC-SHA256 secret for webhook signature verification - generate with secrets.token_hex(32)';
COMMENT ON COLUMN webhook_subscriptions.event_type IS 'Event type to subscribe to - determines when webhook fires';
COMMENT ON COLUMN webhook_deliveries.payload IS 'Full JSON payload sent to webhook endpoint';
COMMENT ON COLUMN webhook_deliveries.next_retry_at IS 'Timestamp for next retry attempt (exponential backoff)';
