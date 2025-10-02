-- AI Performance Analytics Migration
-- Adds helper function for AI vs human quest comparison

-- ============================================
-- Helper Function: Get Human Quest Performance
-- ============================================
-- Calculates performance metrics for human-created quests
CREATE OR REPLACE FUNCTION get_human_quest_performance(days_back_param INTEGER DEFAULT 30)
RETURNS TABLE (
    total_quests BIGINT,
    avg_completion_rate NUMERIC,
    avg_rating NUMERIC,
    avg_engagement_score NUMERIC
) AS $$
DECLARE
    date_cutoff TIMESTAMPTZ;
BEGIN
    date_cutoff := NOW() - (days_back_param || ' days')::INTERVAL;

    RETURN QUERY
    SELECT
        COUNT(DISTINCT q.id) as total_quests,
        COALESCE(
            AVG(
                CASE
                    WHEN uq_counts.total_enrollments > 0
                    THEN uq_counts.completed_count::DECIMAL / uq_counts.total_enrollments
                    ELSE 0
                END
            ),
            0
        ) as avg_completion_rate,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COALESCE(
            AVG(
                CASE
                    WHEN task_counts.total_tasks > 0 AND uq_counts.total_enrollments > 0
                    THEN tc_counts.completion_count::DECIMAL / (task_counts.total_tasks * uq_counts.total_enrollments)
                    ELSE 0
                END
            ),
            0
        ) as avg_engagement_score
    FROM quests q
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*) as total_enrollments,
            COUNT(uq.completed_at) as completed_count
        FROM user_quests uq
        WHERE uq.quest_id = q.id
    ) uq_counts ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*) as total_tasks
        FROM quest_tasks qt
        WHERE qt.quest_id = q.id
    ) task_counts ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*) as completion_count
        FROM quest_task_completions tc
        WHERE tc.quest_id = q.id
    ) tc_counts ON TRUE
    LEFT JOIN quest_ratings r ON r.quest_id = q.id
    WHERE
        q.created_at >= date_cutoff
        AND q.source NOT IN ('ai_generated', 'custom')
        AND q.is_active = TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON FUNCTION get_human_quest_performance(INTEGER) IS 'Calculates average performance metrics for human-created quests over specified time period';
