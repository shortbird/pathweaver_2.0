-- student_access_logs.accessor_role has to know about every role that can read
-- a student's record.
--
-- Sentry OPTIO-BACKEND-6K, 2026-08-17:
--
--     new row for relation "student_access_logs" violates check constraint
--     "valid_accessor_role"  (23514)
--       routes/parent/child_overview.py, in get_child_overview
--
-- valid_accessor_role has held the same five values since 2025-12-26:
-- student, parent, advisor, admin, observer. The platform has seven real roles
-- and 'admin' is not one of them. So an access by a superadmin, an org_admin,
-- or a campus_coordinator -- the three most privileged readers on the system --
-- failed the CHECK and was dropped. AccessLogger swallows its own failures by
-- design (a logging outage must not break the read), which is why this ran for
-- eight months as a warning nobody saw.
--
-- The damage is in the audit trail, not the request: 2,320 rows exist and every
-- one is 'advisor' or 'parent'. Every org-admin class roster view -- a screen
-- that shows allergies and medical flags -- and every superadmin record read
-- went unlogged. That is the FERPA disclosure report having no entry for the
-- accounts that can see everything.
--
-- The allowed set below is UserRole + OrgRole (minus org_managed, which
-- get_effective_role always resolves to the role the person actually acted in)
-- plus the three sentinels AccessLogger falls back to when it cannot resolve
-- one. The sentinels are deliberate: an unresolvable accessor is the case where
-- an audit row matters most, so it must not be the case that fails to write.
--
-- backend/tests/test_access_log_role_constraint.py fails CI if this list and
-- the role enums drift apart again.

ALTER TABLE public.student_access_logs
    DROP CONSTRAINT IF EXISTS valid_accessor_role;

ALTER TABLE public.student_access_logs
    ADD CONSTRAINT valid_accessor_role CHECK (accessor_role IN (
        -- Platform + organization roles (utils/roles.py: UserRole, OrgRole)
        'student',
        'parent',
        'advisor',
        'observer',
        'org_admin',
        'campus_coordinator',
        'superadmin',
        -- Sentinels (utils/access_logger.py: SENTINEL_ACCESSOR_ROLES)
        'public',   -- unauthenticated read of a public portfolio
        'system',   -- no request context (jobs, cron, backfills)
        'unknown'   -- accessor row missing, or a role this list does not know
    ));

COMMENT ON COLUMN public.student_access_logs.accessor_role IS
    'Effective role of the accessor at time of access, or a sentinel '
    '(public/system/unknown) when it could not be resolved. Kept in step with '
    'utils/roles.py by backend/tests/test_access_log_role_constraint.py.';
