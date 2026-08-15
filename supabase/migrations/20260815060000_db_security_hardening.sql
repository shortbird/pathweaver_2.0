-- Database security hardening (security audit, 2026-08-15)
--
-- Addresses the WARN-level findings from Supabase's security advisor for
-- project vvfgxcykxjybtvpfzwyx. There were no ERROR-level findings; in
-- particular no public table is exposed without RLS.
--
-- ---------------------------------------------------------------------------
-- FINDING: five SECURITY DEFINER helpers are callable over the REST API by
-- anonymous visitors (advisor lints 0028 / 0029).
-- ---------------------------------------------------------------------------
--
-- public.get_user_org_id, is_advisor_user, is_minor_for_publication,
-- is_org_admin_user and is_superadmin are RLS helper predicates. Because they
-- live in `public` -- the schema PostgREST exposes -- and carry EXECUTE for
-- `anon` and `authenticated`, anyone on the internet could call them:
--
--     POST /rest/v1/rpc/is_minor_for_publication  {"p_user_id": "<uuid>"}
--
-- and learn, for an arbitrary user id, whether that account is a minor, a
-- superadmin, an org admin, or which organization it belongs to. It requires
-- knowing a uuid, so it is an information oracle rather than a bulk leak --
-- but `is_minor_for_publication` answering "is this child a minor" to
-- unauthenticated callers is exactly the kind of thing this platform should
-- not do.
--
-- WHY NOT SIMPLY REVOKE EXECUTE:
-- Postgres evaluates an RLS policy expression as the *querying* role, and
-- permission checks apply to functions called inside it. These five functions
-- are referenced by twelve live policies on users, quests, user_quest_tasks,
-- quest_task_completions, organizations, observer_invitation_students and
-- quest_template_tasks. The backend's get_user_client() (backend/database.py:202)
-- talks to PostgREST with the anon key plus the caller's JWT, so those queries
-- run as `authenticated` and DO need EXECUTE. Revoking it outright would break
-- every RLS-enforced read in the application.
--
-- THE FIX:
-- Move the helpers into a `private` schema that PostgREST does not expose, and
-- point the policies at them there. The API roles keep EXECUTE (so policy
-- evaluation still works) but gain no RPC surface, because PostgREST only
-- exposes schemas on its configured list (public, graphql_public).
--
-- The public.* copies are REVOKEd from the API roles but deliberately NOT
-- dropped: public.enforce_publication_consent_provenance (a SECURITY DEFINER
-- trigger owned by postgres, which therefore still holds EXECUTE as owner)
-- calls one of them. Dropping is a follow-up once that trigger is repointed.

begin;

create schema if not exists private;

comment on schema private is
  'Internal helpers that must never be reachable over PostgREST. Nothing here '
  'may be added to the API''s exposed-schema list.';

-- Only the API roles need to *evaluate* these during RLS; nobody needs to
-- create objects here.
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Private copies of the five helpers (bodies unchanged from public.*)
-- ---------------------------------------------------------------------------

create or replace function private.get_user_org_id(user_id uuid)
returns uuid
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
    org_id uuid;
begin
    select organization_id into org_id from public.users where id = user_id;
    return org_id;
end;
$function$;

create or replace function private.is_superadmin(user_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
    return exists (
        select 1 from public.users
        where id = user_id and role = 'superadmin'
    );
end;
$function$;

create or replace function private.is_advisor_user(user_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
    eff_role text;
begin
    eff_role := public.get_effective_role(user_id);
    return eff_role in ('advisor', 'superadmin', 'org_admin');
end;
$function$;

create or replace function private.is_org_admin_user(user_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
    eff_role text;
begin
    eff_role := public.get_effective_role(user_id);
    return eff_role = 'org_admin';
end;
$function$;

create or replace function private.is_minor_for_publication(p_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    (select case
       when u.is_dependent is true      then true
       when u.date_of_birth is null     then true   -- unknown age -> minor
       else ((current_date - u.date_of_birth)::numeric / 365.25) < 18
     end
     from public.users u
     where u.id = p_user_id),
    true)  -- no such user -> minor
$function$;

-- Required for policy evaluation under get_user_client(). Safe: the schema is
-- not exposed by PostgREST, so this grants no callable API surface.
grant execute on function private.get_user_org_id(uuid)          to anon, authenticated;
grant execute on function private.is_superadmin(uuid)            to anon, authenticated;
grant execute on function private.is_advisor_user(uuid)          to anon, authenticated;
grant execute on function private.is_org_admin_user(uuid)        to anon, authenticated;
grant execute on function private.is_minor_for_publication(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Repoint the twelve dependent policies at private.*
--    ALTER POLICY (not DROP/CREATE) so command and role bindings are preserved
--    exactly. Expressions are otherwise byte-for-byte the current definitions.
-- ---------------------------------------------------------------------------

alter policy users_admin_all on public.users
  using (
    private.is_superadmin((select auth.uid()))
    or (((select auth.jwt()) ->> 'role') = 'service_role')
  );

alter policy users_select_consolidated on public.users
  using (
    (id = (select auth.uid()))
    or ((select auth.role()) = 'service_role')
    or private.is_superadmin((select auth.uid()))
    or (private.is_org_admin_user((select auth.uid()))
        and organization_id = private.get_user_org_id((select auth.uid())))
    or (managed_by_parent_id = (select auth.uid()))
  );

alter policy users_update_consolidated on public.users
  using (
    (id = (select auth.uid()))
    or (private.is_org_admin_user((select auth.uid()))
        and organization_id = private.get_user_org_id((select auth.uid()))
        and id <> (select auth.uid())
        and role::text <> 'superadmin')
    or (managed_by_parent_id = (select auth.uid()))
  )
  with check (
    (id = (select auth.uid()))
    or (private.is_org_admin_user((select auth.uid()))
        and organization_id = private.get_user_org_id((select auth.uid()))
        and id <> (select auth.uid())
        and role::text <> 'superadmin')
    or (managed_by_parent_id = (select auth.uid()))
  );

alter policy admin_advisor_access_completions on public.quest_task_completions
  using (
    private.is_superadmin((select auth.uid()))
    or private.is_advisor_user((select auth.uid()))
  );

alter policy admin_full_access_quests on public.quests
  using (
    private.is_superadmin((select auth.uid()))
    or (private.is_org_admin_user((select auth.uid()))
        and (organization_id = (select u.organization_id from public.users u
                                where u.id = (select auth.uid()))
             or organization_id is null))
  );

alter policy admin_full_access_user_quest_tasks on public.user_quest_tasks
  using (
    private.is_superadmin((select auth.uid()))
    or (private.is_org_admin_user((select auth.uid()))
        and exists (
          select 1 from public.users u
          where u.id = user_quest_tasks.user_id
            and u.organization_id = (select users.organization_id from public.users
                                     where users.id = (select auth.uid()))
        ))
  );

alter policy org_admin_update_own_org on public.organizations
  using (
    private.is_org_admin_user((select auth.uid()))
    and id = (select users.organization_id from public.users
              where users.id = (select auth.uid()))
  );

alter policy organizations_select on public.organizations
  using (
    is_active = true
    or (private.is_org_admin_user((select auth.uid()))
        and id = (select users.organization_id from public.users
                  where users.id = (select auth.uid())))
    or private.is_superadmin((select auth.uid()))
  );

alter policy superadmin_all_observer_invitation_students on public.observer_invitation_students
  using (private.is_superadmin((select auth.uid())));

alter policy advisor_create_template_tasks on public.quest_template_tasks
  with check (
    private.is_superadmin((select auth.uid()))
    or private.is_advisor_user((select auth.uid()))
  );

alter policy advisor_delete_template_tasks on public.quest_template_tasks
  using (
    private.is_superadmin((select auth.uid()))
    or private.is_advisor_user((select auth.uid()))
  );

alter policy advisor_update_template_tasks on public.quest_template_tasks
  using (
    private.is_superadmin((select auth.uid()))
    or private.is_advisor_user((select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 3. Close the RPC surface on the public.* copies
-- ---------------------------------------------------------------------------

revoke execute on function public.get_user_org_id(uuid)          from anon, authenticated;
revoke execute on function public.is_superadmin(uuid)            from anon, authenticated;
revoke execute on function public.is_advisor_user(uuid)          from anon, authenticated;
revoke execute on function public.is_org_admin_user(uuid)        from anon, authenticated;
revoke execute on function public.is_minor_for_publication(uuid) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Revoke the latent SSRF primitive on pg_net
-- ---------------------------------------------------------------------------
--
-- `net.http_get` / `http_post` / `http_delete` carry EXECUTE for `anon` and
-- `authenticated`. They are not reachable today -- schema `net` is not exposed
-- by PostgREST, and there are no cron.job rows scheduling them -- but a
-- server-side HTTP client callable by an API role is a server-side request
-- forgery primitive waiting for the day someone exposes the schema. Nothing in
-- this application calls pg_net; the backend makes its own outbound requests.

do $$
begin
  execute 'revoke execute on all functions in schema net from anon, authenticated';
exception
  when invalid_schema_name then
    raise notice 'schema net not present; nothing to revoke';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Verify we did not just lock the application out of its own data
-- ---------------------------------------------------------------------------
--
-- The policies now call private.*, and the API roles hold EXECUTE there, so
-- this should hold regardless of whether Postgres re-checks function ACLs at
-- execution time for stored policy expressions. That ambiguity is exactly why
-- the helpers were MOVED rather than simply revoked: under either semantics the
-- policies keep working. This probe proves it before the transaction commits --
-- if it raises, the whole migration rolls back and nothing is left half-applied.

-- Check the catalog, not a live query.
--
-- Two earlier drafts of this probe did `set_config('role','authenticated')` and
-- then read public.users, treating any insufficient_privilege as proof that the
-- repoint had broken RLS. Both were wrong, in different ways, and each failure
-- is worth keeping:
--
--   1. The first restored the role by guessing a name ('service_role'), leaving
--      the session as the wrong role for the migration runner's own bookkeeping
--      INSERT, which then failed on permissions and took the migration with it.
--
--   2. The second aborted correctly but still asked the wrong question. `SELECT
--      ... FROM public.users` as `authenticated` also needs the TABLE grant, and
--      a freshly-replayed local stack does not hand out the same table grants as
--      production. So it raised insufficient_privilege in CI over something this
--      migration never touched, blamed itself, and rolled back -- turning a
--      correct migration into a red build.
--
-- What actually needs to hold is narrow: the API roles must still be able to
-- EXECUTE the helpers the twelve policies now call. has_function_privilege
-- answers exactly that, from the catalog, with no role switching, no table
-- dependency, and nothing to restore afterwards.

do $$
declare
  missing text;
begin
  select string_agg(format('%s (%s)', v.fn, v.role_name), ', ')
    into missing
  from (
    select fn, role_name
    from unnest(array[
      'private.get_user_org_id(uuid)',
      'private.is_superadmin(uuid)',
      'private.is_advisor_user(uuid)',
      'private.is_org_admin_user(uuid)',
      'private.is_minor_for_publication(uuid)'
    ]) fn
    cross join unnest(array['anon', 'authenticated']) role_name
    where not has_function_privilege(role_name, fn, 'EXECUTE')
  ) v;

  if missing is not null then
    raise exception
      'RLS helpers are not executable by the API roles, so every policy that '
      'calls them would fail: %. Rolling back.', missing;
  end if;

  raise notice 'RLS helper grants verified for anon and authenticated';
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- DELIBERATELY RETAINED: the portfolio_visibility_reset_* backup tables
-- ---------------------------------------------------------------------------
--
-- An earlier draft of this migration dropped
-- public.portfolio_visibility_reset_20260801 / _20260802 as stale copies of
-- children's consent state. That was wrong, and the reason is worth recording.
--
-- `..._20260801` holds 718 rows and EVERY ONE has `notified_at IS NULL`: these
-- are the families whose child's portfolio was public without consent, and who
-- have still never been told. The table is not a leftover, it is the worklist
-- for a notification that never went out (see
-- docs/PORTFOLIO_PRIVACY_AUDIT_2026-07-31.md). Dropping it would destroy the
-- only record of who is owed that contact.
--
-- There is also nothing to remediate: both tables already have FORCE ROW LEVEL
-- SECURITY with ALL privileges revoked from anon and authenticated, so they are
-- unreachable over the API. They are referenced by
-- backend/tests/test_secret_exposure_guard.py and AUDIT.md.
--
-- Do not drop these until the 718 families have been notified.

-- ---------------------------------------------------------------------------
-- DELIBERATELY NOT DONE HERE
-- ---------------------------------------------------------------------------
--
-- 1. `pg_net` lives in the `public` schema (advisor lint 0014). Relocating an
--    extension rewrites every reference to net.* and can break in-flight
--    callers for a schema-hygiene warning with no exposure attached. Left in
--    place intentionally; revisit during a maintenance window.
--
-- 2. 100 tables have RLS enabled with zero policies (advisor lint 0008, INFO).
--    This is the intended architecture, not a gap: with RLS on and no policy,
--    Postgres denies `anon` and `authenticated` by default, and all access
--    flows through the backend's service-role client, which bypasses RLS and
--    performs authorization in application code. The tables are FAIL-CLOSED.
--    Writing 100 permissive policies would enlarge the attack surface, not
--    shrink it. Note this makes the service-role key the whole ballgame -- it
--    is the single control standing between the API roles and the data.
--
-- 3. Postgres is on supabase-postgres-17.4.1.074, which has outstanding
--    security patches. Upgrading is a dashboard action requiring a maintenance
--    window and cannot be expressed as a migration:
--    https://supabase.com/docs/guides/platform/upgrading
