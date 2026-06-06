-- Backfill users.total_xp from the authoritative per-pillar user_skill_xp sum.
--
-- users.total_xp is a denormalized cache that drifted out of sync: 43 of 55
-- users with XP had a wrong total, 39 of them too low (e.g. a student showed
-- 6,600 when their real per-pillar total was 12,475 -> "James's XP is much
-- lower"). Root cause: XPService.award_xp only wrote user_skill_xp and
-- user_mastery.total_xp, never users.total_xp.
--
-- Going forward XPService.update_user_mastery() also syncs users.total_xp from
-- the same source (recompute-from-source), so this one-time backfill corrects
-- the historical drift.
UPDATE users u
SET total_xp = COALESCE(
  (SELECT SUM(s.xp_amount) FROM user_skill_xp s WHERE s.user_id = u.id), 0
)
WHERE u.total_xp IS DISTINCT FROM COALESCE(
  (SELECT SUM(s.xp_amount) FROM user_skill_xp s WHERE s.user_id = u.id), 0
);
