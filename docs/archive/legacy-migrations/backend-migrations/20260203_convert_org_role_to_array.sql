-- Migration: Convert org_role from VARCHAR to JSONB array
-- Purpose: Allow users to have multiple org roles (e.g., parent + advisor)
-- Date: 2026-02-03
-- Status: APPLIED

-- Step 1: Add new JSONB column for multiple roles
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_roles JSONB DEFAULT NULL;

-- Step 2: Migrate existing data from org_role (VARCHAR) to org_roles (JSONB array)
UPDATE users
SET org_roles = jsonb_build_array(org_role)
WHERE org_role IS NOT NULL AND org_roles IS NULL;

-- Step 3: Create validation function for org_roles (CHECK constraints can't have subqueries)
CREATE OR REPLACE FUNCTION validate_org_roles(roles JSONB)
RETURNS BOOLEAN AS $func$
DECLARE
    valid_roles TEXT[] := ARRAY['student', 'parent', 'advisor', 'org_admin', 'observer'];
    role_value TEXT;
BEGIN
    IF roles IS NULL THEN
        RETURN TRUE;
    END IF;
    IF jsonb_typeof(roles) <> 'array' THEN
        RETURN FALSE;
    END IF;
    FOR role_value IN SELECT jsonb_array_elements_text(roles)
    LOOP
        IF NOT (role_value = ANY(valid_roles)) THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    RETURN TRUE;
END;
$func$ LANGUAGE plpgsql IMMUTABLE;

-- Step 4: Add constraint using the validation function
ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_org_roles;
ALTER TABLE users ADD CONSTRAINT valid_org_roles CHECK (validate_org_roles(org_roles));

-- Step 5: Create index for efficient role lookups
CREATE INDEX IF NOT EXISTS idx_users_org_roles ON users USING GIN (org_roles);

-- Note: The old org_role column is kept for backward compatibility
-- It will be deprecated in a future migration once all code is updated
-- The new org_roles column takes precedence when set

-- Rollback script (save for reference):
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_org_roles;
-- DROP INDEX IF EXISTS idx_users_org_roles;
-- DROP FUNCTION IF EXISTS validate_org_roles(JSONB);
-- ALTER TABLE users DROP COLUMN IF EXISTS org_roles;

COMMENT ON COLUMN users.org_roles IS 'JSONB array of org roles. Allows multiple roles like ["parent", "advisor"]. Takes precedence over org_role when set.';
