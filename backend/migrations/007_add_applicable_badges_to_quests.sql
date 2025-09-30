-- Migration: Add applicable_badges column to quests table
-- Description: Allow quests to belong to multiple badges
-- Date: 2025-09-30

-- Add applicable_badges JSONB column to existing quests table
ALTER TABLE quests
    ADD COLUMN IF NOT EXISTS applicable_badges JSONB DEFAULT '[]'::jsonb;

-- Create GIN index for JSONB search performance
CREATE INDEX IF NOT EXISTS idx_quests_applicable_badges ON quests USING gin(applicable_badges);

-- Add comment for documentation
COMMENT ON COLUMN quests.applicable_badges IS 'Array of badge IDs this quest counts toward';

-- Example of how to query quests by badge:
-- SELECT * FROM quests WHERE applicable_badges @> '["badge-uuid-here"]'::jsonb;
