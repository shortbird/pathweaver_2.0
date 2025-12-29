-- Migration 024: Migrate Existing Curriculum Projects to Courses
-- Purpose: Wrap existing quests with curriculum lessons in course containers
-- Created: 2025-12-29
-- Part of: Course System Refinement - Data Sync Fix

-- This migration finds quests that have curriculum_lessons but are not yet
-- wrapped in a course, and creates course records for them.

BEGIN;

-- ========================================
-- 1. Create courses for orphan curriculum quests
-- ========================================

-- Find quests with curriculum lessons that don't have a course wrapper
-- and create courses for them
INSERT INTO courses (
    id,
    title,
    description,
    organization_id,
    created_by,
    status,
    visibility,
    navigation_mode,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid() AS id,
    q.title,
    q.description,
    q.organization_id,
    q.created_by,
    'draft' AS status,
    'organization' AS visibility,
    'sequential' AS navigation_mode,
    q.created_at,
    NOW() AS updated_at
FROM quests q
WHERE EXISTS (
    -- Quest has at least one curriculum lesson
    SELECT 1 FROM curriculum_lessons cl WHERE cl.quest_id = q.id
)
AND NOT EXISTS (
    -- Quest is not already linked to a course
    SELECT 1 FROM course_quests cq WHERE cq.quest_id = q.id
)
AND q.organization_id IS NOT NULL
AND q.created_by IS NOT NULL;

-- ========================================
-- 2. Link orphan quests to their new courses
-- ========================================

-- Now create course_quests entries to link quests to their new courses
-- We match by title and organization_id since we just created courses with same title
INSERT INTO course_quests (
    id,
    course_id,
    quest_id,
    sequence_order,
    is_required,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid() AS id,
    c.id AS course_id,
    q.id AS quest_id,
    1 AS sequence_order,  -- First (and only) project in course
    true AS is_required,
    NOW() AS created_at,
    NOW() AS updated_at
FROM quests q
INNER JOIN courses c ON (
    c.title = q.title
    AND c.organization_id = q.organization_id
    AND c.created_by = q.created_by
)
WHERE EXISTS (
    -- Quest has at least one curriculum lesson
    SELECT 1 FROM curriculum_lessons cl WHERE cl.quest_id = q.id
)
AND NOT EXISTS (
    -- Quest is not already linked to a course (before this migration)
    SELECT 1 FROM course_quests cq
    WHERE cq.quest_id = q.id
    AND cq.created_at < NOW() - INTERVAL '1 second'
);

-- ========================================
-- 3. Log migration results
-- ========================================

-- Log how many courses were created
DO $$
DECLARE
    course_count INTEGER;
    link_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO course_count
    FROM courses c
    WHERE c.created_at >= NOW() - INTERVAL '1 minute'
    AND EXISTS (
        SELECT 1 FROM course_quests cq
        WHERE cq.course_id = c.id
        AND cq.created_at >= NOW() - INTERVAL '1 minute'
    );

    SELECT COUNT(*) INTO link_count
    FROM course_quests cq
    WHERE cq.created_at >= NOW() - INTERVAL '1 minute';

    RAISE NOTICE 'Migration 024: Created % courses and % course-quest links', course_count, link_count;
END $$;

-- ========================================
-- 4. Add comment for documentation
-- ========================================

COMMENT ON TABLE courses IS 'Structured learning paths that group quests. Migration 024 auto-created courses for existing curriculum quests.';

COMMIT;
