-- Migration: Add learning_event_id to observer_likes and observer_comments
-- Purpose: Enable likes and comments on learning moments (not just task completions)
-- Date: February 6, 2026

-- ============================================
-- Part 1: Update observer_likes table
-- ============================================

-- Add learning_event_id column (nullable, since a like can be for completion OR learning event)
ALTER TABLE observer_likes
ADD COLUMN IF NOT EXISTS learning_event_id UUID REFERENCES learning_events(id) ON DELETE CASCADE;

-- Drop the unique constraint that only considers completion_id
ALTER TABLE observer_likes DROP CONSTRAINT IF EXISTS unique_observer_completion_like;

-- Add a new constraint that prevents duplicate likes on either type
-- An observer can only like a specific completion OR learning event once
ALTER TABLE observer_likes ADD CONSTRAINT unique_observer_like
    UNIQUE (observer_id, completion_id, learning_event_id);

-- Add a check constraint: exactly one of completion_id or learning_event_id must be set
ALTER TABLE observer_likes ADD CONSTRAINT check_like_target
    CHECK (
        (completion_id IS NOT NULL AND learning_event_id IS NULL) OR
        (completion_id IS NULL AND learning_event_id IS NOT NULL)
    );

-- Index for learning_event_id lookups
CREATE INDEX IF NOT EXISTS idx_observer_likes_learning_event_id
ON observer_likes(learning_event_id) WHERE learning_event_id IS NOT NULL;

-- ============================================
-- Part 2: Update observer_comments table
-- ============================================

-- Add learning_event_id column (nullable, since a comment can be for completion OR learning event)
ALTER TABLE observer_comments
ADD COLUMN IF NOT EXISTS learning_event_id UUID REFERENCES learning_events(id) ON DELETE CASCADE;

-- Index for learning_event_id lookups
CREATE INDEX IF NOT EXISTS idx_observer_comments_learning_event_id
ON observer_comments(learning_event_id) WHERE learning_event_id IS NOT NULL;

-- ============================================
-- Part 3: Update RLS policies for observer_likes
-- ============================================

-- Drop existing policies to recreate with learning event support
DROP POLICY IF EXISTS observer_view_likes ON observer_likes;
DROP POLICY IF EXISTS observer_insert_likes ON observer_likes;

-- Policy: Observers can view likes on completions/learning events they have access to
CREATE POLICY observer_view_likes ON observer_likes
    FOR SELECT
    USING (
        -- Observer can see their own likes
        observer_id = auth.uid()
        OR
        -- Likes on students they have observer access to (task completions)
        EXISTS (
            SELECT 1 FROM quest_task_completions qtc
            JOIN observer_student_links osl ON osl.student_id = qtc.user_id
            WHERE qtc.id = observer_likes.completion_id
            AND osl.observer_id = auth.uid()
        )
        OR
        -- Likes on students they have observer access to (learning events)
        EXISTS (
            SELECT 1 FROM learning_events le
            JOIN observer_student_links osl ON osl.student_id = le.user_id
            WHERE le.id = observer_likes.learning_event_id
            AND osl.observer_id = auth.uid()
        )
    );

-- Policy: Observers can insert likes on content they have access to
CREATE POLICY observer_insert_likes ON observer_likes
    FOR INSERT
    WITH CHECK (
        observer_id = auth.uid()
        AND (
            -- Access to task completion
            EXISTS (
                SELECT 1 FROM quest_task_completions qtc
                JOIN observer_student_links osl ON osl.student_id = qtc.user_id
                WHERE qtc.id = observer_likes.completion_id
                AND osl.observer_id = auth.uid()
            )
            OR
            -- Access to learning event
            EXISTS (
                SELECT 1 FROM learning_events le
                JOIN observer_student_links osl ON osl.student_id = le.user_id
                WHERE le.id = observer_likes.learning_event_id
                AND osl.observer_id = auth.uid()
            )
        )
    );

-- ============================================
-- Part 4: Add comments on new columns
-- ============================================

COMMENT ON COLUMN observer_likes.learning_event_id IS 'Reference to learning_events for likes on learning moments (mutually exclusive with completion_id)';
COMMENT ON COLUMN observer_comments.learning_event_id IS 'Reference to learning_events for comments on learning moments (optional, can coexist with task_completion_id)';
