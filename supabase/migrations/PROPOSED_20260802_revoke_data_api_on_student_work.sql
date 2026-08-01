-- ============================================================================
-- PROPOSED -- NOT APPLIED. Filename is deliberately prefixed so `supabase db push`
-- will not pick it up. Rename to 20260802_revoke_data_api_on_student_work.sql to
-- adopt it.
-- ============================================================================
--
-- Closes AUDIT.md H4: student evidence CONTENT is readable over the public anon
-- key, under a privacy rule the application stopped using on 2026-08-01.
--
-- THE PROBLEM
-- -----------
-- Five tables carry SELECT policies that grant access when
-- `diplomas.is_public = true`:
--
--   diplomas.diplomas_select
--     (user_id = auth.uid()) OR (is_public = true) OR is_admin()
--   user_task_evidence_documents.user_task_evidence_documents_select
--     (user_id = auth.uid()) OR (status = 'completed' AND <owner diploma is_public>)
--   evidence_document_blocks.evidence_document_blocks_select
--     <document owned by auth.uid()> OR <document's owner diploma is_public>
--   user_skill_xp.user_skill_xp_select
--     (user_id = auth.uid()) OR <owner diploma is_public>
--   user_mastery.user_mastery_select
--     (user_id = auth.uid()) OR <owner diploma is_public>
--
-- `is_public = true` was the whole privacy model before 2026-08-01. It is not
-- any more: utils/portfolio_access.py::can_view_portfolio now requires a consent
-- record naming who granted it, treats unknown age as minor, and gives parents
-- revocation. These policies never learned any of that, so the Data API answers
-- the old question -- for unauthenticated callers.
--
-- Measured against production on 2026-08-01, with the public anon key:
--     evidence_document_blocks       239 of 1545 rows   <- includes `content`
--     user_task_evidence_documents   211 of 1121 rows
--     user_skill_xp                   38 of 1881 rows
--     diplomas                         4 of  731 rows
--     user_mastery                     4 rows
--
-- WHY REVOKING IS SAFE
-- --------------------
-- Three independent checks say nothing reaches these tables through PostgREST:
--
--   1. No client code queries them. The Supabase JS client is constructed for
--      OAuth only, with persistSession:false
--      (frontend/src/services/supabaseClient.js, frontend-v2/src/services/
--      supabaseClient.ts). Grepping both frontends for these table names returns
--      only comments.
--   2. Realtime cannot be relying on them: the `supabase_realtime` publication
--      is EMPTY -- zero tables published.
--   3. Every product read goes through Flask on the service-role client, which
--      bypasses RLS entirely. The public portfolio is
--      routes/portfolio.py::get_public_portfolio -> PortfolioService, and
--      PortfolioService.__init__ defaults to get_supabase_admin_client()
--      (services/portfolio_service.py:29).
--
-- Note the corollary: the `user_id = auth.uid()` branches are dead too. The app
-- issues its own HS256 tokens and never hands the browser a Supabase JWT for data
-- access, so auth.uid() is NULL on every Data API request. The ONLY branch of
-- these policies that ever evaluates true is the is_public one -- which is
-- precisely the exposure. These policies serve no live code path at all.
--
-- This mirrors what organization_secrets and portfolio_visibility_reset_20260801
-- already do: RLS on, no policies, grants revoked, service-role only.
--
-- BEFORE APPLYING
-- ---------------
-- Confirm no third party has been pointed at these tables with the anon key --
-- an embed, a school's dashboard, a partner integration. The repo cannot answer
-- that; only the team can. If one exists, give it a Flask endpoint first.
--
-- Verify after applying:
--     python scripts/audit_db_exposure.py     # expect these to drop out
-- and load a public portfolio page, which must be unaffected.

begin;

-- Drop the policies rather than leave them present-but-unreachable, so nobody
-- later re-grants SELECT and silently reopens this.
drop policy if exists "evidence_document_blocks_select"      on public.evidence_document_blocks;
drop policy if exists "user_task_evidence_documents_select"  on public.user_task_evidence_documents;
drop policy if exists "user_skill_xp_select"                 on public.user_skill_xp;
drop policy if exists "user_mastery_select"                  on public.user_mastery;
drop policy if exists "diplomas_select"                      on public.diplomas;

-- RLS stays on with no SELECT policy = deny-all for anon/authenticated.
-- FORCE so a future table owner does not implicitly bypass it.
alter table public.evidence_document_blocks      force row level security;
alter table public.user_task_evidence_documents  force row level security;
alter table public.user_skill_xp                 force row level security;
alter table public.user_mastery                  force row level security;
alter table public.diplomas                      force row level security;

-- Grants, not just policies: the blanket ALTER DEFAULT PRIVILEGES in
-- 20260527_restore_default_data_api_grants.sql handed anon INSERT/UPDATE/DELETE/
-- TRUNCATE on all of these too, and RLS is the only thing holding those back.
revoke all on public.evidence_document_blocks      from anon, authenticated, public;
revoke all on public.user_task_evidence_documents  from anon, authenticated, public;
revoke all on public.user_skill_xp                 from anon, authenticated, public;
revoke all on public.user_mastery                  from anon, authenticated, public;
revoke all on public.diplomas                      from anon, authenticated, public;

grant all on public.evidence_document_blocks      to service_role;
grant all on public.user_task_evidence_documents  to service_role;
grant all on public.user_skill_xp                 to service_role;
grant all on public.user_mastery                  to service_role;
grant all on public.diplomas                      to service_role;

comment on table public.evidence_document_blocks is
  'Student work content. Service-role only -- never expose to the Data API. '
  'Read authorization is utils/portfolio_access.py::can_view_portfolio, which '
  'encodes consent, minor status and parent revocation. An RLS policy keyed on '
  'diplomas.is_public cannot express that and must not be reintroduced.';

commit;

-- ---------------------------------------------------------------------------
-- SAME REMEDY, SEPARATE DECISION -- left out of the transaction above because
-- each needs its own product call. Both are flagged by the same scan.
--
--   bounties                 17 rows visible to anon. Policy is
--                            `status = 'active' OR poster_id = auth.uid()`, and
--                            it exposes allowed_student_ids and moderation_notes.
--                            Every /api/bounties route is @require_role'd, so the
--                            product does not need the anon path -- but confirm
--                            no public bounty board is planned.
--   curriculum_attachments   21 rows. Exposes file_url for org curriculum
--                            uploads, INCLUDING rows with is_deleted = true.
--                            A soft delete that leaves the file linked and
--                            world-readable is not a delete.
-- ---------------------------------------------------------------------------
