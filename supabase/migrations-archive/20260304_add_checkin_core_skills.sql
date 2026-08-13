-- Migration: Add reading, writing, math notes to advisor_checkins
-- Date: 2026-03-04
-- Description: Adds core skills tracking fields for advisor check-ins

ALTER TABLE advisor_checkins ADD COLUMN IF NOT EXISTS reading_notes TEXT DEFAULT '';
ALTER TABLE advisor_checkins ADD COLUMN IF NOT EXISTS writing_notes TEXT DEFAULT '';
ALTER TABLE advisor_checkins ADD COLUMN IF NOT EXISTS math_notes TEXT DEFAULT '';

COMMENT ON COLUMN advisor_checkins.reading_notes IS 'Notes on what the student is currently reading';
COMMENT ON COLUMN advisor_checkins.writing_notes IS 'Notes on the student writing activities and development';
COMMENT ON COLUMN advisor_checkins.math_notes IS 'Notes on how the student is using mental math skills';
