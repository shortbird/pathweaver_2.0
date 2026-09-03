-- ============================================================
-- Migration: Merge pending_optio_approval into pending_review
-- Date: 2026-05-22
--
-- Context: After removing the accreditor stage, the only distinction
-- between 'pending_optio_approval' and 'pending_review' was upstream
-- context (org admin already approved vs platform student going
-- straight to superadmin). Functionally identical from the reviewer's
-- POV. Collapse to one "superadmin: please review" state.
--
-- After this migration:
--   Org student:      pending_org_approval -> pending_review -> finalized
--   Platform student: pending_review -> finalized
--
-- Upstream context (was org admin approved?) is still recoverable via
-- quest_task_completions.org_reviewer_id and diploma_review_rounds.
-- ============================================================

BEGIN;

-- 1. Promote in-flight rows.
UPDATE quest_task_completions
SET diploma_status = 'pending_review'
WHERE diploma_status = 'pending_optio_approval';

-- 2. Tighten the CHECK constraint to drop pending_optio_approval (and the
--    now-unused 'approved' interim state from the prior migration).
ALTER TABLE quest_task_completions
  DROP CONSTRAINT IF EXISTS quest_task_completions_diploma_status_check;

ALTER TABLE quest_task_completions
  ADD CONSTRAINT quest_task_completions_diploma_status_check
  CHECK (diploma_status IN (
    'none', 'draft', 'ready_for_credit',
    'pending_review', 'pending_org_approval',
    'grow_this', 'finalized', 'merged'
  ));

-- 3. Drop the no-longer-useful partial index.
DROP INDEX IF EXISTS idx_completions_pending_optio_approval;

COMMIT;

-- Verification
SELECT diploma_status, COUNT(*) AS total
FROM quest_task_completions
WHERE diploma_status IS NOT NULL
GROUP BY diploma_status
ORDER BY diploma_status;
-- ^ Should show: no 'pending_optio_approval' rows, no 'approved' rows.

SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.quest_task_completions'::regclass
  AND conname = 'quest_task_completions_diploma_status_check';
-- ^ Should not include 'pending_optio_approval' or 'approved'.
