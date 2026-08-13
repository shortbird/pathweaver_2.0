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
    'observer_comments',
    'advisor_student_assignments',
    'observer_invitation_students',
    'observer_student_links',
    'observer_invitations',
    'login_attempts',
    'parental_consent_log',
    'announcements',
    'quest_invitations',
    'curriculum_lesson_tasks',
    'curriculum_lessons',
    'quests',
    'users',
    'organizations'
  ];
  present text;
  attempt int;
begin
  -- Only truncate what this schema actually has, so the helper survives tables
  -- being added or renamed without failing every test with a 42P01.
  select string_agg(format('public.%I', table_name), ', ')
    into present
    from information_schema.tables
   where table_schema = 'public'
     and table_name = any(target_tables);

  if present is not null then
    -- TRUNCATE takes an AccessExclusiveLock, which conflicts with the row locks
    -- PostgREST's pooled connections still hold from the request the test just
    -- made. That deadlocks (40P01) intermittently -- and an intermittently
    -- failing reset is worse than a slow one, because it fails a test that has
    -- nothing to do with the problem.
    --
    -- lock_timeout turns the wait into a fast, catchable error, and the retry
    -- loop rides out the window where the previous request's connection is
    -- still settling.
    for attempt in 1..5 loop
      begin
        set local lock_timeout = '2s';
        execute format('truncate %s restart identity cascade', present);
        exit;
      exception
        when deadlock_detected or lock_not_available then
          if attempt = 5 then
            raise;
          end if;
          perform pg_sleep(0.1 * attempt);
      end;
    end loop;
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
