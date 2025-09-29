-- Fix duplicate index on ai_quest_review_history table
-- Issue: Table has two identical indexes that waste resources

-- Drop the duplicate index (keeping the more descriptive one)
DROP INDEX IF EXISTS idx_ai_quest_review_history_generated_quest_id;

-- Verify the remaining index exists and serves the same purpose
-- idx_ai_quest_review_history_quest_id should remain

-- Add comment to document the fix
COMMENT ON INDEX idx_ai_quest_review_history_quest_id IS 'Index on quest_id for AI quest review history lookups';