-- Migration 033: Clean Up Orphaned Course Quest Enrollments
-- Purpose: End user_quests records that belong to courses that have been deleted
--          These orphaned records cause quests to appear on the dashboard as standalone quests
-- Created: 2026-01-09

BEGIN;

-- ========================================
-- 1. Identify and end orphaned course quest enrollments
-- ========================================

DO $$
DECLARE
    orphaned_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting cleanup of orphaned course quest enrollments...';

    -- Find user_quests where:
    -- 1. The quest is/was linked to a course (exists in course_quests)
    -- 2. The user has no course_enrollment for ANY course containing that quest
    -- 3. The user_quest is still active
    -- This means the course was deleted but the user_quest remains orphaned

    WITH orphaned_quests AS (
        SELECT DISTINCT uq.id, uq.user_id, uq.quest_id
        FROM user_quests uq
        WHERE uq.is_active = TRUE
        -- Quest is part of at least one course
        AND EXISTS (
            SELECT 1 FROM course_quests cq
            WHERE cq.quest_id = uq.quest_id
        )
        -- User has no enrollment in any course that contains this quest
        AND NOT EXISTS (
            SELECT 1 FROM course_enrollments ce
            JOIN course_quests cq ON cq.course_id = ce.course_id
            WHERE ce.user_id = uq.user_id
            AND cq.quest_id = uq.quest_id
        )
    )
    UPDATE user_quests uq
    SET
        is_active = FALSE,
        completed_at = COALESCE(uq.completed_at, NOW()),
        last_set_down_at = NOW()
    FROM orphaned_quests oq
    WHERE uq.id = oq.id;

    GET DIAGNOSTICS orphaned_count = ROW_COUNT;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Cleanup complete!';
    RAISE NOTICE 'Ended % orphaned course quest enrollment(s)', orphaned_count;
    RAISE NOTICE '========================================';
END $$;

-- ========================================
-- 2. Documentation
-- ========================================

COMMENT ON TABLE user_quests IS 'User quest enrollments. Migration 033 cleans up orphaned enrollments from deleted courses.';

COMMIT;
