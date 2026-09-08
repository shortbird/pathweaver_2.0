-- Migration 031: Add Course Visibility Policy to Organizations
-- Purpose: Allow organizations to control course visibility similar to quest visibility
-- Created: 2026-01-06

BEGIN;

-- Add course_visibility_policy column to organizations table
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS course_visibility_policy VARCHAR(50) NOT NULL DEFAULT 'all_optio';

-- Add constraint for valid policy values
ALTER TABLE organizations
ADD CONSTRAINT valid_course_policy CHECK (
    course_visibility_policy IN ('all_optio', 'curated', 'private_only')
);

-- Create organization_course_access table for curated policy
CREATE TABLE IF NOT EXISTS organization_course_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),

    -- Prevent duplicate grants
    UNIQUE(organization_id, course_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_org_course_access_org ON organization_course_access(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_course_access_course ON organization_course_access(course_id);
CREATE INDEX IF NOT EXISTS idx_org_course_access_composite ON organization_course_access(organization_id, course_id);

-- Enable RLS
ALTER TABLE organization_course_access ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view course access for their organization
CREATE POLICY "users_can_view_org_course_access" ON organization_course_access
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    );

-- RLS Policy: Org admins can manage course access for their organization
CREATE POLICY "org_admins_can_manage_course_access" ON organization_course_access
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id
            FROM users
            WHERE id = auth.uid()
            AND (is_org_admin = true OR role IN ('admin', 'superadmin', 'org_admin'))
        )
    );

COMMIT;
