-- ============================================================================
-- PERSONALIZED QUEST SYSTEM - MIGRATE EXISTING DATA
-- Run this in Supabase SQL Editor AFTER 02_modify_existing_tables.sql
-- WARNING: This script migrates data from old tables to new ones
-- ============================================================================

-- Part 3: Migrate existing data to personalized quest system
-- ============================================================================

-- Migrate quest_tasks to user_quest_tasks for all ACTIVE enrollments
-- This creates user-specific copies of tasks for users currently enrolled in quests
-- Handles both quest_tasks and quest_tasks_archived tables
DO $$
DECLARE
    quest_tasks_exists BOOLEAN;
    quest_tasks_archived_exists BOOLEAN;
    source_table TEXT;
BEGIN
    -- Check if quest_tasks table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'quest_tasks'
    ) INTO quest_tasks_exists;

    -- Check if quest_tasks_archived table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'quest_tasks_archived'
    ) INTO quest_tasks_archived_exists;

    -- Determine which table to use
    IF quest_tasks_exists THEN
        source_table := 'quest_tasks';
        RAISE NOTICE 'Using quest_tasks table for migration';
    ELSIF quest_tasks_archived_exists THEN
        source_table := 'quest_tasks_archived';
        RAISE NOTICE 'Using quest_tasks_archived table for migration';
    ELSE
        RAISE NOTICE 'No quest_tasks or quest_tasks_archived table found - skipping task migration';
        RETURN;
    END IF;

    -- Perform migration using dynamic SQL
    EXECUTE format('
        INSERT INTO user_quest_tasks (
            user_id,
            quest_id,
            user_quest_id,
            title,
            description,
            pillar,
            xp_value,
            order_index,
            is_required,
            is_manual,
            approval_status,
            created_at
        )
        SELECT
            uq.user_id,
            uq.quest_id,
            uq.id as user_quest_id,
            qt.title,
            qt.description,
            qt.pillar,
            COALESCE(qt.xp_amount, 100) as xp_value,
            qt.order_index,
            COALESCE(qt.is_required, true) as is_required,
            false as is_manual,
            ''approved'' as approval_status,
            NOW() as created_at
        FROM user_quests uq
        INNER JOIN %I qt ON qt.quest_id = uq.quest_id
        WHERE uq.is_active = true
        ON CONFLICT DO NOTHING
    ', source_table);
END $$;

-- Get count of migrated tasks
DO $$
DECLARE
    migrated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO migrated_count FROM user_quest_tasks WHERE is_manual = false;
    RAISE NOTICE 'Migrated % tasks to user_quest_tasks', migrated_count;
END $$;

-- Update quest_task_completions to reference new user_quest_tasks
-- This is a complex mapping: find the matching user_quest_task for each completion
-- Handles both quest_tasks and quest_tasks_archived tables
DO $$
DECLARE
    quest_tasks_exists BOOLEAN;
    quest_tasks_archived_exists BOOLEAN;
    source_table TEXT;
BEGIN
    -- Check if quest_tasks table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'quest_tasks'
    ) INTO quest_tasks_exists;

    -- Check if quest_tasks_archived table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'quest_tasks_archived'
    ) INTO quest_tasks_archived_exists;

    -- Determine which table to use
    IF quest_tasks_exists THEN
        source_table := 'quest_tasks';
    ELSIF quest_tasks_archived_exists THEN
        source_table := 'quest_tasks_archived';
    ELSE
        RAISE NOTICE 'No quest_tasks or quest_tasks_archived table found - skipping completion updates';
        RETURN;
    END IF;

    -- Perform update using dynamic SQL
    EXECUTE format('
        UPDATE quest_task_completions qtc
        SET user_quest_task_id = uqt.id
        FROM user_quest_tasks uqt
        WHERE qtc.user_id = uqt.user_id
          AND qtc.quest_id = uqt.quest_id
          AND qtc.task_id IN (
              SELECT qt.id
              FROM %I qt
              WHERE qt.quest_id = uqt.quest_id
                AND qt.title = uqt.title
              LIMIT 1
          )
          AND qtc.user_quest_task_id IS NULL
    ', source_table);
END $$;

-- Get count of updated completions
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO updated_count
    FROM quest_task_completions
    WHERE user_quest_task_id IS NOT NULL;
    RAISE NOTICE 'Updated % task completions with user_quest_task_id', updated_count;
END $$;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Part 3 Complete: Data migration successful';
    RAISE NOTICE 'Review the migrated data before proceeding to Part 4';
END $$;
