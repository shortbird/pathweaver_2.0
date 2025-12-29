-- Migration 025: Add XP Threshold to Course Quests (Projects)
-- Purpose: Allow teachers to set XP requirements before students can access projects
-- Created: 2025-12-29
-- Part of: LMS Transformation - Sequential Project Unlocking with Progress Gates

BEGIN;

-- ========================================
-- 1. Add xp_threshold column to course_quests
-- ========================================

-- XP threshold that students must earn before accessing this project
-- NULL or 0 means no threshold (project is immediately accessible)
ALTER TABLE course_quests
ADD COLUMN IF NOT EXISTS xp_threshold INTEGER DEFAULT 0;

-- Add constraint to ensure non-negative values
ALTER TABLE course_quests
ADD CONSTRAINT check_course_quest_xp_threshold_non_negative
CHECK (xp_threshold IS NULL OR xp_threshold >= 0);

-- ========================================
-- 2. Add index for efficient filtering
-- ========================================

CREATE INDEX IF NOT EXISTS idx_course_quests_xp_threshold
ON course_quests(xp_threshold)
WHERE xp_threshold > 0;

-- ========================================
-- 3. Documentation
-- ========================================

COMMENT ON COLUMN course_quests.xp_threshold IS 'Minimum XP students must have earned before accessing this project. 0 or NULL means no requirement (auto-unlocked for first project).';

COMMIT;
