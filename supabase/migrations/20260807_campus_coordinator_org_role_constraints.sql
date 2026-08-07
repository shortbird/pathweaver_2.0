-- Let the database know about the campus coordinator role.
--
-- The role shipped on 2026-08-04 in application code only: it is in `OrgRole`,
-- in `sis_roles.STAFF_ROLES`/`ADMIN_ROLES`, in `sis_service.ASSIGNABLE_ROLES`
-- and `STAFF_ORG_ROLES`, and on 2026-08-06 it got the endpoints that assign it.
-- Nothing ever told Postgres. Both role CHECK constraints on `users` still list
-- the five roles from January/February 2026:
--
--   valid_org_role   CHECK (org_role IS NULL OR org_role IN (...))   -- 20260112
--   valid_org_roles  CHECK (validate_org_roles(org_roles))           -- 20260203
--
-- So every attempt to actually make somebody a coordinator — via
-- PUT /api/sis/staff/<id>/roles or PATCH /api/sis/users/<id>/role — passed
-- application validation and then died at the write:
--
--   APIError: new row for relation "users" violates check constraint
--   "valid_org_roles"
--
-- which surfaced as a 500 in Sentry rather than as anything the admin could
-- read. The role was assignable everywhere except the one place that counts.
--
-- Both constraints widen by exactly one value. Every previously-allowed role
-- stays allowed, so this cannot reject a row that exists today, and neither
-- re-add can fail validation.
--
-- campus_coordinator remains ORG-ONLY: it is deliberately absent from
-- users.role's constraints (users_role_check / valid_role_check), which are
-- untouched here. There is no platform campus coordinator.

BEGIN;

-- ── org_roles (JSONB array, the column the code actually writes) ─────────────
CREATE OR REPLACE FUNCTION validate_org_roles(roles JSONB)
RETURNS BOOLEAN AS $func$
DECLARE
    valid_roles TEXT[] := ARRAY['student', 'parent', 'advisor', 'org_admin',
                                'campus_coordinator', 'observer'];
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

-- The constraint calls the function, so replacing the body above is already
-- enough for new writes. Re-adding it revalidates every existing row, which is
-- how we find out now — rather than on somebody's next save — if any row is
-- already out of step with the list.
ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_org_roles;
ALTER TABLE users ADD CONSTRAINT valid_org_roles CHECK (validate_org_roles(org_roles));

-- ── org_role (the legacy single-value column, still written alongside) ───────
ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_org_role;
ALTER TABLE users ADD CONSTRAINT valid_org_role
CHECK (org_role IS NULL OR org_role IN ('student', 'parent', 'advisor',
                                        'org_admin', 'campus_coordinator',
                                        'observer'));

COMMENT ON COLUMN users.org_role IS
    'Organization-specific role. Only used when role=org_managed. Values: '
    'student, parent, advisor, org_admin, campus_coordinator, observer';

COMMIT;

-- Verification
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.users'::regclass
  AND conname IN ('valid_org_role', 'valid_org_roles');

SELECT validate_org_roles('["campus_coordinator", "parent"]'::jsonb) AS should_be_true,
       validate_org_roles('["not_a_role"]'::jsonb) AS should_be_false;
