-- Migration: Add Administrative Action Audit Logging
-- Purpose: Track all admin actions for security and compliance
-- Retention: 90+ days for compliance audit trails
-- Date: December 27, 2025

-- Create admin_audit_logs table
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(100) NOT NULL, -- 'update_user_role', 'update_org_policy', 'create_quest', etc.
    resource_type VARCHAR(50), -- 'user', 'organization', 'quest', 'badge', 'announcement', etc.
    resource_id UUID, -- ID of the resource being modified
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- Organization context (if applicable)
    ip_address VARCHAR(45), -- IPv4 or IPv6
    user_agent TEXT, -- Browser/device info
    request_path TEXT, -- API endpoint
    metadata JSONB, -- Additional context (old/new values, affected users, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_admin_audit_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX idx_admin_audit_action_type ON admin_audit_logs(action_type);
CREATE INDEX idx_admin_audit_resource ON admin_audit_logs(resource_type, resource_id);
CREATE INDEX idx_admin_audit_organization_id ON admin_audit_logs(organization_id);
CREATE INDEX idx_admin_audit_created_at ON admin_audit_logs(created_at DESC);
CREATE INDEX idx_admin_audit_composite ON admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_admin_audit_org_composite ON admin_audit_logs(organization_id, created_at DESC) WHERE organization_id IS NOT NULL;

-- Create RLS policies
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all audit logs in their organization
CREATE POLICY admin_view_org_audit_logs ON admin_audit_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'superadmin', 'advisor')
            AND (
                -- Superadmins can see all logs
                users.role = 'superadmin'
                OR
                -- Org admins/advisors can see logs for their organization
                users.organization_id = admin_audit_logs.organization_id
            )
        )
    );

-- Policy: Admins can view their own actions
CREATE POLICY admin_view_own_audit_logs ON admin_audit_logs
    FOR SELECT
    USING (admin_id = auth.uid());

-- Policy: Only system/admin can insert audit logs (prevent tampering)
CREATE POLICY admin_insert_audit_logs ON admin_audit_logs
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'superadmin', 'advisor')
        )
        OR auth.uid() IS NULL -- Allow service role (backend) to insert
    );

-- No update or delete policies - audit logs are immutable

-- Comments for documentation
COMMENT ON TABLE admin_audit_logs IS 'Audit trail of administrative actions for security and compliance. Retention: 90+ days.';
COMMENT ON COLUMN admin_audit_logs.action_type IS 'Type of administrative action (e.g., update_user_role, update_org_policy, create_quest)';
COMMENT ON COLUMN admin_audit_logs.resource_type IS 'Type of resource being modified (user, organization, quest, badge, etc.)';
COMMENT ON COLUMN admin_audit_logs.resource_id IS 'UUID of the specific resource being modified';
COMMENT ON COLUMN admin_audit_logs.organization_id IS 'Organization context for the action (if applicable)';
COMMENT ON COLUMN admin_audit_logs.metadata IS 'Additional context: old/new values, affected users, request data (excludes sensitive fields)';
