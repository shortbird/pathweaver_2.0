-- Migration: Draft Feedback System for Diploma Credits
-- Date: 2026-02-15
-- Description: Transforms task completion from binary complete/approve to iterative draft/feedback model
--              supporting "the process is the goal" philosophy

-- ============================================================================
-- 1. Add diploma_status columns to quest_task_completions
-- ============================================================================

-- Add diploma_status column for tracking draft state
ALTER TABLE quest_task_completions
ADD COLUMN IF NOT EXISTS diploma_status TEXT DEFAULT 'draft'
  CHECK (diploma_status IN ('draft', 'ready_for_credit', 'finalized'));

-- Add revision tracking
ALTER TABLE quest_task_completions
ADD COLUMN IF NOT EXISTS revision_number INTEGER DEFAULT 1;

-- Add reviewer tracking
ALTER TABLE quest_task_completions
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);

ALTER TABLE quest_task_completions
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Track when superadmin suggests ready for credit
ALTER TABLE quest_task_completions
ADD COLUMN IF NOT EXISTS ready_suggested_at TIMESTAMPTZ;

-- Add finalized_at timestamp
ALTER TABLE quest_task_completions
ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

-- Create index for efficient filtering of drafts needing review
CREATE INDEX IF NOT EXISTS idx_completions_diploma_status
  ON quest_task_completions(diploma_status)
  WHERE diploma_status IN ('draft', 'ready_for_credit');

-- Create index for reviewer queries
CREATE INDEX IF NOT EXISTS idx_completions_reviewed_by
  ON quest_task_completions(reviewed_by)
  WHERE reviewed_by IS NOT NULL;

-- ============================================================================
-- 2. Create task_feedback table for iterative feedback
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id UUID NOT NULL REFERENCES quest_task_completions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id),
  feedback_text TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for looking up feedback by completion
CREATE INDEX IF NOT EXISTS idx_task_feedback_completion ON task_feedback(completion_id);

-- Index for ordering feedback by time
CREATE INDEX IF NOT EXISTS idx_task_feedback_created ON task_feedback(completion_id, created_at);

-- Comment on table
COMMENT ON TABLE task_feedback IS 'Stores iterative feedback from reviewers on task draft submissions';

-- ============================================================================
-- 3. Add pending_xp column to user_subject_xp
-- ============================================================================

-- Add pending_xp to track XP awaiting student finalization
ALTER TABLE user_subject_xp
ADD COLUMN IF NOT EXISTS pending_xp INTEGER DEFAULT 0;

-- Comment on columns
COMMENT ON COLUMN user_subject_xp.xp_amount IS 'Finalized XP that counts toward diploma credits';
COMMENT ON COLUMN user_subject_xp.pending_xp IS 'XP from drafts marked ready for credit, awaiting student finalization';

-- ============================================================================
-- 4. Add feedback tracking columns to user_quest_tasks
-- ============================================================================

-- Track latest feedback for quick display
ALTER TABLE user_quest_tasks
ADD COLUMN IF NOT EXISTS latest_feedback TEXT;

ALTER TABLE user_quest_tasks
ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;

-- Track current revision number for the task
ALTER TABLE user_quest_tasks
ADD COLUMN IF NOT EXISTS current_revision INTEGER DEFAULT 0;

-- ============================================================================
-- 5. Migrate existing completed tasks to 'finalized' status
-- ============================================================================

-- Auto-finalize all existing completions (backward compatibility)
UPDATE quest_task_completions
SET diploma_status = 'finalized',
    revision_number = 1,
    finalized_at = completed_at
WHERE diploma_status IS NULL OR diploma_status = 'draft';

-- Ensure pending_xp is 0 for existing records (they're already finalized)
UPDATE user_subject_xp
SET pending_xp = 0
WHERE pending_xp IS NULL;

-- ============================================================================
-- 6. Add RLS policies for task_feedback table
-- ============================================================================

-- Enable RLS on task_feedback
ALTER TABLE task_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Superadmins can manage all feedback
CREATE POLICY "Superadmins can manage all feedback"
ON task_feedback
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'superadmin'
  )
);

-- Policy: Users can view feedback on their own completions
CREATE POLICY "Users can view feedback on own completions"
ON task_feedback
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM quest_task_completions qtc
    WHERE qtc.id = task_feedback.completion_id
    AND qtc.user_id = auth.uid()
  )
);

-- ============================================================================
-- 7. Create function for finalizing subject XP
-- ============================================================================

-- Function to move pending_xp to xp_amount atomically
CREATE OR REPLACE FUNCTION finalize_subject_xp(
  p_user_id UUID,
  p_school_subject TEXT,
  p_completion_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pending_xp INTEGER;
  v_new_total INTEGER;
BEGIN
  -- Get the pending XP for this subject
  SELECT pending_xp INTO v_pending_xp
  FROM user_subject_xp
  WHERE user_id = p_user_id AND school_subject = p_school_subject;

  IF v_pending_xp IS NULL OR v_pending_xp = 0 THEN
    RETURN 0;
  END IF;

  -- Move pending to finalized
  UPDATE user_subject_xp
  SET xp_amount = xp_amount + pending_xp,
      pending_xp = 0,
      updated_at = NOW()
  WHERE user_id = p_user_id AND school_subject = p_school_subject
  RETURNING xp_amount INTO v_new_total;

  -- Update the completion record
  UPDATE quest_task_completions
  SET diploma_status = 'finalized',
      finalized_at = NOW()
  WHERE id = p_completion_id;

  RETURN v_new_total;
END;
$$;

-- ============================================================================
-- Verification queries
-- ============================================================================

-- Verify columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'quest_task_completions'
  AND column_name IN ('diploma_status', 'revision_number', 'reviewed_by', 'reviewed_at', 'ready_suggested_at', 'finalized_at')
ORDER BY column_name;

-- Verify task_feedback table exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'task_feedback';

-- Verify pending_xp column in user_subject_xp
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'user_subject_xp'
  AND column_name = 'pending_xp';
