-- ============================================================================
-- quests.quest_is_assigned: a PostgREST computed field for quest discovery.
-- ============================================================================
-- Owner decision, 2026-09-24: a school's published quest that nobody assigned
-- must not show in quest discovery for that school's students. Before this,
-- QuestRepository.get_quests_for_user listed every ACTIVE quest with the
-- student's organization_id under every visibility policy, whatever is_public
-- said, so a quest a teacher built and never used was one tap from enrollment.
--
-- A school quest counts as assigned when it is on at least one:
--   * class          (class_quests)
--   * curriculum     (sis_curriculum_quests)
--   * training entry (sis_staff_training.quest_id)
--
-- Why a computed field and not an id list: PostgREST truncates at 1,000 rows
-- and a query string cannot carry thousands of ids, and both grow with the
-- org. A function whose only argument is the quests row type is exposed by
-- PostgREST as a virtual column, so the discovery filter can say
-- `and(organization_id.eq.<org>,quest_is_assigned.is.true)` inside its
-- existing or=() and every count/range/order keeps working in one request.
--
-- ADDITIVE and safe for the old code: nothing reads it until the new backend
-- asks for it, and the new backend falls back to the old listing (with a
-- warning) while this function is missing, so it can be applied before or
-- after the deploy.
--
-- SECURITY INVOKER on purpose: the discovery path uses the admin client, and
-- any RLS-bound caller only learns about links it can already see.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.quest_is_assigned(q public.quests)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.class_quests cq WHERE cq.quest_id = q.id)
    OR EXISTS (SELECT 1 FROM public.sis_curriculum_quests scq WHERE scq.quest_id = q.id)
    OR EXISTS (
      -- (organization_id, quest_id, audience) is the unique key, so leading
      -- with the org uses its index.
      SELECT 1 FROM public.sis_staff_training st
      WHERE st.organization_id = q.organization_id AND st.quest_id = q.id
    );
$function$;

COMMENT ON FUNCTION public.quest_is_assigned(public.quests) IS
  'True when the quest is on a class, a curriculum or the training catalog. '
  'Quest discovery hides a school quest unless this is true (2026-09-24).';

NOTIFY pgrst, 'reload schema';
