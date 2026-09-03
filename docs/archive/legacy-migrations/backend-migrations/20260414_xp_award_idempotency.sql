-- E3: XP-award idempotency
--
-- Prior to this migration, `quest_task_completions.create_completion` used a
-- read-then-insert pattern. Two concurrent retries of the same task complete
-- could both observe "no existing row" and both insert, double-awarding XP.
--
-- Fix: enforce uniqueness at the DB level so the second insert fails with a
-- constraint violation, which the Python repository layer now catches and
-- treats as a successful idempotent replay.
--
-- Rollout:
--   1. De-duplicate any existing rows (keeps the earliest by completed_at).
--   2. Add UNIQUE (user_id, user_quest_task_id) index.
--   3. Repository code catches 23505 and returns the canonical row.

BEGIN;

-- Step 1 — drop duplicate completions, keeping the earliest.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, user_quest_task_id
      ORDER BY completed_at NULLS LAST, id
    ) AS rn
  FROM quest_task_completions
  WHERE user_quest_task_id IS NOT NULL
)
DELETE FROM quest_task_completions
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2 — unique index. Partial so legacy rows without user_quest_task_id
-- (which historically allowed NULLs) don't block the migration.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_quest_task_completions_user_task
  ON quest_task_completions (user_id, user_quest_task_id)
  WHERE user_quest_task_id IS NOT NULL;

COMMIT;
