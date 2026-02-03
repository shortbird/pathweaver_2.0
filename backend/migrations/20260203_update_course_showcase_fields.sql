-- Migration: Update showcase fields for public course pages
-- Date: 2026-02-03
-- Purpose: Replace academic fields with parent-friendly guidance

-- Add educational value field (replaces academic_alignment)
-- Focuses on real-world learning benefits, not school subjects
ALTER TABLE courses ADD COLUMN IF NOT EXISTS educational_value TEXT;

-- Add parent guidance by age group (replaces guidance_level, age_range)
-- JSONB with keys: ages_5_10, ages_10_14, ages_15_18
-- Each contains specific tips for parents of that age group
ALTER TABLE courses ADD COLUMN IF NOT EXISTS parent_guidance JSONB DEFAULT '{}';

-- Drop old columns that are no longer used
-- (Keep them for now in case of rollback, can drop in future migration)
-- ALTER TABLE courses DROP COLUMN IF EXISTS guidance_level;
-- ALTER TABLE courses DROP COLUMN IF EXISTS academic_alignment;
-- ALTER TABLE courses DROP COLUMN IF EXISTS age_range;
-- ALTER TABLE courses DROP COLUMN IF EXISTS estimated_hours;

-- Update comments
COMMENT ON COLUMN courses.educational_value IS 'How this course helps kids learn and grow through hands-on experience';
COMMENT ON COLUMN courses.parent_guidance IS 'JSONB with age-specific tips: ages_5_10, ages_10_14, ages_15_18';
