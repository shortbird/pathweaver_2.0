-- Migration: Add captured_by_user_id to learning_events
-- Purpose: Enable parents to capture learning moments for their children
-- The captured_by_user_id tracks who captured the moment (parent) vs who owns it (user_id = child)

-- Add captured_by_user_id column
-- NULL means the student captured their own moment
-- Set to parent's user_id when a parent captures a moment for their child
ALTER TABLE public.learning_events
ADD COLUMN IF NOT EXISTS captured_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Add index for efficient queries filtering by who captured moments
CREATE INDEX IF NOT EXISTS idx_learning_events_captured_by
ON public.learning_events(captured_by_user_id)
WHERE captured_by_user_id IS NOT NULL;

-- Update source_type constraint if it exists to include 'parent_captured'
-- First, check and drop old constraint if exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'learning_events_source_type_check'
        AND table_name = 'learning_events'
    ) THEN
        ALTER TABLE public.learning_events DROP CONSTRAINT learning_events_source_type_check;
    END IF;
EXCEPTION WHEN undefined_object THEN
    -- Constraint doesn't exist, that's fine
    NULL;
END $$;

-- Add new constraint allowing parent_captured
DO $$
BEGIN
    -- Only add constraint if source_type column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'learning_events'
        AND column_name = 'source_type'
    ) THEN
        ALTER TABLE public.learning_events
        ADD CONSTRAINT learning_events_source_type_check
        CHECK (source_type IN ('realtime', 'retroactive', 'parent_captured'));
    END IF;
EXCEPTION WHEN duplicate_object THEN
    -- Constraint already exists
    NULL;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN public.learning_events.captured_by_user_id IS
'The user who captured this moment. NULL = self-captured by student, otherwise = parent/observer who captured it for the student (user_id)';
