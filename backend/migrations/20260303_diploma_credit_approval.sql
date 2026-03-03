-- Migration: Diploma Credit Approval Flow
-- Date: 2026-03-03
-- Description: Replaces superadmin-only draft review with student-initiated, advisor-reviewed
--   diploma credit approval. Students request credit, advisors approve or "Grow This".
--   Each iteration is permanently recorded as evidence of the learning process.

-- ============================================================
-- 1. Create diploma_review_rounds table
-- ============================================================
CREATE TABLE IF NOT EXISTS diploma_review_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id UUID NOT NULL REFERENCES quest_task_completions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  -- Student submission
  evidence_snapshot JSONB NOT NULL,
  subject_suggestion JSONB,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Advisor response (NULL until reviewed)
  reviewer_id UUID REFERENCES users(id),
  reviewer_action TEXT,  -- 'approved' | 'grow_this'
  reviewer_feedback TEXT,
  approved_subjects JSONB,  -- final subject distribution (only on approval)
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_rounds_completion ON diploma_review_rounds(completion_id);
CREATE INDEX IF NOT EXISTS idx_review_rounds_reviewer ON diploma_review_rounds(reviewer_id) WHERE reviewer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_rounds_unique ON diploma_review_rounds(completion_id, round_number);

-- ============================================================
-- 2. Add tracking columns to quest_task_completions
-- ============================================================
ALTER TABLE quest_task_completions
  ADD COLUMN IF NOT EXISTS credit_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credit_reviewer_id UUID REFERENCES users(id);

-- ============================================================
-- 3. Update check constraint to allow new status values
-- ============================================================
-- Must drop BEFORE data migration since 'none' etc. aren't allowed yet
ALTER TABLE quest_task_completions
  DROP CONSTRAINT IF EXISTS quest_task_completions_diploma_status_check;

ALTER TABLE quest_task_completions
  ADD CONSTRAINT quest_task_completions_diploma_status_check
  CHECK (diploma_status = ANY (ARRAY[
    'none'::text,
    'pending_review'::text,
    'grow_this'::text,
    'approved'::text,
    -- Legacy values kept for backward compatibility during transition
    'draft'::text,
    'ready_for_credit'::text,
    'finalized'::text
  ]));

-- ============================================================
-- 4. Data migration - update existing diploma_status values
-- ============================================================

-- Change column default from 'draft' to 'none'
ALTER TABLE quest_task_completions ALTER COLUMN diploma_status SET DEFAULT 'none';

-- Draft completions: no credit was requested yet, reset to 'none'
UPDATE quest_task_completions SET diploma_status = 'none'
  WHERE diploma_status = 'draft';

-- Ready-for-credit: superadmin already approved, auto-finalize these
UPDATE quest_task_completions SET diploma_status = 'approved',
  finalized_at = COALESCE(ready_suggested_at, NOW())
  WHERE diploma_status = 'ready_for_credit';

-- Finalized -> approved (rename only)
UPDATE quest_task_completions SET diploma_status = 'approved'
  WHERE diploma_status = 'finalized';

-- ============================================================
-- 5. RLS Policies for diploma_review_rounds
-- ============================================================
ALTER TABLE diploma_review_rounds ENABLE ROW LEVEL SECURITY;

-- Students can read their own review rounds
CREATE POLICY "Students read own review rounds"
  ON diploma_review_rounds FOR SELECT
  USING (completion_id IN (
    SELECT id FROM quest_task_completions WHERE user_id = auth.uid()
  ));

-- Advisors can read rounds for their assigned students
CREATE POLICY "Advisors read assigned student rounds"
  ON diploma_review_rounds FOR SELECT
  USING (completion_id IN (
    SELECT qtc.id FROM quest_task_completions qtc
    JOIN advisor_student_assignments asa ON asa.student_id = qtc.user_id
    WHERE asa.advisor_id = auth.uid() AND asa.is_active = true
  ));

-- Service role can do everything (bypasses RLS)
CREATE POLICY "Service role full access to review rounds"
  ON diploma_review_rounds FOR ALL
  USING (auth.role() = 'service_role');
