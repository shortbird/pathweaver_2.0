-- Migration: Create admin_masquerade_log table for tracking masquerade sessions
-- Created: 2025-01-11

-- Create the admin_masquerade_log table
CREATE TABLE IF NOT EXISTS admin_masquerade_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    ip_address TEXT,
    user_agent TEXT,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_masquerade_log_admin ON admin_masquerade_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_masquerade_log_target ON admin_masquerade_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_masquerade_log_started ON admin_masquerade_log(started_at DESC);

-- Add RLS policies
ALTER TABLE admin_masquerade_log ENABLE ROW LEVEL SECURITY;

-- Admin-only access policy
CREATE POLICY "Admins can view all masquerade logs" ON admin_masquerade_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Admin-only insert policy
CREATE POLICY "Admins can insert masquerade logs" ON admin_masquerade_log
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Admin-only update policy (for ending sessions)
CREATE POLICY "Admins can update masquerade logs" ON admin_masquerade_log
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Add comment
COMMENT ON TABLE admin_masquerade_log IS 'Audit log for admin masquerade sessions - tracks when admins view the platform as other users';
