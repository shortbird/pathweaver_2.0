-- Fix get_engagement_summary: learning_events has no quest_id column.
-- Resolve quest association through learning_events.attached_task_id -> user_quest_tasks.quest_id.
-- Without this fix the function fails to parse with "column quest_id does not exist",
-- breaking /api/users/me/engagement, /api/quests/:id/engagement, and the parent variant.

CREATE OR REPLACE FUNCTION public.get_engagement_summary(
  p_user_id uuid,
  p_quest_id uuid DEFAULT NULL,
  p_since date DEFAULT NULL
)
RETURNS TABLE(activity_date date, activity_count bigint, activity_types text[])
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_since DATE;
BEGIN
  v_since := COALESCE(p_since, (CURRENT_DATE - INTERVAL '12 weeks')::DATE);

  RETURN QUERY
  WITH all_activities AS (
    -- Task completions
    SELECT
      completed_at::DATE AS act_date,
      'task_completed'::TEXT AS evt_type
    FROM quest_task_completions
    WHERE user_id = p_user_id
      AND completed_at >= v_since
      AND (p_quest_id IS NULL OR quest_id = p_quest_id)

    UNION ALL

    -- Activity events (task_completed excluded to avoid double-counting)
    SELECT
      created_at::DATE AS act_date,
      event_type::TEXT AS evt_type
    FROM user_activity_events
    WHERE user_id = p_user_id
      AND event_type IN ('task_viewed', 'evidence_uploaded', 'tutor_message_sent', 'quest_viewed')
      AND created_at >= v_since
      AND (p_quest_id IS NULL OR event_data->>'quest_id' = p_quest_id::TEXT)

    UNION ALL

    -- Learning moments. Quest is reached via attached_task_id -> user_quest_tasks.quest_id.
    -- When p_quest_id is NULL, all moments match. When set, only moments whose attached
    -- task belongs to that quest match (moments with no attached task drop out under the filter).
    SELECT
      COALESCE(le.event_date, le.created_at::DATE) AS act_date,
      'learning_moment'::TEXT AS evt_type
    FROM learning_events le
    LEFT JOIN user_quest_tasks uqt ON uqt.id = le.attached_task_id
    WHERE le.user_id = p_user_id
      AND COALESCE(le.event_date, le.created_at::DATE) >= v_since
      AND (p_quest_id IS NULL OR uqt.quest_id = p_quest_id)
  )
  SELECT
    a.act_date,
    COUNT(*)::BIGINT,
    ARRAY_AGG(DISTINCT a.evt_type)
  FROM all_activities a
  GROUP BY a.act_date
  ORDER BY a.act_date;
END;
$function$;
