-- Migration: Drop vestigial badge columns
-- Purpose: Badges feature removed 2026-04; clean up columns that used to
--          reference or store badge data.
-- Date: 2026-04-14

BEGIN;

ALTER TABLE courses DROP COLUMN IF EXISTS badge_id;
ALTER TABLE ai_quest_review_queue DROP COLUMN IF EXISTS badge_id;
ALTER TABLE quests DROP COLUMN IF EXISTS applicable_badges;
ALTER TABLE users DROP COLUMN IF EXISTS badges;

COMMIT;
