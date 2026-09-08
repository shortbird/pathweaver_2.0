-- FERPA Compliance: Student Data Access Logging
-- Migration: 20251226_create_student_access_logs
-- Purpose: Track all access to student records for FERPA compliance and disclosure reporting
-- Related: LEGAL_COMPLIANCE_AUDIT_2025.md - FERPA Violations

-- Create student access logs table
CREATE TABLE IF NOT EXISTS student_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    accessor_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    accessor_role TEXT NOT NULL,
    data_accessed JSONB NOT NULL, -- {type: 'grades'|'portfolio'|'evidence'|'profile', fields: [...], endpoint: '/api/...'}
    access_timestamp TIMESTAMPTZ DEFAULT NOW(),
    purpose TEXT, -- 'legitimate_educational_interest', 'parent_request', 'directory_info', 'admin_review', etc.
    ip_address INET,
    user_agent TEXT,

    -- Constraints
    CONSTRAINT valid_accessor_role CHECK (accessor_role IN ('student', 'parent', 'advisor', 'admin', 'observer'))
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_student_access_student
    ON student_access_logs(student_id, access_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_student_access_accessor
    ON student_access_logs(accessor_id);

CREATE INDEX IF NOT EXISTS idx_student_access_timestamp
    ON student_access_logs(access_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_student_access_purpose
    ON student_access_logs(purpose)
    WHERE purpose IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE student_access_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Students can view their own access logs
CREATE POLICY student_view_own_access_logs
    ON student_access_logs
    FOR SELECT
    USING (student_id = auth.uid());

-- Parents can view their dependents' access logs
CREATE POLICY parent_view_dependent_access_logs
    ON student_access_logs
    FOR SELECT
    USING (
        student_id IN (
            SELECT id FROM users
            WHERE managed_by_parent_id = auth.uid()
            AND is_dependent = TRUE
        )
    );

-- Admins can view all access logs
CREATE POLICY admin_view_all_access_logs
    ON student_access_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- System can insert logs (bypass RLS with service key)
CREATE POLICY system_insert_access_logs
    ON student_access_logs
    FOR INSERT
    WITH CHECK (TRUE);

-- Add helpful comments
COMMENT ON TABLE student_access_logs IS 'FERPA compliance: Tracks all access to student educational records';
COMMENT ON COLUMN student_access_logs.student_id IS 'The student whose data was accessed';
COMMENT ON COLUMN student_access_logs.accessor_id IS 'User who accessed the data (NULL if system/public access)';
COMMENT ON COLUMN student_access_logs.accessor_role IS 'Role of accessor at time of access';
COMMENT ON COLUMN student_access_logs.data_accessed IS 'JSON describing what data was accessed: {type, fields, endpoint}';
COMMENT ON COLUMN student_access_logs.purpose IS 'Legitimate educational interest or other FERPA-compliant purpose';
COMMENT ON COLUMN student_access_logs.ip_address IS 'Source IP address for security audit';
COMMENT ON COLUMN student_access_logs.user_agent IS 'Browser/client user agent for security audit';
