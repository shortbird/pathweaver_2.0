-- Fix infinite recursion (Postgres 42P17) in the public.users RLS policies.
--
-- `users_select_consolidated` and `users_update_consolidated` each contained an
-- inline subquery against `users` from *within* a `users` policy:
--
--   organization_id = (SELECT u.organization_id FROM users u WHERE u.id = auth.uid())
--
-- Evaluating the users policy required querying users, which re-applied the same
-- policy -> infinite recursion. It surfaced as a 500 on any code path that read
-- `users` with an unauthenticated/anon client (e.g. GET /api/users/deletion-status
-- before its own fix), and is a latent landmine for any policy on another table
-- that subqueries `users`.
--
-- Fix: move the org-id lookup into a SECURITY DEFINER helper (same pattern as the
-- existing is_superadmin / is_org_admin_user helpers). SECURITY DEFINER runs as the
-- table owner, so RLS is not re-applied and the cycle is broken. The value returned
-- is identical to the old subquery (the caller looks up their own row, which they
-- can always see), so policy semantics are unchanged.

-- 1. Helper: the caller's organization_id, RLS-bypassing to avoid recursion.
CREATE OR REPLACE FUNCTION public.get_user_org_id(user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    org_id uuid;
BEGIN
    SELECT organization_id INTO org_id FROM public.users WHERE id = user_id;
    RETURN org_id;
END;
$function$;

-- 2. Recreate the SELECT policy, swapping the recursive subquery for the helper.
DROP POLICY IF EXISTS users_select_consolidated ON public.users;
CREATE POLICY users_select_consolidated ON public.users
  FOR SELECT TO public
  USING (
    (id = (SELECT auth.uid()))
    OR ((SELECT auth.role()) = 'service_role')
    OR is_superadmin((SELECT auth.uid()))
    OR (is_org_admin_user((SELECT auth.uid()))
        AND organization_id = public.get_user_org_id((SELECT auth.uid())))
    OR (managed_by_parent_id = (SELECT auth.uid()))
  );

-- 3. Recreate the UPDATE policy (USING + WITH CHECK use the same expression).
DROP POLICY IF EXISTS users_update_consolidated ON public.users;
CREATE POLICY users_update_consolidated ON public.users
  FOR UPDATE TO public
  USING (
    (id = (SELECT auth.uid()))
    OR (is_org_admin_user((SELECT auth.uid()))
        AND organization_id = public.get_user_org_id((SELECT auth.uid()))
        AND id <> (SELECT auth.uid())
        AND (role)::text <> 'superadmin')
    OR (managed_by_parent_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (id = (SELECT auth.uid()))
    OR (is_org_admin_user((SELECT auth.uid()))
        AND organization_id = public.get_user_org_id((SELECT auth.uid()))
        AND id <> (SELECT auth.uid())
        AND (role)::text <> 'superadmin')
    OR (managed_by_parent_id = (SELECT auth.uid()))
  );
