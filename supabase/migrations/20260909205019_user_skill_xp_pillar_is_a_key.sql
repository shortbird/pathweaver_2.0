-- pillar holds a KEY, not a display name.
--
-- Six account-creation paths seeded this column with the pre-2025 display names
-- ('Arts & Creativity', 'STEM & Logic') because nothing refused them: 2,850 rows
-- across 570 students, more wrong-shaped rows than right-shaped ones in the
-- table. All carried xp_amount 0, so no XP was lost, but the seeding never did
-- its job. Application fix: commit 0cd91cf5. Rows removed 2026-09-09 (backup in
-- public.user_skill_xp_legacy_backup_20260909).
--
-- This is the part that makes a seventh path impossible.
--
-- A CHECK rather than a foreign key to a pillars table: there is no pillars
-- table, and creating one to hold five never-changing strings is a bigger change
-- than the problem. The five values live in shared/data/pillars.json;
-- backend/tests/unit/test_pillar_constants_generated.py fails if the
-- application's idea of them diverges from that file, and this constraint is the
-- database's copy of the same five. A sixth pillar has to change both.
--
-- See docs/remediation-2026-09/PHASE_2_SHARED_HANDOFF.md (B1).

ALTER TABLE public.user_skill_xp
  ADD CONSTRAINT user_skill_xp_pillar_is_a_key
  CHECK (pillar IN ('stem', 'art', 'communication', 'civics', 'wellness'));

COMMENT ON CONSTRAINT user_skill_xp_pillar_is_a_key ON public.user_skill_xp IS
  'pillar holds a KEY, not a display name. Six account-creation paths wrote '
  '''Arts & Creativity'' and friends here until 2026-09-09 (2,850 rows, 570 '
  'students) because nothing refused them. See '
  'docs/remediation-2026-09/PHASE_2_SHARED_HANDOFF.md (B1).';
