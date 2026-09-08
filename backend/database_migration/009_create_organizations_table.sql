-- Migration 009: Create Organizations Table
-- Purpose: Add multi-organization support to Optio platform
-- Created: 2025-12-07
-- Part of: Multi-Organization Implementation Phase 1

BEGIN;

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    quest_visibility_policy VARCHAR(50) NOT NULL DEFAULT 'all_optio',
    branding_config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_policy CHECK (
        quest_visibility_policy IN ('all_optio', 'curated', 'private_only')
    )
);

-- Create indexes
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_is_active ON organizations(is_active);

-- Insert default Optio organization
INSERT INTO organizations (name, slug, quest_visibility_policy, is_active)
VALUES ('Optio', 'optio', 'all_optio', true)
ON CONFLICT (slug) DO NOTHING;

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view active organizations
CREATE POLICY "users_can_view_active_organizations" ON organizations
    FOR SELECT
    USING (is_active = true);

-- RLS Policy: Only superadmins can insert/update/delete organizations
-- (Enforced at application level via @require_superadmin decorator)
CREATE POLICY "superadmin_can_manage_organizations" ON organizations
    FOR ALL
    USING (auth.uid() IN (
        SELECT id FROM users WHERE role = 'admin' AND email = 'tannerbowman@gmail.com'
    ));

COMMIT;
