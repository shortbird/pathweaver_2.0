-- Test-only helpers for the LOCAL integration stack.
--
-- Applied by tests-integration.yml (and by hand for local runs) right after
-- grants.sql. Never applied to a hosted project, and deliberately not a
-- migration: nothing here should ever exist in dev or production.
--
-- WHY AN RPC AND NOT A POSTGRES DRIVER
-- -----------------------------------
-- The fixtures need to TRUNCATE between tests, which PostgREST cannot express.
-- The alternative was adding psycopg to requirements.txt -- but the ROOT
-- requirements.txt is what Render installs, so a test-only truncate helper
-- would have become a production dependency. This keeps the backend's
-- dependency list honest.
--
-- This is NOT a revival of the mythical `execute_sql` RPC the old fixtures
-- called (see backend/tests/integration/README.md). That one took arbitrary SQL
-- as a string, never existed anywhere, and was called with f-string
-- interpolation. This takes no arguments, runs a fixed statement, and exists
-- only inside a throwaway container.

create or replace function public.test_truncate_all()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_tables constant text[] := array[
    'quest_task_completions',
    'user_quest_tasks',
    'user_quests',
    'user_skill_xp',
    'parent_student_links',
    'parent_invitations',
    'observer_student_links',
    'observer_invitations',
    'login_attempts',
    'parental_consent_log',
    'announcements',
    'quest_invitations',
    'curriculum_lesson_tasks',
    'curriculum_lessons',
    'quests',
    'users'
  ];
  present text;
begin
  -- Only truncate what this schema actually has, so the helper survives tables
  -- being added or renamed without failing every test with a 42P01.
  select string_agg(format('public.%I', table_name), ', ')
    into present
    from information_schema.tables
   where table_schema = 'public'
     and table_name = any(target_tables);

  if present is not null then
    execute format('truncate %s restart identity cascade', present);
  end if;

  -- public.users.id references auth.users(id) on delete cascade, so the auth
  -- rows have to go as well or the next create_user collides on email.
  --
  -- `where true` is required, not noise: local Supabase stacks load
  -- pg_safeupdate, which rejects an unqualified DELETE with 21000 "DELETE
  -- requires a WHERE clause".
  delete from auth.users where true;
end;
$$;

-- service_role only: this is called by the test fixtures through the
-- service-role client, and nothing else has any business truncating tables.
revoke all on function public.test_truncate_all() from public, anon, authenticated;
grant execute on function public.test_truncate_all() to service_role;
