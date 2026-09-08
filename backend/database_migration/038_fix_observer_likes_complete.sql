-- Run this in Supabase SQL editor

-- Step 1: Add the learning_event_id column to observer_likes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'observer_likes' AND column_name = 'learning_event_id'
    ) THEN
        ALTER TABLE observer_likes ADD COLUMN learning_event_id UUID REFERENCES learning_events(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Step 2: Drop any problematic constraints
ALTER TABLE observer_likes DROP CONSTRAINT IF EXISTS unique_observer_like;
ALTER TABLE observer_likes DROP CONSTRAINT IF EXISTS unique_observer_completion_like;
ALTER TABLE observer_likes DROP CONSTRAINT IF EXISTS check_like_target;

-- Step 3: Create proper partial unique indexes
DROP INDEX IF EXISTS idx_unique_observer_completion_like;
DROP INDEX IF EXISTS idx_unique_observer_learning_event_like;

CREATE UNIQUE INDEX idx_unique_observer_completion_like
ON observer_likes (observer_id, completion_id)
WHERE learning_event_id IS NULL AND completion_id IS NOT NULL;

CREATE UNIQUE INDEX idx_unique_observer_learning_event_like
ON observer_likes (observer_id, learning_event_id)
WHERE completion_id IS NULL AND learning_event_id IS NOT NULL;

-- Step 4: Add index for fast lookups
DROP INDEX IF EXISTS idx_observer_likes_learning_event_id;
CREATE INDEX idx_observer_likes_learning_event_id
ON observer_likes(learning_event_id) WHERE learning_event_id IS NOT NULL;

-- Step 5: Also add to observer_comments table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'observer_comments' AND column_name = 'learning_event_id'
    ) THEN
        ALTER TABLE observer_comments ADD COLUMN learning_event_id UUID REFERENCES learning_events(id) ON DELETE CASCADE;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_observer_comments_learning_event_id;
CREATE INDEX idx_observer_comments_learning_event_id
ON observer_comments(learning_event_id) WHERE learning_event_id IS NOT NULL;
