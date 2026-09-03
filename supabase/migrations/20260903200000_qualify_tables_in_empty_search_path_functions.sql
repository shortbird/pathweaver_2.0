-- ============================================================================
-- Schema-qualify tables inside SECURITY DEFINER functions pinned to an empty
-- search_path.
-- ============================================================================
-- 20260602_security_advisor_hardening.sql set `SET search_path = ''` on a batch
-- of SECURITY DEFINER functions to clear Supabase linter warnings. Pinning the
-- search_path is correct and should stay. What the batch missed is the other
-- half of the change: with an empty search_path NOTHING is searched except
-- pg_catalog, so every unqualified table reference inside those bodies stopped
-- resolving. The functions have been raising
--
--     42P01: relation "users" does not exist
--
-- ever since -- not "function missing", but the function existing and failing
-- the moment it runs.
--
-- Found on 2026-09-03 from a local backend log: repositories/quest_repository
-- calls get_user_organization on every quest listing, catches the failure, logs
-- "RPC get_user_organization not found, using direct query" and falls back. So
-- nothing was broken for users -- it just did a wasted round trip and a warning
-- on every call, and the function was dead while looking alive.
--
-- Only the table references change. Signatures, security, ownership and the
-- pinned search_path are all preserved. pg_catalog is always searched, so
-- NOW() and INTERVAL need no qualification.
-- ============================================================================

-- 1) get_user_organization -- the live one, called twice from quest_repository.
CREATE OR REPLACE FUNCTION public.get_user_organization(p_user_id uuid)
 RETURNS TABLE(organization_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT u.organization_id
  FROM public.users u
  WHERE u.id = p_user_id;
END;
$function$;

-- 2) add_user_skill_xp. The `user_skill_xp.xp_amount` reference in ON CONFLICT
--    stays unqualified on purpose: there it names the conflict target's
--    implicit alias, not a schema lookup.
CREATE OR REPLACE FUNCTION public.add_user_skill_xp(p_user_id uuid, p_pillar text, p_xp_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF p_user_id IS NULL OR p_pillar IS NULL OR p_xp_amount IS NULL THEN
        RAISE EXCEPTION 'All parameters are required';
    END IF;

    IF p_xp_amount < 0 OR p_xp_amount > 10000 THEN
        RAISE EXCEPTION 'XP amount must be between 0 and 10000';
    END IF;

    IF p_pillar NOT IN ('stem', 'wellness', 'communication', 'civics', 'art') THEN
        RAISE EXCEPTION 'Invalid pillar. Must be one of: stem, wellness, communication, civics, art';
    END IF;

    INSERT INTO public.user_skill_xp (user_id, pillar, xp_amount)
    VALUES (p_user_id, p_pillar, p_xp_amount)
    ON CONFLICT (user_id, pillar)
    DO UPDATE SET
        xp_amount = user_skill_xp.xp_amount + p_xp_amount,
        updated_at = NOW();

    UPDATE public.users
    SET total_xp = total_xp + p_xp_amount,
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$function$;

-- 3) log_observer_access.
CREATE OR REPLACE FUNCTION public.log_observer_access(p_observer_id uuid, p_student_id uuid, p_action_type character varying, p_resource_type character varying DEFAULT NULL::character varying, p_resource_id uuid DEFAULT NULL::uuid, p_ip_address character varying DEFAULT NULL::character varying, p_user_agent text DEFAULT NULL::text, p_request_path text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO public.observer_access_audit (
        observer_id, student_id, action_type, resource_type, resource_id,
        ip_address, user_agent, request_path, metadata
    ) VALUES (
        p_observer_id, p_student_id, p_action_type, p_resource_type, p_resource_id,
        p_ip_address, p_user_agent, p_request_path, p_metadata
    ) RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$function$;

-- 4) verify_parent_student_access. This one needed MORE than qualification, and
--    qualifying it alone would have been worse than leaving it broken.
--
--    Its body was written against a schema that no longer exists: it read
--    parent_student_links.parent_id / .student_id (the columns are
--    parent_user_id / student_user_id) and matched status = 'accepted' (no row
--    has ever had that value; the live statuses are 'approved' and 'active',
--    per utils/portfolio_access.ACTIVE_LINK_STATUSES).
--
--    So a search_path-only fix would have turned a loud 42P01 into a silent
--    FALSE -- a parent-access check that answers "no access" for every parent,
--    quietly. Nothing calls it today, which is the only reason that was not
--    already a live bug.
CREATE OR REPLACE FUNCTION public.verify_parent_student_access(p_parent_id uuid, p_student_id uuid)
 RETURNS TABLE(has_access boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    RETURN QUERY
    SELECT EXISTS (
        -- A linked parent of a 13+ student.
        SELECT 1 FROM public.parent_student_links
        WHERE parent_user_id = p_parent_id
          AND student_user_id = p_student_id
          AND status IN ('approved', 'active')

        UNION

        -- Or the student is this parent's dependent.
        SELECT 1 FROM public.users
        WHERE id = p_student_id
          AND is_dependent = TRUE
          AND managed_by_parent_id = p_parent_id
    );
END;
$function$;

-- ============================================================================
-- DELIBERATELY NOT FIXED: public.get_human_quest_performance
--
-- It has the same empty-search_path defect, but qualification cannot save it:
-- the body reads `quest_ratings` and `quest_tasks_archived`, and neither table
-- exists any more. Adding `public.` would swap one 42P01 for another. Nothing
-- calls it. It wants deleting or rewriting against the current schema, and that
-- is a decision rather than a fix -- left for the user.
-- ============================================================================
