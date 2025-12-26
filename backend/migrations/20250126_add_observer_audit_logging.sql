-- Migration: Add Observer Access Audit Logging
-- Purpose: COPPA/FERPA compliance - track all observer access to student data
-- Date: January 26, 2025

-- Create observer_access_audit table
CREATE TABLE IF NOT EXISTS observer_access_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, -- 'view_portfolio', 'view_quest', 'view_task', 'view_badge', 'view_profile'
    resource_type VARCHAR(50), -- 'portfolio', 'quest', 'task', 'badge', 'profile', 'diploma'
    resource_id UUID, -- ID of the resource being accessed (quest_id, task_id, etc.)
    ip_address VARCHAR(45), -- IPv4 or IPv6
    user_agent TEXT, -- Browser/device info
    request_path TEXT, -- API endpoint or page URL
    metadata JSONB, -- Additional context (quest title, task title, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_observer_audit_observer_id ON observer_access_audit(observer_id);
CREATE INDEX idx_observer_audit_student_id ON observer_access_audit(student_id);
CREATE INDEX idx_observer_audit_created_at ON observer_access_audit(created_at DESC);
CREATE INDEX idx_observer_audit_action_type ON observer_access_audit(action_type);
CREATE INDEX idx_observer_audit_composite ON observer_access_audit(observer_id, student_id, created_at DESC);

-- Create RLS policies
ALTER TABLE observer_access_audit ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all audit logs
CREATE POLICY admin_view_all_audit_logs ON observer_access_audit
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'superadmin')
        )
    );

-- Policy: Students can view audit logs of observers accessing their data
CREATE POLICY student_view_own_audit_logs ON observer_access_audit
    FOR SELECT
    USING (student_id = auth.uid());

-- Policy: Observers can view their own access logs
CREATE POLICY observer_view_own_audit_logs ON observer_access_audit
    FOR SELECT
    USING (observer_id = auth.uid());

-- Policy: Only system/admin can insert audit logs (prevent tampering)
CREATE POLICY admin_insert_audit_logs ON observer_access_audit
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'superadmin')
        )
        OR auth.uid() IS NULL -- Allow service role (backend) to insert
    );

-- Helper function to log observer access (callable from backend)
CREATE OR REPLACE FUNCTION log_observer_access(
    p_observer_id UUID,
    p_student_id UUID,
    p_action_type VARCHAR,
    p_resource_type VARCHAR DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_ip_address VARCHAR DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_request_path TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO observer_access_audit (
        observer_id,
        student_id,
        action_type,
        resource_type,
        resource_id,
        ip_address,
        user_agent,
        request_path,
        metadata
    ) VALUES (
        p_observer_id,
        p_student_id,
        p_action_type,
        p_resource_type,
        p_resource_id,
        p_ip_address,
        p_user_agent,
        p_request_path,
        p_metadata
    ) RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION log_observer_access TO authenticated;

COMMENT ON TABLE observer_access_audit IS 'COPPA/FERPA compliance: Audit trail of observer access to student data';
COMMENT ON FUNCTION log_observer_access IS 'Helper function to log observer access events from backend';
