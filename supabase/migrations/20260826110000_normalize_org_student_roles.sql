-- Org students created by a parent were invisible to half the platform's counts.
--
-- iCreate, 2026-08-27: "The people page, if I sort by students only, says 213
-- students. The dashboard says 219 students and one of the CCs said she saw we
-- somewhere on Optio that we were at 188 students. Which one is actually
-- accurate."
--
-- sis_service.is_student() accepts role='student' OR org_role='student' OR
-- 'student' in org_roles, but a good number of endpoints filter on org_role
-- alone. A child created through the parent flow was written with role='student'
-- and no org_role at all, so every org_role-only query silently skipped them.
-- At iCreate that was exactly 52 accounts: 167 by org_role, 219 by the helper.
--
-- The roster-import path already writes the full shape for dependents, so 133 of
-- iCreate's dependents are role='org_managed' with org_role='student' and behave
-- correctly. This brings the other 52 (plus 3 at Gryffin and 1 at Optio Academy)
-- onto that same proven shape rather than inventing a new one.
--
-- is_org_admin is deliberately not written here: the sync_is_org_admin trigger
-- derives it from these columns.

UPDATE public.users
SET role = 'org_managed',
    org_role = 'student',
    org_roles = '["student"]'::jsonb
WHERE organization_id IS NOT NULL
  AND role = 'student'
  AND org_role IS NULL
  AND (org_roles IS NULL OR org_roles = '[]'::jsonb);
