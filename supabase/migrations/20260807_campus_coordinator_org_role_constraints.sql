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


-- ════════════════════════════════════════════════════════════════════════════
-- Part 2: stop users.is_org_admin drifting away from the role columns.
-- ════════════════════════════════════════════════════════════════════════════
--
-- `is_org_admin` is a boolean from the January 2026 org_role migration that
-- duplicates what org_role/org_roles already say. It is not decoration — on its
-- own it grants organization admin access in four places:
--
--   require_school_admin  (utils/auth/decorators.py) — `... or is_org_admin_flag`
--   require_org_admin     (same file) — same
--   require_advisor       (same file) — advisor tier
--   PrivateRoute.jsx      (frontend) — `user?.is_org_admin && allowedRoles.includes('org_admin')`
--
-- Roughly fifteen code paths write org_role/org_roles. Only four of them also
-- write is_org_admin. Every other one leaves the boolean holding whatever it
-- held before, in both directions:
--
--   demotion  — sis_service.set_staff_roles turns an org_admin into a campus
--               coordinator, the flag stays TRUE, and they keep the admin
--               access (finance included) that the coordinator role exists to
--               withhold. This is the demotion path iCreate will actually use.
--   promotion — the same function makes somebody an org_admin, the flag stays
--               FALSE, and the admin user list (which filters on the flag,
--               user_repository.py) does not show them.
--
-- Rather than add the write to fifteen call sites and re-add it to the
-- sixteenth, derive it once here, where nothing can forget. A BEFORE trigger
-- costs no query and makes the boolean a cached read of the role columns.
--
-- The four call sites that do set the flag today all set it in the same payload
-- as the roles it is derived from, and all agree with this derivation — so the
-- trigger confirms their writes rather than fighting them. `role = 'org_admin'`
-- is in the derivation because users.role may legitimately hold it for a
-- platform-level org admin; leaving it out would clear the flag for them.

CREATE OR REPLACE FUNCTION sync_is_org_admin()
RETURNS TRIGGER AS $func$
BEGIN
    NEW.is_org_admin :=
        NEW.role = 'org_admin'
        OR NEW.org_role = 'org_admin'
        OR COALESCE(NEW.org_roles ? 'org_admin', FALSE);
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_is_org_admin_trigger ON users;
CREATE TRIGGER sync_is_org_admin_trigger
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION sync_is_org_admin();

COMMENT ON COLUMN users.is_org_admin IS
    'Derived from role/org_role/org_roles by the sync_is_org_admin trigger. '
    'Do not write it directly — write the role columns and read this back. '
    'Kept because four auth gates and the admin user list still read it.';

-- The rows that already drifted. Same derivation as the trigger and no
-- exceptions, so the backfill and every write from here on agree.
--
-- Superadmins are included and will mostly go FALSE (they are platform users:
-- org_role and org_roles are NULL for them). They lose nothing — every gate
-- above checks role = 'superadmin' before it ever looks at this flag, and the
-- one other reader, the admin user list's org_admin filter, is a list of org
-- admins, which a superadmin is not.
UPDATE users
SET is_org_admin = (
        role = 'org_admin'
        OR org_role = 'org_admin'
        OR COALESCE(org_roles ? 'org_admin', FALSE)
    )
WHERE is_org_admin IS DISTINCT FROM (
        role = 'org_admin'
        OR org_role = 'org_admin'
        OR COALESCE(org_roles ? 'org_admin', FALSE)
    );

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.users'::regclass
  AND conname IN ('valid_org_role', 'valid_org_roles');

SELECT validate_org_roles('["campus_coordinator", "parent"]'::jsonb) AS should_be_true,
       validate_org_roles('["not_a_role"]'::jsonb) AS should_be_false;

-- Anyone still holding admin access they should not have, or missing access
-- they should. Expected: zero rows.
SELECT id, email, role, org_role, org_roles, is_org_admin
FROM users
WHERE is_org_admin IS DISTINCT FROM (
        role = 'org_admin'
        OR org_role = 'org_admin'
        OR COALESCE(org_roles ? 'org_admin', FALSE)
    );
