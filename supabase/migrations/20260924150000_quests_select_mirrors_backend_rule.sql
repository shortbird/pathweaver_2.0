-- ============================================================================
-- quests: replace "Quests are viewable by everyone" with a policy that mirrors
-- the backend's direct-link rule (services/quest_visibility_service.py).
-- ============================================================================
-- Owner decision, 2026-09-24. The old SELECT policy was USING (is_active = true)
-- for every role, anon included: anyone holding the public anon key could read
-- every active quest in the Data API -- every school's quests, assigned or not,
-- and every personal quest (global, is_public = false) a student, teacher or
-- parent made for themselves. The backend stopped answering those by id in
-- 88b7dfd4 and its follow-up; this closes the same door one layer down.
--
-- The new policy admits an ACTIVE quest when:
--   * it is the public Optio catalog (organization_id IS NULL AND is_public);
--   * the reader created it;
--   * the reader has a user_quests row for it (any status);
--   * it is a school quest and the reader belongs to that school
--     (users.organization_id). Assignment is NOT required here: the backend
--     narrows students to assigned quests, but staff read every quest of their
--     school, and RLS cannot tell the two apart without re-deriving role
--     resolution (org_roles/org_role/role); the org boundary is the part RLS
--     must hold;
--   * it is a released Project (course_quests.is_published not false) in a
--     course the reader can reach: enrolled in it (course_enrollments, any
--     status), or the course is published and global, public, or the reader's
--     own school's. This mirrors QuestRepository.reachable_through_course --
--     Optio's own course projects are non-public global quests (168 on
--     2026-09-24), so without it a student could not read a project of a
--     course they are browsing.
-- Superadmins and org admins keep reading through admin_full_access_quests,
-- which this migration does not touch (see REPORT below).
--
-- The membership / enrollment / course checks run in
-- private.quest_readable_by_caller, SECURITY DEFINER with an empty
-- search_path, so they read user_quests, users, course_quests, courses and
-- course_enrollments without those tables' own RLS. That is what keeps this
-- from recursing (no policy on those tables reads quests today -- checked in
-- pg_policies 2026-09-24 -- but the definer function makes it independent of
-- that), and it answers only about auth.uid(): it takes no user id, so calling
-- it cannot probe somebody else's enrollment.
--
-- Not expressed here, on purpose: the backend also opens a personal quest for
-- people RELATED to its creator or to a student on it (guardian by any of
-- three links, observer, advisor, teacher). Those reads all run on the
-- service-role client (see the inventory), so RLS need not admit them, and
-- admitting them would mean re-implementing utils/portfolio_access in SQL.
--
-- ----------------------------------------------------------------------------
-- INVENTORY of every read of public.quests that runs under an RLS-bound role,
-- taken 2026-09-24 against this branch and production main:
--
-- Backend, authenticated (database.get_user_client / BaseRepository(user_id)):
--   1. services/quest_lifecycle_service.QuestLifecycleService.get_quest --
--      POST /api/quests/<id>/pickup, the caller's own pickup. Covered: a quest
--      the caller is on (enrolled), made, belongs to their school, the catalog,
--      or a reachable course project. A new pickup of anything else is refused
--      by may_open_quest anyway; get_quest now reads with limit(1) so a hidden
--      row is the same 404 rather than a PGRST116 500.
--   2. routes/users/transcript.get_all_completed_quests --
--      user_quests(*, quests(*)) for the caller's own enrollments. Covered by
--      the enrollment clause (the embed is filtered per row by this policy).
--   3. routes/quest/listing.list_quests builds QuestRepository(user_id=...),
--      but get_quests_for_user reads quests on the admin client. Not RLS.
-- Backend, anon (database.get_supabase_client):
--   4. routes/quest/listing.list_quests, signed-out branch: active, is_public,
--      organization_id IS NULL. Covered by the catalog clause.
--   5. routes/quest/detail.check_enrollment_status reads user_quests only.
--   (utils/auth/token_utils, routes/health, routes/auth/login/* use the anon
--   client for auth and users, never quests.)
-- Web (web/src) and mobile (mobile/src, mobile/app): supabase-js is used for
--   OAuth and realtime broadcast channels only; no .from('quests'), no
--   postgres_changes subscription. quests is in no publication.
-- Marketing (marketing/): reads through the backend API only.
-- Public pages (/poe/showcase, /api/embed/*, public portfolios and profiles):
--   backend routes on the service-role client. Not RLS.
-- Database: no view depends on quests. No other table's policy reads quests.
--   Functions that read quests: quest_is_assigned (SECURITY INVOKER; read as a
--   computed field only by QuestRepository on the admin client),
--   get_tutorial_quest_id and quest_visible_to_user (INVOKER, no caller in the
--   code), update_ai_generation_performance_metrics (INVOKER, service layer on
--   the admin client), check_quest_duplicate and cleanup_user_data (DEFINER).
-- Edge logs, last 24h: 0 requests to /rest/v1 with an authenticated user JWT;
--   anon requests are the daily exposure audit's probes, which keep quests in
--   ANON_READABLE_BY_DESIGN for the public catalog -- still true.
--
-- REPORT, other policies on quests, left as they are (owner to decide):
--   * admin_full_access_quests (ALL): superadmin, or org admin
--     (private.is_org_admin_user) for their org's quests OR ANY global quest.
--     So an org admin can still SELECT, UPDATE and DELETE every global quest
--     through the Data API, personal quests of other families included.
--   * quests_update (UPDATE): creator, or users.is_org_admin / role 'admin'
--     (not a real role) for their org's quests.
--   * users_can_create_quests (INSERT): WITH CHECK created_by = auth.uid().
--
-- Safe for old code: the only RLS reads of quests are the three above, and
-- each is admitted for the rows it legitimately reads. Apply with
-- migrate-prod.yml; not applied by the session that wrote it.
-- ============================================================================

CREATE OR REPLACE FUNCTION private.quest_readable_by_caller(p_quest_id uuid, p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    -- on it: any user_quests row, active, set down or completed
    EXISTS (
      SELECT 1 FROM public.user_quests uq
      WHERE uq.quest_id = p_quest_id AND uq.user_id = (SELECT auth.uid())
    )
    -- a member of the quest's school
    OR (p_org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid()) AND u.organization_id = p_org_id
    ))
    -- a released project in a course the caller can reach
    OR EXISTS (
      SELECT 1
      FROM public.course_quests cq
      JOIN public.courses c ON c.id = cq.course_id
      WHERE cq.quest_id = p_quest_id
        AND cq.is_published IS DISTINCT FROM false
        AND (
          (c.status = 'published' AND (
             c.organization_id IS NULL
             OR c.visibility = 'public'
             OR c.organization_id = (
               SELECT u.organization_id FROM public.users u WHERE u.id = (SELECT auth.uid())
             )
          ))
          OR EXISTS (
            SELECT 1 FROM public.course_enrollments ce
            WHERE ce.course_id = c.id AND ce.user_id = (SELECT auth.uid())
          )
        )
    )
  );
$function$;

COMMENT ON FUNCTION private.quest_readable_by_caller(uuid, uuid) IS
  'RLS helper for public.quests SELECT: is the CURRENT user (auth.uid()) on '
  'this quest, in its school, or able to reach it through a course? '
  'Mirrors services/quest_visibility_service.py (2026-09-24).';

REVOKE ALL ON FUNCTION private.quest_readable_by_caller(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.quest_readable_by_caller(uuid, uuid)
  TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Quests are viewable by everyone" ON public.quests;
DROP POLICY IF EXISTS quests_select_visible ON public.quests;

CREATE POLICY quests_select_visible ON public.quests
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND (
      (organization_id IS NULL AND is_public = true)
      OR created_by = (SELECT auth.uid())
      OR private.quest_readable_by_caller(id, organization_id)
    )
  );

COMMENT ON POLICY quests_select_visible ON public.quests IS
  'Active quests: the public catalog, your own, ones you are on, your '
  'school''s, and projects of courses you can reach. Replaces "Quests are '
  'viewable by everyone" (2026-09-24).';
