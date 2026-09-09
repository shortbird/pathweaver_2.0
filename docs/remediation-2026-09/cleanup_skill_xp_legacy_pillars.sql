-- Remove the mis-keyed user_skill_xp rows (handoff B1).
--
-- APPLIED TO PRODUCTION 2026-09-09. Kept as the record of what was run and as
-- the thing the rollback undoes. Do not run it again -- it is idempotent (there
-- is nothing left to match) but it would DROP AND REBUILD the backup table,
-- which is the only copy of the removed rows.
--
-- Result: 2,850 rows backed up and deleted, 570 students touched, 795 correctly
-- keyed rows and all 376,407 XP left exactly as they were.
--
-- WHAT THESE ROWS ARE. Six account-creation paths seeded a new student's five
-- pillar rows using the pre-2025 DISPLAY names ('Arts & Creativity',
-- 'STEM & Logic') where user_skill_xp.pillar holds a key ('art', 'stem').
-- There is no CHECK constraint on the column, so every write succeeded. As of
-- 2026-09-09 that is 2,850 rows across 570 students -- more wrong-shaped rows
-- than right-shaped ones in the whole table.
--
-- The code was fixed in commit 0cd91cf5. This removes what it already wrote.
--
-- WHY DELETE RATHER THAN RE-KEY. Every one of these rows carries xp_amount = 0,
-- so nothing is lost by dropping them. Re-keying is not an option anyway:
-- user_skill_xp has UNIQUE (user_id, pillar), and 159 of the 570 students
-- already hold correct key rows with real balances, so an UPDATE would collide
-- with exactly the rows that matter. The fixed seeding recreates the zero rows
-- properly on the next account creation, and XPService creates them on demand
-- when a student first earns anything.
--
-- SAFETY. Nothing references user_skill_xp.id -- verified against the live
-- catalog on 2026-09-09, zero foreign keys point at this table. The delete is
-- wrapped in a transaction with two tripwires that abort it rather than let it
-- run over an unexpected shape.
--
-- HOW TO RUN. Paste into the Supabase SQL editor for project
-- vvfgxcykxjybtvpfzwyx (Optio, production) and execute. It prints what it did.
-- The rollback is cleanup_skill_xp_legacy_pillars_rollback.sql, which restores
-- from the backup table this creates.
--
-- VERIFIED BY EXECUTION, not by review. Run end to end against the staging
-- project (kltoyqefmcgolbplplsa, synthetic data only) on 2026-09-09, after
-- reproducing the production shape there:
--
--   * deleted exactly the 15 seeded legacy rows, left all 3,905 real rows
--     untouched with their balances intact, and backed up 15;
--   * the rollback restored all 15;
--   * tripwire 1 was armed deliberately (one legacy row given 4,200 XP) and
--     ABORTED the run, as intended;
--   * staging was then returned to exactly the state it was found in.
--
-- This matters because the repo has been here before: docs/remediation-2026-09
-- records four defects that shipped in reviewed-but-unexecuted SQL.

BEGIN;

-- The five current pillar keys. Anything else in this column is wrong.
CREATE TEMP TABLE _valid_pillars (pillar text PRIMARY KEY);
INSERT INTO _valid_pillars VALUES ('stem'), ('art'), ('communication'), ('civics'), ('wellness');

-- ---------------------------------------------------------------- tripwire 1
-- Every row we are about to delete must be a zero placeholder. If real XP has
-- landed under a legacy name since this was written, STOP: that is a different
-- problem and deleting the row would destroy a balance.
DO $$
DECLARE
  nonzero integer;
BEGIN
  SELECT count(*) INTO nonzero
  FROM public.user_skill_xp
  WHERE pillar NOT IN (SELECT pillar FROM _valid_pillars)
    AND xp_amount <> 0;

  IF nonzero > 0 THEN
    RAISE EXCEPTION
      'ABORTED: % legacy-pillar row(s) carry non-zero XP. Expected 0. '
      'Investigate before deleting -- these would be real balances.', nonzero;
  END IF;
END $$;

-- ---------------------------------------------------------------- tripwire 2
-- Guard against the WHERE clause being wrong in the other direction. If this
-- would delete more than 4,000 rows, or would empty the table, something has
-- changed since 2026-09-09 (2,850 expected) and a person should look first.
DO $$
DECLARE
  doomed  integer;
  keeping integer;
BEGIN
  SELECT count(*) INTO doomed
  FROM public.user_skill_xp
  WHERE pillar NOT IN (SELECT pillar FROM _valid_pillars);

  SELECT count(*) INTO keeping
  FROM public.user_skill_xp
  WHERE pillar IN (SELECT pillar FROM _valid_pillars);

  RAISE NOTICE 'Deleting % legacy row(s); keeping % correctly-keyed row(s).', doomed, keeping;

  IF doomed > 4000 THEN
    RAISE EXCEPTION 'ABORTED: % rows matched, expected about 2850.', doomed;
  END IF;
  IF keeping = 0 THEN
    RAISE EXCEPTION 'ABORTED: this would leave the table empty.';
  END IF;
END $$;

-- ------------------------------------------------------------------- back up
-- A full copy of every row being removed, kept in the database rather than in
-- a file on somebody's laptop. Drop it once you are satisfied (see the rollback
-- script for the retention note).
DROP TABLE IF EXISTS public.user_skill_xp_legacy_backup_20260909;

CREATE TABLE public.user_skill_xp_legacy_backup_20260909 AS
SELECT *
FROM public.user_skill_xp
WHERE pillar NOT IN (SELECT pillar FROM _valid_pillars);

-- The backup holds student rows. RLS on, no policies = service-role only,
-- which is the SIS convention for this kind of table.
ALTER TABLE public.user_skill_xp_legacy_backup_20260909 ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_skill_xp_legacy_backup_20260909 IS
  'Mis-keyed user_skill_xp rows removed 2026-09-09 (handoff B1). All xp_amount 0. '
  'Restore with docs/remediation-2026-09/cleanup_skill_xp_legacy_pillars_rollback.sql. '
  'Safe to drop once the fix in commit 0cd91cf5 has been in production a while.';

-- -------------------------------------------------------------------- delete
DELETE FROM public.user_skill_xp
WHERE pillar NOT IN (SELECT pillar FROM _valid_pillars);

-- ------------------------------------------------------------------- confirm
DO $$
DECLARE
  backed_up integer;
  remaining integer;
BEGIN
  SELECT count(*) INTO backed_up FROM public.user_skill_xp_legacy_backup_20260909;
  SELECT count(*) INTO remaining
  FROM public.user_skill_xp
  WHERE pillar NOT IN (SELECT pillar FROM _valid_pillars);

  RAISE NOTICE 'Backed up % row(s). Legacy rows remaining: %.', backed_up, remaining;

  IF remaining <> 0 THEN
    RAISE EXCEPTION 'ABORTED: % legacy row(s) survived the delete.', remaining;
  END IF;
END $$;

COMMIT;

-- After committing, this should return exactly the five keys and nothing else:
--
--   SELECT pillar, count(*) FROM public.user_skill_xp GROUP BY pillar ORDER BY 1;
