-- Migration: Fix RLS policies for org_role system
-- Date: 2026-01-12
-- Purpose: Update RLS policies to use effective role (org_role for org_managed users)
--          and replace invalid 'admin' role references with 'superadmin'

-- =============================================================================
-- Part 1: Create helper function for effective role resolution
-- =============================================================================

CREATE OR REPLACE FUNCTION get_effective_role(user_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_record RECORD;
BEGIN
    SELECT role, org_role INTO user_record
    FROM users
    WHERE id = user_id;

    IF user_record.role IS NULL THEN
        RETURN 'student';  -- Default
    END IF;

    -- Superadmin always returns superadmin
    IF user_record.role = 'superadmin' THEN
        RETURN 'superadmin';
    END IF;

    -- For org_managed users, return their org_role
    IF user_record.role = 'org_managed' AND user_record.org_role IS NOT NULL THEN
        RETURN user_record.org_role;
    END IF;

    -- Otherwise return the platform role
    RETURN user_record.role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================================
-- Part 2: Create admin check helper function
-- This replaces role = 'admin' checks with proper superadmin/org_admin checks
-- =============================================================================

CREATE OR REPLACE FUNCTION is_admin_user(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    eff_role TEXT;
BEGIN
    eff_role := get_effective_role(user_id);
    RETURN eff_role IN ('superadmin', 'org_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================================
-- Part 3: Create superadmin check helper function
-- =============================================================================

CREATE OR REPLACE FUNCTION is_superadmin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users
        WHERE id = user_id AND role = 'superadmin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================================
-- Part 4: Create org_admin check helper function
-- =============================================================================

CREATE OR REPLACE FUNCTION is_org_admin_user(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    eff_role TEXT;
BEGIN
    eff_role := get_effective_role(user_id);
    RETURN eff_role = 'org_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================================
-- Part 5: Create advisor check helper function
-- =============================================================================

CREATE OR REPLACE FUNCTION is_advisor_user(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    eff_role TEXT;
BEGIN
    eff_role := get_effective_role(user_id);
    RETURN eff_role IN ('advisor', 'superadmin', 'org_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================================
-- Part 6: Update key RLS policies to use effective role
-- Note: These policies are commonly referenced and need the effective role logic
-- =============================================================================

-- Update quests policies for admin access
DROP POLICY IF EXISTS "admin_full_access_quests" ON quests;
CREATE POLICY "admin_full_access_quests" ON quests
FOR ALL
USING (
    is_superadmin(auth.uid())
    OR (
        is_org_admin_user(auth.uid())
        AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    )
);

-- Update user_quest_tasks policies for admin access
DROP POLICY IF EXISTS "admin_full_access_user_quest_tasks" ON user_quest_tasks;
CREATE POLICY "admin_full_access_user_quest_tasks" ON user_quest_tasks
FOR ALL
USING (
    is_superadmin(auth.uid())
    OR (
        is_org_admin_user(auth.uid())
        AND EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = user_quest_tasks.user_id
            AND u.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
        )
    )
);

-- Update quest_task_completions policies for admin/advisor access
DROP POLICY IF EXISTS "admin_advisor_access_completions" ON quest_task_completions;
CREATE POLICY "admin_advisor_access_completions" ON quest_task_completions
FOR ALL
USING (
    is_superadmin(auth.uid())
    OR is_advisor_user(auth.uid())
);

-- =============================================================================
-- Part 7: Update organizations table policies
-- =============================================================================

DROP POLICY IF EXISTS "admin_full_access_organizations" ON organizations;
CREATE POLICY "admin_full_access_organizations" ON organizations
FOR ALL
USING (is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "org_admin_read_own_org" ON organizations;
CREATE POLICY "org_admin_read_own_org" ON organizations
FOR SELECT
USING (
    id = (SELECT organization_id FROM users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "org_admin_update_own_org" ON organizations;
CREATE POLICY "org_admin_update_own_org" ON organizations
FOR UPDATE
USING (
    is_org_admin_user(auth.uid())
    AND id = (SELECT organization_id FROM users WHERE id = auth.uid())
);

-- =============================================================================
-- Part 8: Update users table policies for org_managed role system
-- =============================================================================

-- Drop old policies that use 'admin' role
DROP POLICY IF EXISTS "admin_all_users" ON users;
DROP POLICY IF EXISTS "admin_read_users" ON users;
DROP POLICY IF EXISTS "admin_update_users" ON users;

-- Superadmin can do everything
CREATE POLICY "superadmin_full_access_users" ON users
FOR ALL
USING (is_superadmin(auth.uid()));

-- Org admins can read/update users in their org
DROP POLICY IF EXISTS "org_admin_read_org_users" ON users;
CREATE POLICY "org_admin_read_org_users" ON users
FOR SELECT
USING (
    is_org_admin_user(auth.uid())
    AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "org_admin_update_org_users" ON users;
CREATE POLICY "org_admin_update_org_users" ON users
FOR UPDATE
USING (
    is_org_admin_user(auth.uid())
    AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND id != auth.uid()  -- Cannot modify own record (except own profile)
    AND role != 'superadmin'  -- Cannot modify superadmin
);

-- Users can read their own data
DROP POLICY IF EXISTS "users_read_own" ON users;
CREATE POLICY "users_read_own" ON users
FOR SELECT
USING (id = auth.uid());

-- Users can update their own profile (limited fields handled by application)
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
FOR UPDATE
USING (id = auth.uid());

-- =============================================================================
-- Part 9: Grant execute permissions on helper functions
-- =============================================================================

GRANT EXECUTE ON FUNCTION get_effective_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_superadmin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_org_admin_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_advisor_user(UUID) TO authenticated;

-- =============================================================================
-- Part 10: Add index for performance on org_role lookups
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_org_role ON users(org_role) WHERE org_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role_org_role ON users(role, org_role);

-- =============================================================================
-- End of migration
-- =============================================================================
