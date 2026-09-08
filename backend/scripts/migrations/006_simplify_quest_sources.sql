-- File: migrations/006_simplify_quest_sources.sql
-- Purpose: Simplify quest sources to 'optio' or 'lms'
-- Date: January 2025

-- Migrate all existing sources to 'optio'
UPDATE quests
SET source = 'optio'
WHERE source IS NULL
   OR source = ''
   OR source IN ('khan_academy', 'brilliant', 'custom', 'other');

-- Add LMS-related columns
ALTER TABLE quests
  ADD COLUMN IF NOT EXISTS lms_course_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS lms_assignment_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS lms_platform VARCHAR(50);

-- Remove external integration columns (if they exist)
ALTER TABLE quests
  DROP COLUMN IF EXISTS source_url CASCADE,
  DROP COLUMN IF EXISTS external_course_id CASCADE;

-- Add constraint for valid sources
ALTER TABLE quests DROP CONSTRAINT IF EXISTS quests_source_check;
ALTER TABLE quests ADD CONSTRAINT quests_source_check
  CHECK (source IN ('optio', 'lms'));

-- Verify source distribution
SELECT source, COUNT(*) as count
FROM quests
GROUP BY source;
-- Should only show 'optio' and maybe 'lms'

-- Verify LMS columns exist
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'quests'
  AND column_name IN ('lms_course_id', 'lms_assignment_id', 'lms_platform');
-- Should return 3 rows
