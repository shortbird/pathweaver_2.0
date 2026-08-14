-- Security audit remediation (2026-08-14).
--
-- Two findings that land in the database:
--   1. consultation_requests was readable by every signed-in account.
--   2. A SECURITY DEFINER trigger function was callable over the REST API, and
--      six functions ran with a mutable search_path.
--
-- Session revocation is deliberately NOT here. The audit's first draft called
-- for a users.token_version column, but `users.last_logout_at` already does
-- that job — it just wasn't reachable from the impersonation refresh path,
-- which passed datetime.now() into the comparison. That is fixed in
-- backend/utils/session_manager.py, with no schema change: two revocation
-- mechanisms that can disagree are worse than one that works.

-- ---------------------------------------------------------------------------
-- 1. consultation_requests: drop the read-everything policy
-- ---------------------------------------------------------------------------
-- "Allow authenticated reads" was USING (true) for the `authenticated` role.
-- The anon key ships in the web bundle by design, so any user with a login
-- could read every consultation request — names, emails, and whatever else
-- families typed into the enquiry form — straight off PostgREST.
--
-- No replacement policy: the backend reads this table through the service-role
-- client, which bypasses RLS. That leaves the table RLS-enabled with no
-- policies, i.e. deny-by-default, matching the 93 tables already in that state.
drop policy if exists "Allow authenticated reads" on public.consultation_requests;

-- Same shape, lower stakes: a table documenting the system's own security
-- caveats has no reason to be world-readable over the API.
drop policy if exists "Public read access to security documentation"
  on public.security_warnings_documentation;

-- ---------------------------------------------------------------------------
-- 2a. Revoke REST access to the SECURITY DEFINER *trigger* function
-- ---------------------------------------------------------------------------
-- A trigger function is invoked by its trigger, never by a client, but it
-- inherited EXECUTE for anon/authenticated from the default Data API grants —
-- which publishes it as /rest/v1/rpc/<name> running with the definer's rights.
-- Revoke from PUBLIC first, and mean it: functions grant EXECUTE to PUBLIC by
-- default and anon/authenticated inherit it from there, so revoking from those
-- two roles alone is a silent no-op (verified — the RPC stayed callable).
-- Trigger invocation does not check EXECUTE, so the trigger keeps working.
revoke all on function public.enforce_publication_consent_provenance() from public;
revoke all on function public.enforce_publication_consent_provenance()
  from anon, authenticated;

-- DELIBERATELY NOT REVOKED: get_user_org_id, is_superadmin, is_org_admin_user,
-- is_advisor_user, is_minor_for_publication. These are also SECURITY DEFINER
-- and also reachable as RPC, but 12 RLS policies call them, and a policy
-- expression is evaluated as the *calling* role — revoking EXECUTE from
-- authenticated would make every one of those policies error out and deny, i.e.
-- lock the database. They report on the caller's own identity rather than
-- returning other users' data, so leaving them callable is a much smaller
-- problem than the outage that removing them would cause.

-- ---------------------------------------------------------------------------
-- 2b. Pin the mutable search_paths
-- ---------------------------------------------------------------------------
-- A caller-influenced search_path lets an unqualified name inside a function
-- resolve to an attacker's object. All 47 SECURITY DEFINER functions were
-- already pinned; these six were missed. They are SECURITY INVOKER, so the
-- escalation risk is bounded by the caller's own rights — worth fixing, not
-- urgent.
--
-- Pinned to `public, pg_temp` rather than the stricter `''`: these bodies use
-- unqualified table names, and `''` would break them at runtime. Fixing the
-- *mutability* is the actual finding; pg_temp goes last so a temporary table
-- can never shadow a real one.
alter function public.is_minor(uuid)                      set search_path = public, pg_temp;
alter function public.get_parent_for_minor(uuid)          set search_path = public, pg_temp;
alter function public.validate_org_roles(jsonb)           set search_path = public, pg_temp;
alter function public.generate_portfolio_slug()           set search_path = public, pg_temp;
alter function public.sync_is_org_admin()                 set search_path = public, pg_temp;
alter function public.update_class_attendance_updated_at() set search_path = public, pg_temp;
