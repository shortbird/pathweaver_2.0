-- Migration 020: Create Admin Audit Logs Table
-- Purpose: Track administrative actions for compliance and security
-- Created: 2025-12-27
-- Part of: LMS Transformation - Audit Logging System

BEGIN;

-- Create admin_audit_logs table
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    changes JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_action_type CHECK (
        action_type IN (
            'quest_created',
            'quest_updated',
            'quest_deleted',
            'quest_visibility_changed',
            'user_created',
            'user_updated',
            'user_deleted',
            'user_role_changed',
            'curriculum_created',
            'curriculum_updated',
            'curriculum_deleted',
            'organization_settings_updated',
            'quest_invitation_sent',
            'announcement_created',
            'lti_config_updated'
        )
    ),

    CONSTRAINT valid_resource_type CHECK (
        resource_type IN (
            'quest',
            'user',
            'curriculum',
            'organization',
            'invitation',
            'announcement',
            'lti_config'
        )
    )
);

-- Create indexes for efficient querying
CREATE INDEX idx_admin_audit_logs_organization ON admin_audit_logs(organization_id);
CREATE INDEX idx_admin_audit_logs_user ON admin_audit_logs(user_id);
CREATE INDEX idx_admin_audit_logs_timestamp ON admin_audit_logs(created_at DESC);
CREATE INDEX idx_admin_audit_logs_resource ON admin_audit_logs(resource_type, resource_id);
CREATE INDEX idx_admin_audit_logs_action ON admin_audit_logs(action_type);

-- Composite index for organization-filtered queries (most common use case)
CREATE INDEX idx_admin_audit_logs_org_timestamp ON admin_audit_logs(organization_id, created_at DESC);

-- Enable RLS
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: School admins can view logs for their organization only
CREATE POLICY "school_admins_view_own_org_audit_logs" ON admin_audit_logs
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'school_admin'
        )
    );

-- RLS Policy: Superadmins can view all audit logs
CREATE POLICY "superadmins_view_all_audit_logs" ON admin_audit_logs
    FOR SELECT
    USING (
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'superadmin'
        )
    );

-- RLS Policy: System can insert audit logs (enforced at application layer)
CREATE POLICY "system_can_insert_audit_logs" ON admin_audit_logs
    FOR INSERT
    WITH CHECK (true);

-- Add comment explaining retention policy
COMMENT ON TABLE admin_audit_logs IS 'Administrative audit logs retained for 7 years for compliance (FERPA). Archive to cold storage after 2 years.';
COMMENT ON COLUMN admin_audit_logs.changes IS 'JSONB object containing old_value and new_value for update actions';
COMMENT ON COLUMN admin_audit_logs.action_type IS 'Type of action performed (see CHECK constraint for valid values)';
COMMENT ON COLUMN admin_audit_logs.resource_type IS 'Type of resource affected (see CHECK constraint for valid values)';

COMMIT;
