-- ============================================================================
-- quests: an org admin's Data API reach stops at their own school's quests.
-- ============================================================================
-- Found 2026-09-24 while replacing the quests SELECT policy (20260924150000,
-- on branch icreate/tasks-messaging-quests). Two policies were wider than any
-- code path needs:
--
--   * admin_full_access_quests (ALL) let an org admin read, update and delete
--     their own school's quests OR ANY QUEST WITH NO ORGANIZATION -- the whole
--     Optio catalog and every personal quest a student, parent or teacher made
--     for themselves, other families included. The "no organization" arm is
--     removed. Superadmins keep full access.
--   * quests_update let the creator update, or anyone with users.is_org_admin
--     or users.role = 'admin' update their school's quests. 'admin' is not a
--     role (CLAUDE.md, "Roles"), and org admins are covered by
--     admin_full_access_quests for their own school, so the policy is now the
--     creator only.
--
-- No code writes quests through an RLS-bound client: every insert, update and
-- delete in backend/ runs on the service-role client, and web/ and mobile/ use
-- supabase-js only for OAuth and realtime (checked 2026-09-24). So this removes
-- access only from direct Data API calls, which is where the gap was.
--
-- users_can_create_quests (INSERT, WITH CHECK created_by = auth.uid()) is
-- unchanged.
-- ============================================================================

DROP POLICY IF EXISTS admin_full_access_quests ON public.quests;
CREATE POLICY admin_full_access_quests ON public.quests
  FOR ALL
  TO authenticated
  USING (
    private.is_superadmin((SELECT auth.uid()))
    OR (
      private.is_org_admin_user((SELECT auth.uid()))
      AND organization_id IS NOT NULL
      AND organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    private.is_superadmin((SELECT auth.uid()))
    OR (
      private.is_org_admin_user((SELECT auth.uid()))
      AND organization_id IS NOT NULL
      AND organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = (SELECT auth.uid()))
    )
  );

COMMENT ON POLICY admin_full_access_quests ON public.quests IS
  'Superadmin: every quest. Org admin: their own school''s quests only, never '
  'the Optio catalog or personal quests (2026-09-24).';

DROP POLICY IF EXISTS quests_update ON public.quests;
CREATE POLICY quests_update ON public.quests
  FOR UPDATE
  TO authenticated
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));

COMMENT ON POLICY quests_update ON public.quests IS
  'The creator may update their quest. Org admins update their school''s '
  'quests through admin_full_access_quests (2026-09-24).';
