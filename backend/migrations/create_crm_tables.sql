-- CRM System Database Migration
-- Creates 5 new tables for email campaign management, automation, and tracking
-- All triggers and sequences default to INACTIVE for safety

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table 1: email_campaigns
-- Stores campaign configuration for manual, scheduled, and triggered email sends
CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    template_key TEXT NOT NULL, -- References key in email_templates or email_copy.yaml
    custom_template_data JSONB, -- Optional template overrides
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'active', 'paused')),
    campaign_type TEXT NOT NULL CHECK (campaign_type IN ('manual', 'scheduled', 'triggered')),
    scheduled_for TIMESTAMPTZ, -- When to send (for scheduled type)
    trigger_event TEXT, -- Event type that triggers send (e.g., 'evidence_uploaded')
    trigger_config JSONB, -- Conditions for trigger (e.g., {"min_quest_count": 3})
    recipient_segment JSONB, -- Segmentation rules for recipients
    sent_at TIMESTAMPTZ, -- When campaign was actually sent
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 2: email_campaign_sends
-- Tracks individual email deliveries for analytics and history
CREATE TABLE IF NOT EXISTS email_campaign_sends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'bounced')),
    error_message TEXT,
    metadata JSONB -- Variables used, SendGrid message ID, etc.
);

-- Table 3: user_segments
-- Saved filter combinations for reusable recipient targeting
CREATE TABLE IF NOT EXISTS user_segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    filter_rules JSONB NOT NULL, -- e.g., {"role": "student", "last_active_days": 30, "min_xp": 500}
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 4: email_templates
-- Custom email templates with full YAML structure storage
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_key TEXT UNIQUE NOT NULL, -- e.g., 'onboarding_day_1', 'welcome_back'
    name TEXT NOT NULL, -- Display name
    description TEXT,
    subject TEXT NOT NULL,
    template_data JSONB NOT NULL, -- Full YAML structure as JSON
    is_system BOOLEAN DEFAULT FALSE, -- True for built-in templates (cannot be deleted)
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 5: automation_sequences
-- Multi-step email sequences triggered by events (e.g., onboarding)
CREATE TABLE IF NOT EXISTS automation_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    trigger_event TEXT NOT NULL, -- Event that starts sequence (e.g., 'registration_success')
    steps JSONB NOT NULL, -- Array of {delay_hours: int, campaign_id: uuid, condition: string}
    is_active BOOLEAN DEFAULT FALSE, -- SAFETY: All sequences start INACTIVE
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_type ON email_campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_trigger_event ON email_campaigns(trigger_event);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled_for ON email_campaigns(scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_campaign_id ON email_campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_user_id ON email_campaign_sends(user_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_sent_at ON email_campaign_sends(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_templates_template_key ON email_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_email_templates_is_system ON email_templates(is_system);
CREATE INDEX IF NOT EXISTS idx_automation_sequences_trigger_event ON automation_sequences(trigger_event);
CREATE INDEX IF NOT EXISTS idx_automation_sequences_is_active ON automation_sequences(is_active);

-- Updated_at trigger for campaigns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_email_campaigns_updated_at
    BEFORE UPDATE ON email_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_segments_updated_at
    BEFORE UPDATE ON user_segments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
    BEFORE UPDATE ON email_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_automation_sequences_updated_at
    BEFORE UPDATE ON automation_sequences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert pre-built onboarding sequence (INACTIVE by default)
-- Campaign IDs will be created after campaigns are set up
INSERT INTO automation_sequences (name, description, trigger_event, steps, is_active)
VALUES (
    'Student Onboarding - 7 Days',
    'Welcome sequence for new students over 7 days. Sends reminders only if actions not taken. MUST BE MANUALLY ACTIVATED.',
    'registration_success',
    '[
        {"delay_hours": 24, "template_key": "onboarding_day_1_reminder", "condition": "email_not_verified"},
        {"delay_hours": 72, "template_key": "onboarding_day_3_first_quest", "condition": "no_quests_started"},
        {"delay_hours": 120, "template_key": "onboarding_day_5_ai_tutor", "condition": "tutor_unused"},
        {"delay_hours": 168, "template_key": "onboarding_day_7_community", "condition": "no_connections"}
    ]'::jsonb,
    FALSE  -- INACTIVE BY DEFAULT - admin must activate
)
ON CONFLICT DO NOTHING;

-- Row Level Security (RLS) - Admin only access
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaign_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_sequences ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only admins can access CRM tables
CREATE POLICY "Admins can view all campaigns" ON email_campaigns FOR SELECT
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Admins can insert campaigns" ON email_campaigns FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Admins can update campaigns" ON email_campaigns FOR UPDATE
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Admins can delete campaigns" ON email_campaigns FOR DELETE
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- Similar policies for other tables
CREATE POLICY "Admins can view all campaign sends" ON email_campaign_sends FOR SELECT
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Admins can insert campaign sends" ON email_campaign_sends FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Admins can view all segments" ON user_segments FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Admins can manage templates" ON email_templates FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Admins can manage sequences" ON automation_sequences FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- Comments for documentation
COMMENT ON TABLE email_campaigns IS 'Email campaign configuration for manual, scheduled, and triggered sends';
COMMENT ON TABLE email_campaign_sends IS 'Individual email delivery tracking for analytics';
COMMENT ON TABLE user_segments IS 'Saved filter combinations for recipient targeting';
COMMENT ON TABLE email_templates IS 'Custom email templates with YAML structure storage';
COMMENT ON TABLE automation_sequences IS 'Multi-step email sequences (e.g., onboarding). All start INACTIVE.';

COMMENT ON COLUMN email_campaigns.status IS 'draft: not sent yet, scheduled: waiting for time, sent: completed, active: trigger enabled, paused: trigger disabled';
COMMENT ON COLUMN email_campaigns.campaign_type IS 'manual: one-time send, scheduled: time-based, triggered: event-based';
COMMENT ON COLUMN automation_sequences.is_active IS 'SAFETY FLAG: Must be manually set to true to start sending emails';
COMMENT ON COLUMN automation_sequences.steps IS 'Array of steps: [{delay_hours, template_key, condition}, ...]';
