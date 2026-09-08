-- Migration 022: Add XP Threshold to Curriculum Lessons
-- Purpose: Allow teachers to set XP requirements before students can access lessons
-- Created: 2025-12-28
-- Part of: LMS Transformation - Sequential Learning with Progress Gates

BEGIN;

-- ========================================
-- 1. Add xp_threshold column to curriculum_lessons
-- ========================================

-- XP threshold that students must earn before accessing this lesson
-- NULL or 0 means no threshold (lesson is immediately accessible)
ALTER TABLE curriculum_lessons
ADD COLUMN IF NOT EXISTS xp_threshold INTEGER DEFAULT 0;

-- Add constraint to ensure non-negative values
ALTER TABLE curriculum_lessons
ADD CONSTRAINT check_xp_threshold_non_negative
CHECK (xp_threshold IS NULL OR xp_threshold >= 0);

-- ========================================
-- 2. Add index for efficient filtering
-- ========================================

CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_xp_threshold
ON curriculum_lessons(xp_threshold)
WHERE xp_threshold > 0;

-- ========================================
-- 3. Documentation
-- ========================================

COMMENT ON COLUMN curriculum_lessons.xp_threshold IS 'Minimum XP students must have earned before accessing this lesson. 0 or NULL means no requirement.';

COMMIT;
