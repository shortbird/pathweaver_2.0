-- Fix users created by the org bulk CSV import writing the literal role
-- ('student'/'parent'/'advisor'/'org_admin'/'observer') into users.role while
-- organization_id was set, instead of the org_managed pattern
-- (role = 'org_managed', actual role in org_role) used by every other add path.
-- Those rows are invisible to any query filtering on org_role (parent-connection
-- lists, roster pickers, People tab role filters).
--
-- Scope guard: only touches rows that have an organization_id, a literal org
-- role in `role`, and no org_role yet. Platform users (organization_id IS NULL)
-- and superadmin are untouched.

UPDATE public.users
SET org_role = role,
    role = 'org_managed'
WHERE organization_id IS NOT NULL
  AND role IN ('student', 'parent', 'advisor', 'org_admin', 'observer')
  AND org_role IS NULL;
