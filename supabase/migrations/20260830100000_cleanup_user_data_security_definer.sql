-- Account deletion has still never completed in production: account_deletion_log
-- holds no row with deletion_completed_at (checked 2026-08-30), and Sentry
-- OPTIO-BACKEND-75/76 kept firing daily after 20260827100000 cleared the two
-- blockers it found. The next one is not a constraint. GoTrue's own log for the
-- 2026-08-30 09:00 sweep:
--
--   DELETE /admin/users/9f101d5d-...   500
--   ERROR: permission denied for table user_skill_xp (SQLSTATE 42501)
--
-- on_auth_user_delete fires cleanup_user_data() BEFORE DELETE ON auth.users.
-- GoTrue issues that delete as supabase_auth_admin, the function is SECURITY
-- INVOKER, and supabase_auth_admin holds no grants on public.* -- so the first
-- statement in the body (DELETE FROM public.user_skill_xp) is refused, and with
-- it the whole delete. Every deletion that reaches auth through the API fails
-- this way. A direct DELETE as postgres succeeds, which is why the previous
-- migration's rolled-back probe (run as postgres) found nothing left to fix.
--
-- Its sibling sync_auth_user_deletion() is already SECURITY DEFINER for the
-- same reason. Match it. The body is unchanged: every statement is keyed on
-- OLD.id, so the definer's privileges cannot reach another user's rows. The
-- function is owned by postgres and cannot be called directly (trigger
-- functions only run from a trigger), so there is nothing new to grant or
-- revoke.

ALTER FUNCTION public.cleanup_user_data() SECURITY DEFINER;
ALTER FUNCTION public.cleanup_user_data() SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.cleanup_user_data() IS
  'BEFORE DELETE ON auth.users. SECURITY DEFINER on purpose: GoTrue issues the '
  'delete as supabase_auth_admin, which has no grants on public tables, and as '
  'SECURITY INVOKER the first statement failed with 42501 so no account could '
  'ever be erased (Sentry OPTIO-BACKEND-75/76, 2026-08-30). Do not revert.';
