-- The constraint that would have caught handoff B1 on the first write.
--
-- `user_skill_xp.pillar` has never been constrained, so six code paths spent
-- months writing pre-2025 display names into it and getting 200 back every
-- time. 2,850 rows across 570 students. The application fix (commit 0cd91cf5)
-- stops the six known paths; this stops the seventh.
--
-- ORDER MATTERS. This will fail while the legacy rows are still there, which is
-- the correct behaviour and not a reason to add NOT VALID. Run
-- cleanup_skill_xp_legacy_pillars.sql first.
--
-- NOT PLACED IN supabase/migrations/ ON PURPOSE. The phase that produced this
-- was told not to touch that directory, and the repo's migration history has
-- its own reconciliation story (see MIGRATION_RECONCILIATION.md). Whoever owns
-- migrations should move this into a stamped file and apply it through
-- migrate-prod.yml rather than pasting it into the SQL editor -- that is the
-- whole point of OPS-03 having been closed.
--
-- Why a CHECK and not a foreign key to a pillars table: there is no pillars
-- table, and creating one to hold five never-changing strings would be a
-- bigger change than the problem. The five values live in
-- shared/data/pillars.json; backend/tests/unit/test_pillar_constants_generated.py
-- fails if the application's idea of them ever diverges from that file, and
-- this constraint is the database's copy of the same five. If a sixth pillar is
-- ever added, this constraint is one of the places that has to know.

-- VERIFIED BY EXECUTION on staging (kltoyqefmcgolbplplsa) 2026-09-09: it
-- refuses to be added while legacy rows are present (check_violation, which is
-- the intended behaviour and the reason the cleanup runs first), and once the
-- table is clean it rejects an insert of 'Arts & Creativity' -- the exact write
-- that produced the 2,850 rows.
ALTER TABLE public.user_skill_xp
  ADD CONSTRAINT user_skill_xp_pillar_is_a_key
  CHECK (pillar IN ('stem', 'art', 'communication', 'civics', 'wellness'));

COMMENT ON CONSTRAINT user_skill_xp_pillar_is_a_key ON public.user_skill_xp IS
  'pillar holds a KEY, not a display name. Six account-creation paths wrote '
  '''Arts & Creativity'' and friends here until 2026-09-09 (2,850 rows, 570 '
  'students) because nothing refused them. See '
  'docs/remediation-2026-09/PHASE_2_SHARED_HANDOFF.md (B1).';

-- Verify:
--   SELECT pillar, count(*) FROM public.user_skill_xp GROUP BY pillar ORDER BY 1;
-- should return exactly the five keys.
