-- ============================================================
-- Migration: Remove accreditor stage from credit review pipeline
-- Date: 2026-05-22
--
-- Context: Optio is now accredited as a platform, so the superadmin's
-- approval IS the credit. The separate accreditor confirmation stage is
-- no longer needed.
--
-- Changes:
--   1. Auto-finalize: every completion currently in 'approved' is treated
--      as if the superadmin's approval was the final stamp. Move them to
--      'finalized' (XP was already moved into user_subject_xp.xp_amount
--      when superadmin approved -- this just promotes the status).
--   2. Drop accreditor_status column entirely (CHECK constraint goes with it).
--   3. Reassign the one existing 'accreditor' user to 'student' so we can
--      tighten the role constraint. (Existing user: tannerbowman+at@gmail.com,
--      a test account.)
--   4. Replace users_role_check and valid_role_check to drop 'accreditor'.
--
-- Not touched here: accreditor_reviews table (already deleted in a prior
-- cleanup); accreditor role enum value in backend Python (cleaned up
-- separately so the code path matches the DB).
-- ============================================================

BEGIN;

-- 1. Promote in-flight approved items to finalized. They already have
--    finalized_at set by the approve handler, but be defensive.
UPDATE quest_task_completions
SET
  diploma_status = 'finalized',
  finalized_at = COALESCE(finalized_at, NOW())
WHERE diploma_status = 'approved';

-- 2. Drop the accreditor_status column. The CHECK constraint
--    (quest_task_completions_accreditor_status_check) is dropped implicitly.
ALTER TABLE quest_task_completions
  DROP COLUMN IF EXISTS accreditor_status;

-- 3. Reassign the 'accreditor' test user to 'student' so role constraints
--    can be tightened without orphaning the row.
UPDATE users
SET role = 'student'
WHERE role = 'accreditor';

-- 4. Replace role CHECK constraints. There are two redundant ones on the
--    users table; both must drop 'accreditor'.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role::text = ANY (ARRAY[
    'student','parent','advisor','observer',
    'org_managed','superadmin'
  ]::text[]));

ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_role_check;
ALTER TABLE users
  ADD CONSTRAINT valid_role_check
  CHECK (role::text = ANY (ARRAY[
    'superadmin','org_admin','student','parent','advisor','observer','org_managed'
  ]::text[]));

COMMIT;

-- Verification
SELECT
  diploma_status,
  COUNT(*) AS total
FROM quest_task_completions
WHERE diploma_status IS NOT NULL
GROUP BY diploma_status
ORDER BY diploma_status;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'quest_task_completions'
  AND column_name = 'accreditor_status';
-- ^ Should return zero rows.

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.users'::regclass
  AND conname IN ('users_role_check', 'valid_role_check');

SELECT COUNT(*) AS accreditor_users_remaining
FROM users
WHERE role = 'accreditor';
-- ^ Should be 0.
