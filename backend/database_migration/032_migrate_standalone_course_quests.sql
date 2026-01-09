-- Migration 032: Migrate Standalone Course Quests into Course Containers
-- Purpose: Wrap all existing course quests (quest_type='course') that are NOT linked to any course
--          into their own Course containers to eliminate standalone course quests
-- Created: 2026-01-08
-- Part of: Course Quest Simplification

BEGIN;

-- ========================================
-- 1. Migration: Create Course containers for standalone course quests
-- ========================================

DO $$
DECLARE
    quest_record RECORD;
    new_course_id UUID;
    migrated_count INTEGER := 0;
    skipped_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting migration of standalone course quests...';

    -- Find standalone course quests (quest_type='course' not linked to any course)
    FOR quest_record IN
        SELECT q.*
        FROM quests q
        WHERE q.quest_type = 'course'
        AND NOT EXISTS (
            SELECT 1 FROM course_quests cq WHERE cq.quest_id = q.id
        )
        -- Only migrate quests that have an organization (required for courses table)
        AND q.organization_id IS NOT NULL
        -- Only migrate quests that have a creator
        AND q.created_by IS NOT NULL
    LOOP
        -- Create a Course container for this quest
        INSERT INTO courses (
            title,
            description,
            organization_id,
            created_by,
            status,
            visibility,
            navigation_mode,
            created_at,
            updated_at
        ) VALUES (
            quest_record.title,
            COALESCE(quest_record.description, quest_record.big_idea, ''),
            quest_record.organization_id,
            quest_record.created_by,
            CASE
                WHEN quest_record.is_active = true THEN 'published'
                ELSE 'draft'
            END,
            'organization',
            'freeform',
            COALESCE(quest_record.created_at, NOW()),
            NOW()
        )
        RETURNING id INTO new_course_id;

        -- Link quest to the new course as a Project
        INSERT INTO course_quests (
            course_id,
            quest_id,
            sequence_order,
            is_required,
            is_published,
            created_at,
            updated_at
        ) VALUES (
            new_course_id,
            quest_record.id,
            1,
            true,
            true,
            NOW(),
            NOW()
        );

        migrated_count := migrated_count + 1;
        RAISE NOTICE 'Migrated quest "%" (id: %) into course %', quest_record.title, quest_record.id, new_course_id;
    END LOOP;

    -- Count skipped quests (those without organization_id or created_by)
    SELECT COUNT(*) INTO skipped_count
    FROM quests q
    WHERE q.quest_type = 'course'
    AND NOT EXISTS (
        SELECT 1 FROM course_quests cq WHERE cq.quest_id = q.id
    )
    AND (q.organization_id IS NULL OR q.created_by IS NULL);

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration complete!';
    RAISE NOTICE 'Migrated: % standalone course quests', migrated_count;
    RAISE NOTICE 'Skipped: % quests (missing organization_id or created_by)', skipped_count;
    RAISE NOTICE '========================================';
END $$;

-- ========================================
-- 2. Documentation
-- ========================================

COMMENT ON TABLE courses IS 'Structured learning paths that group quests (Projects) in a specific sequence. After migration 032, all course quests must be inside a Course.';

COMMIT;
