-- Migration: Add org_role system for organization-managed users
-- This separates platform roles from organization roles

-- Step 1: Add org_role column for organization-specific roles
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_role TEXT;

-- Step 2: Drop ALL existing role constraints first
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_role;
ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_valid_role;

-- Step 3: Add new role constraint with org_managed included
ALTER TABLE users ADD CONSTRAINT valid_role_check
CHECK (role IN ('superadmin', 'org_admin', 'student', 'parent', 'advisor', 'observer', 'org_managed'));

-- Step 4: Add constraint for valid org_role values
-- org_role can be: student, parent, advisor, org_admin, observer (NOT superadmin or org_managed)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_org_role'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT valid_org_role
        CHECK (org_role IS NULL OR org_role IN ('student', 'parent', 'advisor', 'org_admin', 'observer'));
    END IF;
END $$;

-- Step 5: Migrate existing org users to the new system
-- Users with is_org_admin=true become org_managed with org_role='org_admin'
UPDATE users
SET org_role = 'org_admin', role = 'org_managed'
WHERE organization_id IS NOT NULL
  AND is_org_admin = true
  AND role != 'superadmin';

-- Other org users get their current role moved to org_role
UPDATE users
SET org_role = role, role = 'org_managed'
WHERE organization_id IS NOT NULL
  AND role NOT IN ('superadmin', 'org_managed')
  AND org_role IS NULL;

-- Step 6: Create index for org_role queries
CREATE INDEX IF NOT EXISTS idx_users_org_role ON users(org_role) WHERE org_role IS NOT NULL;

-- Step 7: Create a function to get effective role (for use in RLS policies)
CREATE OR REPLACE FUNCTION get_effective_role(user_record users)
RETURNS TEXT AS $$
BEGIN
    -- Superadmin always returns superadmin
    IF user_record.role = 'superadmin' THEN
        RETURN 'superadmin';
    END IF;

    -- org_managed users use their org_role
    IF user_record.role = 'org_managed' AND user_record.org_role IS NOT NULL THEN
        RETURN user_record.org_role;
    END IF;

    -- Otherwise return platform role
    RETURN user_record.role;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 8: Add comment for documentation
COMMENT ON COLUMN users.org_role IS 'Organization-specific role. Only used when role=org_managed. Values: student, parent, advisor, org_admin, observer';
COMMENT ON COLUMN users.role IS 'Platform role. org_managed indicates role is controlled by organization via org_role column';
