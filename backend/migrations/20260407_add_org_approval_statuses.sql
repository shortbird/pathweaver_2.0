-- ============================================================
-- Migration: Add org_admin pre-approval step for diploma credit
-- Date: 2026-04-07
--
-- Adds two new diploma_status values:
--   pending_org_approval   - awaiting org_admin review
--   pending_optio_approval - org_admin approved, awaiting superadmin review
--
-- Adds org_reviewer_id column to track which org_admin approved.
-- ============================================================

-- 1. Update diploma_status CHECK constraint
ALTER TABLE quest_task_completions
  DROP CONSTRAINT IF EXISTS quest_task_completions_diploma_status_check;

ALTER TABLE quest_task_completions
  ADD CONSTRAINT quest_task_completions_diploma_status_check
  CHECK (diploma_status IN (
    'none', 'draft', 'ready_for_credit',
    'pending_review', 'pending_org_approval', 'pending_optio_approval',
    'grow_this', 'approved', 'finalized', 'merged'
  ));

-- 2. Add org_reviewer_id column
ALTER TABLE quest_task_completions
  ADD COLUMN IF NOT EXISTS org_reviewer_id UUID;

-- 3. Add index for org approval queue queries
CREATE INDEX IF NOT EXISTS idx_completions_pending_org_approval
  ON quest_task_completions(diploma_status)
  WHERE diploma_status = 'pending_org_approval';

CREATE INDEX IF NOT EXISTS idx_completions_pending_optio_approval
  ON quest_task_completions(diploma_status)
  WHERE diploma_status = 'pending_optio_approval';

-- 4. Verification
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'quest_task_completions'::regclass
  AND conname = 'quest_task_completions_diploma_status_check';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'quest_task_completions'
  AND column_name = 'org_reviewer_id';
