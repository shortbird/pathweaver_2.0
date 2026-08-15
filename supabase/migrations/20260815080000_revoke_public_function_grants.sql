-- Follow-up to 20260815060000_db_security_hardening.sql.
--
-- That migration did `revoke execute ... from anon, authenticated` on the five
-- RLS helper functions and on pg_net. Verified afterwards against production,
-- the API roles could STILL execute all of them.
--
-- The reason is a Postgres default that is easy to miss: `CREATE FUNCTION`
-- grants EXECUTE to PUBLIC. The ACL on those functions read
--
--     {=X/postgres, postgres=X/postgres, service_role=X/postgres}
--
-- where the leading `=X/postgres` is the grant to PUBLIC. Revoking from `anon`
-- and `authenticated` removed their *explicit* entries -- which the earlier
-- migration did successfully -- while leaving every role still holding EXECUTE
-- through PUBLIC. `has_function_privilege('anon', ...)` stayed true throughout.
--
-- A revoke that appears to succeed and changes nothing is worse than one that
-- errors, so this is worth stating plainly: to close a function to the API
-- roles you must revoke from PUBLIC, not from the roles.
--
-- Nothing here changes RLS behaviour. The twelve policies now call private.*,
-- and those grants are untouched.

-- 1. The five helpers. postgres owns them, so the revoke is permitted.
--    service_role keeps its explicit grant; the postgres owner keeps EXECUTE
--    implicitly, which is what public.enforce_publication_consent_provenance
--    (SECURITY DEFINER, owned by postgres) relies on.

revoke execute on function public.get_user_org_id(uuid)          from public;
revoke execute on function public.is_superadmin(uuid)            from public;
revoke execute on function public.is_advisor_user(uuid)          from public;
revoke execute on function public.is_org_admin_user(uuid)        from public;
revoke execute on function public.is_minor_for_publication(uuid) from public;

-- 2. pg_net. These are owned by supabase_admin, not postgres, so the revoke may
--    not be permitted for the migration role -- hence the guard. Not reachable
--    over the API today (schema `net` is not PostgREST-exposed and no cron.job
--    rows call it); this is defence in depth against a future schema exposure.

do $$
begin
  execute 'revoke execute on all functions in schema net from public';
  raise notice 'pg_net: revoked EXECUTE from PUBLIC';
exception
  when insufficient_privilege then
    raise notice
      'pg_net: cannot revoke from PUBLIC (functions owned by supabase_admin). '
      'Not exposed over PostgREST, so this stays a latent item rather than a live one.';
  when invalid_schema_name then
    raise notice 'pg_net: schema net not present; nothing to revoke';
end;
$$;
