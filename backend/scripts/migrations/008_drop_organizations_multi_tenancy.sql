-- Migration 008: Drop Organizations Multi-Tenancy
-- Purpose: Remove organization-based multi-tenancy (subdomain) functionality
-- Date: 2025-01-07
-- Reason: Decision made to not use subdomains - all clients on main Optio domain

-- ============================================
-- 1. DROP RLS POLICIES THAT REFERENCE ORGANIZATIONS
-- ============================================

-- Drop organization-aware quest policies
DROP POLICY IF EXISTS "users_can_view_org_quests" ON quests;
DROP POLICY IF EXISTS "users_can_create_quests_in_org" ON quests;
DROP POLICY IF EXISTS "users_can_update_own_quests" ON quests;

-- Recreate simpler policies without organization logic
CREATE POLICY "users_can_view_quests" ON quests
    FOR SELECT
    USING (
        is_active = true
        AND (
            -- Public quests visible to all
            is_public = true
            OR
            -- User's own quests
            created_by = auth.uid()
        )
    );

CREATE POLICY "users_can_create_quests" ON quests
    FOR INSERT
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "users_can_update_own_quests" ON quests
    FOR UPDATE
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- ============================================
-- 2. DROP HELPER FUNCTIONS
-- ============================================

DROP FUNCTION IF EXISTS get_organization_by_domain(TEXT);
DROP FUNCTION IF EXISTS can_user_access_quest(UUID, UUID);
DROP FUNCTION IF EXISTS update_organizations_updated_at();

-- ============================================
-- 3. REMOVE ORGANIZATION_ID COLUMNS
-- ============================================

-- Drop foreign key constraints first
ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_organization_id_fkey;

ALTER TABLE quests
DROP CONSTRAINT IF EXISTS quests_organization_id_fkey;

-- Drop indexes
DROP INDEX IF EXISTS idx_users_organization_id;
DROP INDEX IF EXISTS idx_quests_organization_id;
DROP INDEX IF EXISTS idx_quests_org_public;

-- Drop columns
ALTER TABLE users
DROP COLUMN IF EXISTS organization_id;

ALTER TABLE quests
DROP COLUMN IF EXISTS organization_id;

-- ============================================
-- 4. DROP ORGANIZATIONS TABLE
-- ============================================

-- Drop indexes first
DROP INDEX IF EXISTS idx_organizations_full_domain;
DROP INDEX IF EXISTS idx_organizations_subdomain;
DROP INDEX IF EXISTS idx_organizations_slug;

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_organizations_updated_at ON organizations;

-- Drop table
DROP TABLE IF EXISTS organizations CASCADE;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

-- Verification queries (run these to verify migration success)
-- SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'organizations'; -- Should be 0
-- SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'organization_id'; -- Should be 0
-- SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'quests' AND column_name = 'organization_id'; -- Should be 0
