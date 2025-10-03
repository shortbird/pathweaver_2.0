-- ============================================================================
-- PERSONALIZED QUEST SYSTEM - MIGRATE EXISTING DATA
-- Run this in Supabase SQL Editor AFTER 02_modify_existing_tables.sql
-- WARNING: This script migrates data from old tables to new ones
-- ============================================================================

-- Part 3: Migrate existing data to personalized quest system
-- ============================================================================

-- Migrate quest_tasks to user_quest_tasks for all ACTIVE enrollments
-- This creates user-specific copies of tasks for users currently enrolled in quests
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
    'approved' as approval_status,
    NOW() as created_at
FROM user_quests uq
INNER JOIN quest_tasks qt ON qt.quest_id = uq.quest_id
WHERE uq.is_active = true
ON CONFLICT DO NOTHING;

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
UPDATE quest_task_completions qtc
SET user_quest_task_id = uqt.id
FROM user_quest_tasks uqt
WHERE qtc.user_id = uqt.user_id
  AND qtc.quest_id = uqt.quest_id
  AND qtc.task_id IN (
      -- Find the original quest_task that matches this user_quest_task
      SELECT qt.id
      FROM quest_tasks qt
      WHERE qt.quest_id = uqt.quest_id
        AND qt.title = uqt.title
      LIMIT 1
  )
  AND qtc.user_quest_task_id IS NULL;

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
