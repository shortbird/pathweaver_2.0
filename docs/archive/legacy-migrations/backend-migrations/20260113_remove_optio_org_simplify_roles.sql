-- Migration: Remove Optio organization and simplify role system
-- Date: 2026-01-13
-- Purpose:
--   1. Platform users have organization_id = NULL and direct roles
--   2. Organization users have organization_id set and role = 'org_managed'
--   3. Remove the "Optio" organization which was causing confusion

-- =============================================================================
-- Part 1: Allow NULL organization_id for platform users
-- =============================================================================

ALTER TABLE users ALTER COLUMN organization_id DROP NOT NULL;

-- =============================================================================
-- Part 2: Migrate Optio organization users to platform users
-- =============================================================================

-- Move all Optio org users to NULL org with direct roles
-- For org_managed users, use their org_role as the new role
-- For users with direct roles, keep them
UPDATE users
SET
    organization_id = NULL,
    role = COALESCE(org_role, role),
    org_role = NULL
WHERE organization_id = 'e88b7aae-b9ad-4c71-bc3a-eef0701f5852'
  AND role != 'superadmin';

-- Superadmin also becomes platform user (no org)
UPDATE users
SET organization_id = NULL
WHERE role = 'superadmin';

-- Fix any org users that have direct roles (should be org_managed)
UPDATE users
SET
    org_role = role,
    role = 'org_managed'
WHERE organization_id IS NOT NULL
  AND role != 'org_managed'
  AND role != 'superadmin';

-- =============================================================================
-- Part 3: Add constraints for org_managed consistency
-- =============================================================================

-- org_managed MUST have org_role AND organization_id
ALTER TABLE users DROP CONSTRAINT IF EXISTS org_managed_requires_org;
ALTER TABLE users ADD CONSTRAINT org_managed_requires_org
CHECK (
    role != 'org_managed'
    OR (org_role IS NOT NULL AND organization_id IS NOT NULL)
);

-- Non-org_managed users should NOT have org_role set
ALTER TABLE users DROP CONSTRAINT IF EXISTS direct_role_no_org_role;
ALTER TABLE users ADD CONSTRAINT direct_role_no_org_role
CHECK (
    role = 'org_managed'
    OR org_role IS NULL
);

-- =============================================================================
-- Part 4: Update related tables before deleting Optio org
-- =============================================================================

-- Quests owned by Optio org become platform content (NULL org)
UPDATE quests
SET organization_id = NULL
WHERE organization_id = 'e88b7aae-b9ad-4c71-bc3a-eef0701f5852';

-- Courses owned by Optio org become platform content (NULL org)
UPDATE courses
SET organization_id = NULL
WHERE organization_id = 'e88b7aae-b9ad-4c71-bc3a-eef0701f5852';

-- Delete org access records for Optio (no longer needed)
DELETE FROM organization_quest_access
WHERE organization_id = 'e88b7aae-b9ad-4c71-bc3a-eef0701f5852';

DELETE FROM organization_course_access
WHERE organization_id = 'e88b7aae-b9ad-4c71-bc3a-eef0701f5852';

-- Delete any pending invitations for Optio org
DELETE FROM org_invitations
WHERE organization_id = 'e88b7aae-b9ad-4c71-bc3a-eef0701f5852';

-- =============================================================================
-- Part 5: Delete the Optio organization
-- =============================================================================

DELETE FROM organizations
WHERE id = 'e88b7aae-b9ad-4c71-bc3a-eef0701f5852';

-- =============================================================================
-- Part 6: Update get_effective_role function for new logic
-- =============================================================================

-- Platform users (NULL org) use role directly
-- Org users use org_role
CREATE OR REPLACE FUNCTION get_effective_role(user_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_record RECORD;
BEGIN
    SELECT role, org_role, organization_id INTO user_record
    FROM users WHERE id = user_id;

    IF user_record IS NULL THEN
        RETURN NULL;
    END IF;

    -- Superadmin always returns superadmin
    IF user_record.role = 'superadmin' THEN
        RETURN 'superadmin';
    END IF;

    -- Platform users (no org) use role directly
    IF user_record.organization_id IS NULL THEN
        RETURN user_record.role;
    END IF;

    -- Org users use org_role
    IF user_record.role = 'org_managed' AND user_record.org_role IS NOT NULL THEN
        RETURN user_record.org_role;
    END IF;

    RETURN 'student'; -- fallback
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================================
-- Part 7: Update RLS policies to handle NULL organization_id
-- =============================================================================

-- Update org_admin_read_org_users to handle platform users correctly
DROP POLICY IF EXISTS "org_admin_read_org_users" ON users;
CREATE POLICY "org_admin_read_org_users" ON users
FOR SELECT
USING (
    is_org_admin_user(auth.uid())
    AND organization_id IS NOT NULL
    AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);

-- Update org_admin_update_org_users to handle platform users correctly
DROP POLICY IF EXISTS "org_admin_update_org_users" ON users;
CREATE POLICY "org_admin_update_org_users" ON users
FOR UPDATE
USING (
    is_org_admin_user(auth.uid())
    AND organization_id IS NOT NULL
    AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND id != auth.uid()
    AND role != 'superadmin'
);

-- Update quests policy to handle platform content
DROP POLICY IF EXISTS "admin_full_access_quests" ON quests;
CREATE POLICY "admin_full_access_quests" ON quests
FOR ALL
USING (
    is_superadmin(auth.uid())
    OR (
        is_org_admin_user(auth.uid())
        AND (
            -- Org-specific quests in admin's org
            organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
            -- Or platform quests (NULL org) for any admin
            OR organization_id IS NULL
        )
    )
);

-- =============================================================================
-- Part 8: Add index for platform user queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_platform ON users(id) WHERE organization_id IS NULL;

-- =============================================================================
-- Part 9: Documentation
-- =============================================================================

COMMENT ON COLUMN users.organization_id IS 'Organization UUID. NULL for platform users (not in any org).';
COMMENT ON COLUMN users.role IS 'User role. Platform users have direct roles (student, parent, etc). Org users have org_managed.';
COMMENT ON COLUMN users.org_role IS 'Organization-specific role. Only set when role=org_managed.';

-- =============================================================================
-- End of migration
-- =============================================================================
