-- Migration 007: Create Organizations Table for Multi-Tenancy
-- Purpose: Enable organization-based multi-tenancy with domain routing
-- Date: 2025-01-04

-- ============================================
-- 1. CREATE ORGANIZATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    domain VARCHAR(255),
    subdomain VARCHAR(100),
    full_domain VARCHAR(255) UNIQUE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,

    -- Branding settings (stored in settings jsonb)
    -- Example: {"logo_url": "...", "primary_color": "#...", "custom_css": "..."}

    CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9-]+$')
);

-- Create index for domain lookups (critical for performance)
CREATE INDEX IF NOT EXISTS idx_organizations_full_domain ON organizations(full_domain) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_organizations_subdomain ON organizations(subdomain) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Add helpful comment
COMMENT ON TABLE organizations IS 'Multi-tenant organizations with domain-based routing';
COMMENT ON COLUMN organizations.slug IS 'URL-safe identifier (e.g., "optio", "ignite")';
COMMENT ON COLUMN organizations.subdomain IS 'Subdomain for routing (e.g., "ignite" for ignite.optioeducation.com)';
COMMENT ON COLUMN organizations.full_domain IS 'Full domain for this organization (e.g., "ignite.optioeducation.com")';
COMMENT ON COLUMN organizations.settings IS 'JSON configuration: branding, features, custom settings';

-- ============================================
-- 2. ADD ORGANIZATION_ID TO USERS TABLE
-- ============================================

-- Add column (nullable initially for migration)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Create index for user organization queries
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id) WHERE organization_id IS NOT NULL;

COMMENT ON COLUMN users.organization_id IS 'Organization this user belongs to. NULL = default/Optio organization';

-- ============================================
-- 3. ADD ORGANIZATION_ID TO QUESTS TABLE
-- ============================================

-- Add column (nullable initially for migration)
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Create index for quest filtering by organization
CREATE INDEX IF NOT EXISTS idx_quests_organization_id ON quests(organization_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_quests_org_public ON quests(organization_id, is_public) WHERE is_public = true;

COMMENT ON COLUMN quests.organization_id IS 'Organization that created this quest. NULL = Optio public quest';

-- ============================================
-- 4. INSERT DEFAULT ORGANIZATIONS
-- ============================================

-- Insert Optio (parent/default organization)
INSERT INTO organizations (id, name, slug, domain, subdomain, full_domain, settings, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Optio Education',
    'optio',
    'optioeducation.com',
    NULL, -- No subdomain (main domain)
    'www.optioeducation.com',
    '{"is_parent": true, "public_quests_visible_to_all": true}'::jsonb,
    true
)
ON CONFLICT (id) DO NOTHING;

-- Insert Ignite (client organization)
INSERT INTO organizations (id, name, slug, domain, subdomain, full_domain, settings, is_active)
VALUES (
    gen_random_uuid(),
    'Ignite',
    'ignite',
    'optioeducation.com',
    'ignite',
    'ignite.optioeducation.com',
    '{"parent_org_id": "00000000-0000-0000-0000-000000000001", "inherit_parent_quests": true}'::jsonb,
    true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 5. MIGRATE EXISTING DATA
-- ============================================

-- Set all existing users to Optio organization
UPDATE users
SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

-- Set all existing quests to Optio organization (makes them visible to all)
UPDATE quests
SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

-- ============================================
-- 6. UPDATE RLS POLICIES
-- ============================================

-- Drop existing quest RLS policies if they exist
DROP POLICY IF EXISTS "Users can view active public quests" ON quests;
DROP POLICY IF EXISTS "Users can view their own quests" ON quests;

-- Create new organization-aware RLS policies
CREATE POLICY "users_can_view_org_quests" ON quests
    FOR SELECT
    USING (
        is_active = true
        AND (
            -- Public quests visible to all
            is_public = true
            OR
            -- User's own quests
            created_by = auth.uid()
            OR
            -- Quests from user's organization
            organization_id IN (
                SELECT organization_id FROM users WHERE id = auth.uid()
            )
            OR
            -- Optio quests visible to all authenticated users
            organization_id = '00000000-0000-0000-0000-000000000001'::uuid
        )
    );

-- Policy for creating quests (user's organization automatically assigned)
CREATE POLICY "users_can_create_quests_in_org" ON quests
    FOR INSERT
    WITH CHECK (
        created_by = auth.uid()
        AND (
            -- Can create in own organization
            organization_id IN (
                SELECT organization_id FROM users WHERE id = auth.uid()
            )
            OR
            -- Or create without org (will default to user's org in application)
            organization_id IS NULL
        )
    );

-- Policy for updating own quests
CREATE POLICY "users_can_update_own_quests" ON quests
    FOR UPDATE
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- ============================================
-- 7. CREATE HELPER FUNCTIONS
-- ============================================

-- Function to get organization by domain
CREATE OR REPLACE FUNCTION get_organization_by_domain(domain_input TEXT)
RETURNS TABLE (
    id UUID,
    name VARCHAR(100),
    slug VARCHAR(50),
    settings JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT o.id, o.name, o.slug, o.settings
    FROM organizations o
    WHERE o.full_domain = domain_input
       OR o.subdomain = split_part(domain_input, '.', 1)
    AND o.is_active = true
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if user can access quest (for application logic)
CREATE OR REPLACE FUNCTION can_user_access_quest(user_id_input UUID, quest_id_input UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_org_id UUID;
    quest_org_id UUID;
    quest_is_public BOOLEAN;
    quest_creator UUID;
BEGIN
    -- Get user's organization
    SELECT organization_id INTO user_org_id
    FROM users WHERE id = user_id_input;

    -- Get quest details
    SELECT organization_id, is_public, created_by
    INTO quest_org_id, quest_is_public, quest_creator
    FROM quests WHERE id = quest_id_input;

    -- Check access rules
    RETURN (
        quest_is_public = true
        OR quest_creator = user_id_input
        OR quest_org_id = user_org_id
        OR quest_org_id = '00000000-0000-0000-0000-000000000001'::uuid -- Optio quests
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- 8. ADD UPDATED_AT TRIGGER FOR ORGANIZATIONS
-- ============================================

CREATE OR REPLACE FUNCTION update_organizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_organizations_updated_at();

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

-- Verification queries (run these to verify migration success)
-- SELECT * FROM organizations;
-- SELECT COUNT(*) FROM users WHERE organization_id IS NULL; -- Should be 0
-- SELECT COUNT(*) FROM quests WHERE organization_id IS NULL; -- Should be 0
-- SELECT get_organization_by_domain('ignite.optioeducation.com');
