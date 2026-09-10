-- Remove `is_admin()`, a predicate that has never returned true.
--
-- ---------------------------------------------------------------------------
-- WHAT IS WRONG
-- ---------------------------------------------------------------------------
--
--     CREATE FUNCTION public.is_admin() RETURNS boolean AS $$
--       SELECT EXISTS (SELECT 1 FROM public.users
--                      WHERE id = auth.uid() AND role = 'admin');
--     $$;
--
-- `admin` is not a role this system has. CLAUDE.md lists it under "INVALID
-- roles (do NOT use)", `require_role` raises at decoration time for any name
-- outside VALID_ROLES | VALID_ORG_ROLES (SEC-01), and the users.role CHECK
-- constraint does not admit it. So the EXISTS matches no row for any caller,
-- and `is_admin()` is false for everyone, always.
--
-- Eleven live policies call it. Verified against production
-- (vvfgxcykxjybtvpfzwyx) on 2026-09-10 rather than read off these files:
--
--   account_deletion_log   account_deletion_log_select      OR arm
--   diplomas               diplomas_insert                  OR arm
--   diplomas               diplomas_update                  OR arm (both)
--   direct_messages        direct_messages_select           OR arm
--   message_conversations  message_conversations_select     OR arm
--   parental_consent_log   parental_consent_log_select      OR arm
--   student_access_logs    student_access_logs_select       OR arm
--   ai_generated_quests    ai_generated_quests_admin_all    SOLE clause
--   ai_generation_jobs     ai_generation_jobs_admin_all     SOLE clause
--   ai_seeds               ai_seeds_admin_all               SOLE clause
--   site_settings          site_settings_admin_all          SOLE clause
--
-- Plus a twelfth policy that is dead for its own reasons:
--
--   organizations          superadmin_can_manage_organizations
--
-- which tests `role = 'admin' AND email = 'tannerbowman@gmail.com'` -- the
-- same non-existent role, and a personal address hardcoded in the schema,
-- which is what OPS-07 removed from the application code.
--
-- ---------------------------------------------------------------------------
-- THIS MIGRATION CHANGES NO ACCESS
-- ---------------------------------------------------------------------------
--
-- That is the whole point, and it is worth spelling out per shape, because
-- "delete a policy" reads as a loosening.
--
-- The seven OR arms: permissive policies are OR'd together, and this arm
-- contributes false. `a OR false` is `a`. Every one of these tables keeps its
-- own-row clause exactly as it stands -- a user still reads their own
-- deletion log, their own consent record, their own messages -- and a parent
-- still reads their dependent's access log.
--
-- The four sole clauses: a permissive policy that is always false permits
-- nothing, so these four tables are deny-all today for every role that RLS
-- applies to. Dropping the policy leaves them deny-all by absence instead of
-- deny-all by a false predicate. Same access, one fewer lie.
--
--   * site_settings keeps site_settings_select_all (USING true), so reads by
--     logged-out visitors are unaffected; it is writes that were and remain
--     service-role only. The table is on the exposure audit's allowlist as
--     deliberately anon-readable (scripts/audit_db_exposure.py).
--   * ai_seeds, ai_generated_quests and ai_generation_jobs have no caller in
--     backend/ at all -- grepped 2026-09-10, zero `.table('...')` sites.
--
-- organizations: superadmin_can_manage_organizations is FOR ALL and always
-- false, so it contributes nothing to SELECT (organizations_select covers it,
-- including the superadmin arm) or to UPDATE (org_admin_update_own_org).
-- INSERT and DELETE were denied through a false predicate and are now denied
-- through absence.
--
-- WHY NOT REPOINT IT AT `superadmin` INSTEAD. Because that is not a fix, it is
-- a grant. Making this predicate live would hand superadmins RLS-level read of
-- direct_messages and message_conversations -- private correspondence between
-- two users -- plus parental_consent_log and student_access_logs, and write on
-- diplomas. Whether platform staff should have that is a real question with a
-- real answer, and it is not one to settle inside a cleanup commit. Deleting
-- the dead clause leaves that decision exactly where it is today: unmade, and
-- now visible.
--
-- ---------------------------------------------------------------------------
-- THE TABLE COMMENTS
-- ---------------------------------------------------------------------------
--
-- FU-03 is the argument for these. `bug_reports` was deny-all RLS with 356
-- rows in it; superadmin triage returned an empty list, HTTP 200, no error,
-- and nobody could tell the difference between "no bug reports" and "no
-- access". A table with RLS on and no policies is a legitimate design here --
-- Flask reads it on the service-role client -- but it is indistinguishable
-- from a table whose policies were dropped by accident. So each one says so
-- out loud, in the catalog, where the next person querying it will look.
--
-- ---------------------------------------------------------------------------
-- DROPPING THE FUNCTIONS
-- ---------------------------------------------------------------------------
--
-- After the policies above, `public.is_admin()` has no remaining caller:
-- no policy, no function body, no view, and no `rpc('is_admin')` in backend/
-- or web/ (all four checked 2026-09-10; the function-body check ran against
-- production's pg_proc, not against these files).
--
-- `public.is_current_user_admin()` has never had one. It appears exactly once
-- in the whole migration history -- its own CREATE -- and its body checks the
-- same impossible role plus a JWT claim of `role = 'admin'`, which the app
-- never mints (session_manager sets `role` to POSTGREST_ROLE, i.e.
-- `authenticated`).
--
-- Both are dropped WITHOUT CASCADE, deliberately. If some dependency exists
-- that four searches missed, this migration fails loudly at that statement and
-- the transaction rolls back -- which is the outcome to want. CASCADE would
-- silently drop whatever depends on them, and a policy vanishing quietly is
-- the failure this migration is about.
--
-- Note the deliberate contrast with 20260815060000, which kept the public.*
-- copies of five OTHER helpers alive on purpose, because
-- public.enforce_publication_consent_provenance still calls one of them. That
-- reasoning does not extend to these two: nothing calls them.

begin;

-- ---------------------------------------------------------------------------
-- 1. The seven policies where the dead predicate is one OR arm.
--    Each is recreated verbatim minus `OR is_admin()`.
-- ---------------------------------------------------------------------------

drop policy if exists account_deletion_log_select on public.account_deletion_log;
create policy account_deletion_log_select on public.account_deletion_log
  for select to public
  using (user_id = (select auth.uid()));

drop policy if exists diplomas_insert on public.diplomas;
create policy diplomas_insert on public.diplomas
  for insert to public
  with check (user_id = (select auth.uid()));

drop policy if exists diplomas_update on public.diplomas;
create policy diplomas_update on public.diplomas
  for update to public
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists direct_messages_select on public.direct_messages;
create policy direct_messages_select on public.direct_messages
  for select to public
  using (
    sender_id = (select auth.uid())
    or recipient_id = (select auth.uid())
  );

drop policy if exists message_conversations_select on public.message_conversations;
create policy message_conversations_select on public.message_conversations
  for select to public
  using (
    participant_1_id = (select auth.uid())
    or participant_2_id = (select auth.uid())
  );

drop policy if exists parental_consent_log_select on public.parental_consent_log;
create policy parental_consent_log_select on public.parental_consent_log
  for select to public
  using (user_id = (select auth.uid()));

-- A parent reads their dependent's access log. That arm is untouched; only the
-- is_admin() arm between the two is removed.
drop policy if exists student_access_logs_select on public.student_access_logs;
create policy student_access_logs_select on public.student_access_logs
  for select to public
  using (
    student_id = (select auth.uid())
    or student_id in (
      select users.id from public.users
      where users.managed_by_parent_id = (select auth.uid())
        and users.is_dependent = true
    )
  );

-- ---------------------------------------------------------------------------
-- 2. The four policies where it is the only clause, and the organizations one.
--    Each table is deny-all (or deny-write) before and after.
-- ---------------------------------------------------------------------------

drop policy if exists ai_generated_quests_admin_all on public.ai_generated_quests;
drop policy if exists ai_generation_jobs_admin_all  on public.ai_generation_jobs;
drop policy if exists ai_seeds_admin_all            on public.ai_seeds;
drop policy if exists site_settings_admin_all       on public.site_settings;
drop policy if exists superadmin_can_manage_organizations on public.organizations;

comment on table public.ai_generated_quests is
  'RLS on, no policies: deny-all through the Data API by design. Reached only '
  'by Flask on the service-role client. An empty PostgREST result here is the '
  'policy working, not a missing row -- see FU-03.';

comment on table public.ai_generation_jobs is
  'RLS on, no policies: deny-all through the Data API by design. Reached only '
  'by Flask on the service-role client.';

comment on table public.ai_seeds is
  'RLS on, no policies: deny-all through the Data API by design. Holds AI '
  'prompt text; reached only by Flask on the service-role client.';

comment on table public.site_settings is
  'Anon-READABLE on purpose (site name, logo, colours, rendered for '
  'logged-out visitors) via site_settings_select_all, and allowlisted as such '
  'in scripts/audit_db_exposure.py. Writes have no policy and are '
  'service-role only.';

-- ---------------------------------------------------------------------------
-- 3. The functions themselves, now that nothing references them.
--    No CASCADE: a surviving dependency must fail this migration, not be
--    silently deleted along with it.
-- ---------------------------------------------------------------------------

drop function if exists public.is_admin();
drop function if exists public.is_current_user_admin();

commit;
