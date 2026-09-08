-- Migration: Fix observer_likes constraints for learning events
-- Purpose: Fix the unique constraint to properly handle NULL values
-- Date: February 6, 2026

-- The previous constraint unique_observer_like doesn't work correctly with NULLs
-- because PostgreSQL considers NULL != NULL in unique constraints.
-- We need to use partial unique indexes instead.

-- Drop the problematic constraints
ALTER TABLE observer_likes DROP CONSTRAINT IF EXISTS unique_observer_like;
ALTER TABLE observer_likes DROP CONSTRAINT IF EXISTS check_like_target;

-- Create partial unique indexes that properly handle the mutually exclusive columns
-- Index for completion likes (when learning_event_id is NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_observer_completion_like
ON observer_likes (observer_id, completion_id)
WHERE learning_event_id IS NULL AND completion_id IS NOT NULL;

-- Index for learning event likes (when completion_id is NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_observer_learning_event_like
ON observer_likes (observer_id, learning_event_id)
WHERE completion_id IS NULL AND learning_event_id IS NOT NULL;

-- Re-add the check constraint to ensure exactly one target is set
ALTER TABLE observer_likes ADD CONSTRAINT check_like_target
    CHECK (
        (completion_id IS NOT NULL AND learning_event_id IS NULL) OR
        (completion_id IS NULL AND learning_event_id IS NOT NULL)
    );
