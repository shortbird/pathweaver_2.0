-- Closes the last two findings of the 2026-08-01 Data API audit: `bounties` and
-- `curriculum_attachments` are readable over the public anon key.
--
-- These are the two tables 20260802_revoke_data_api_on_student_work.sql
-- deliberately left out of its transaction, noted at its foot as "same remedy,
-- separate decision". This is that decision, taken 2026-08-03 after the
-- scheduled `DB Exposure Audit` run failed on exactly these two:
--
--     [FAIL] anon key cannot read non-public tables
--       - `bounties` returns rows to the PUBLIC anon key (17 row(s) visible)
--       - `curriculum_attachments` returns rows to the PUBLIC anon key (21 row(s) visible)
--
-- THE PROBLEM
-- -----------
-- Re-verified against production on 2026-08-03; both tables have RLS enabled,
-- and in both cases the SELECT policy publishes the whole table anyway.
--
--   bounties."Anyone can view active bounties"
--       USING (status = 'active' OR poster_id = (select auth.uid()))
--     All 17 rows are status='active', so the first branch is true for every row
--     and the table is fully anon-readable -- including `allowed_student_ids`
--     (which students a private bounty is offered to), `moderation_notes`,
--     `cohort_class_id` and `sponsored_reward`.
--
--     The policy keys on `status`. The product's privacy control is `visibility`
--     ('public' | 'organization' | 'family'), and the policy does not mention it,
--     so the two have nothing to do with each other. In production right now that
--     gap is not hypothetical: 15 of the 17 rows are visibility='family' -- a
--     parent's bounty aimed at named children via allowed_student_ids -- and all
--     15 are readable by anyone on the internet holding the anon key.
--
--     Note that a bounty CAN legitimately be platform-wide (visibility='public'),
--     which is why this policy looks harmless at a glance. But "public" there
--     means every logged-in user, and it is enforced in Python --
--     `BountyService.list_bounties` filters on visibility and `_can_student_see`
--     re-checks it so a direct link cannot bypass the list. None of that runs on
--     a PostgREST request. Platform-public and internet-public are different
--     things, and only the first one is a product feature.
--
--   curriculum_attachments."curriculum_attachments_org_isolation"
--       USING (organization_id IS NULL OR organization_id IN (<caller's org>))
--     All 21 rows have a NULL organization_id, so the first branch publishes the
--     entire table and the policy's name describes something it does not do.
--     What leaks is `file_url` for org curriculum uploads. The soft-delete hole
--     is latent rather than live: `is_deleted = true` on zero rows today, and
--     the policy does not test the flag, so a soft-deleted file stays readable.
--
-- WHY REVOKING IS SAFE
-- --------------------
-- Same four checks that cleared the student-work tables on 2026-08-02, re-run
-- for these two on 2026-08-03:
--
--   1. No client code touches them through PostgREST. Neither frontend contains
--      a `.from('bounties')` or `.from('curriculum_attachments')` call; both
--      Supabase JS clients exist for OAuth only, with persistSession:false.
--   2. The `supabase_realtime` publication is still EMPTY -- zero tables.
--   3. Every backend read is on the service-role client, which bypasses RLS and
--      grants. `BountyService.__init__` builds `BountyRepository()` with no
--      user_id, and BaseRepository falls back to `get_supabase_admin_client()`
--      in that case; `routes/curriculum/attachments.py` calls
--      `get_supabase_admin_client()` in every endpoint.
--   4. Nothing serves either table to logged-out visitors. All 15 routes in
--      `routes/bounties.py` are `@require_role`'d, including the student-facing
--      list -- a platform-wide bounty reaches its audience through Flask, not
--      through the anon key. Revoking anon removes no product capability; it
--      removes an unauthenticated path that runs none of the visibility rules.
--
-- And the same corollary applies: every branch of these policies other than the
-- two above is keyed on `auth.uid()`, which is NULL on every Data API request --
-- the app issues its own HS256 tokens and never hands the browser a Supabase JWT
-- for data access. So the only branches that can ever evaluate true are the
-- exposures themselves. Dropping the policies removes no working access path.
--
-- Verify after applying:
--     SUPABASE_ACCESS_TOKEN=sbp_... python scripts/audit_db_exposure.py   # expect 0 findings
-- and load the bounty board and a quest's curriculum tab, which must be
-- unaffected.
--
-- Rollback captured pre-apply in
-- ROLLBACK_20260803_revoke_data_api_on_bounties_and_attachments.sql.
--
-- Safe to re-run.

begin;

-- Drop rather than leave present-but-unreachable, so a later re-GRANT cannot
-- silently reopen this. The service_role policy on bounties is left in place --
-- it is what the backend uses.
drop policy if exists "Anyone can view active bounties"      on public.bounties;
drop policy if exists "Users can create bounties"            on public.bounties;
drop policy if exists "Posters can update own bounties"      on public.bounties;
drop policy if exists "Posters can delete own draft bounties" on public.bounties;

drop policy if exists "curriculum_attachments_org_isolation" on public.curriculum_attachments;
drop policy if exists "curriculum_attachments_insert"        on public.curriculum_attachments;
drop policy if exists "curriculum_attachments_update"        on public.curriculum_attachments;
drop policy if exists "curriculum_attachments_delete"        on public.curriculum_attachments;

-- RLS on with no anon/authenticated policy = deny-all. FORCE so a future table
-- owner does not implicitly bypass it. service_role keeps access through its
-- BYPASSRLS attribute, which FORCE does not affect.
alter table public.bounties               force row level security;
alter table public.curriculum_attachments force row level security;

-- Grants, not just policies: the blanket ALTER DEFAULT PRIVILEGES in
-- 20260527_restore_default_data_api_grants.sql handed anon
-- SELECT/INSERT/UPDATE/DELETE/TRUNCATE on both, and RLS is the only thing that
-- was holding the write half back.
revoke all on public.bounties               from anon, authenticated, public;
revoke all on public.curriculum_attachments from anon, authenticated, public;

grant all on public.bounties               to service_role;
grant all on public.curriculum_attachments to service_role;

comment on table public.bounties is
  'Bounty board postings. Service-role only -- never expose to the Data API. '
  'Rows carry allowed_student_ids and moderation_notes, so a status-keyed RLS '
  'policy publishes who a private bounty was offered to. Read authorization is '
  'the @require_role decorators in routes/bounties.py. If a logged-out bounty '
  'board is ever built, give it a Flask endpoint that selects the public columns '
  'explicitly; do not re-grant anon.';

comment on table public.curriculum_attachments is
  'Org curriculum uploads. Service-role only -- never expose to the Data API. '
  'file_url points at stored course material, and organization_id is NULL on '
  'every row today, so any policy with an `organization_id IS NULL` branch '
  'publishes the whole table rather than isolating orgs. Access goes through '
  'routes/curriculum/attachments.py on the admin client.';

commit;
