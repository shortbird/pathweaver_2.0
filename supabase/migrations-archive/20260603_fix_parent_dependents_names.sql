-- Fix get_parent_dependents so the parent/family dashboard stops showing
-- "undefined undefined" for over-13 children.
--
-- Root cause: the function returned dependent_name = u.display_name with no
-- fallback. Under-13 dependents have display_name set, but over-13 children
-- linked via parent_student_links are full student accounts whose display_name
-- is null (their name lives in first_name/last_name). Null display_name +
-- no first/last in the payload rendered as "undefined undefined" and blank
-- avatar initials.
--
-- Fix: coalesce the name to display_name -> "first last" -> email -> 'Student',
-- and also return first_name/last_name so the UI can render avatar initials.
--
-- Adding columns to the RETURNS TABLE requires DROP + CREATE (CREATE OR REPLACE
-- can't change a function's output columns). Grants are re-applied to match
-- 20260602_security_advisor_hardening.sql (service_role only).

DROP FUNCTION IF EXISTS public.get_parent_dependents(uuid);

CREATE FUNCTION public.get_parent_dependents(p_parent_id uuid)
 RETURNS TABLE(
   dependent_id uuid,
   dependent_name character varying,
   first_name character varying,
   last_name character varying,
   date_of_birth date,
   avatar_url text,
   promotion_eligible boolean,
   total_xp integer,
   active_quest_count integer,
   ai_features_enabled boolean,
   ai_chatbot_enabled boolean,
   ai_lesson_helper_enabled boolean,
   ai_task_generation_enabled boolean,
   email character varying
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    COALESCE(
      NULLIF(TRIM(u.display_name), ''),
      NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
      u.email,
      'Student'
    )::varchar,
    u.first_name,
    u.last_name,
    u.date_of_birth,
    u.avatar_url,
    public.is_promotion_eligible(u.id),
    COALESCE(u.total_xp, 0)::INTEGER,
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM public.user_quests uq
      WHERE uq.user_id = u.id AND uq.status = 'active'
    ), 0),
    COALESCE(u.ai_features_enabled, FALSE),
    COALESCE(u.ai_chatbot_enabled, TRUE),
    COALESCE(u.ai_lesson_helper_enabled, TRUE),
    COALESCE(u.ai_task_generation_enabled, TRUE),
    u.email
  FROM public.users u
  WHERE u.id IN (
    SELECT id FROM public.users
    WHERE managed_by_parent_id = p_parent_id AND is_dependent = TRUE
    UNION
    SELECT student_user_id FROM public.parent_student_links
    WHERE parent_user_id = p_parent_id AND status = 'approved'
  );
END;
$function$;

-- Preserve the locked-down grant posture from the security hardening migration.
REVOKE EXECUTE ON FUNCTION public.get_parent_dependents(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_parent_dependents(uuid) TO service_role;
