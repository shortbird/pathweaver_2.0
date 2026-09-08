-- Migration: Add is_published column to course_quests table
-- Purpose: Allow educators to publish/unpublish projects within a course

-- Add is_published column with default true (published)
ALTER TABLE course_quests
ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN course_quests.is_published IS 'Whether this project is visible to students in the course. Defaults to true (published).';
