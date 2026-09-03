-- Migration: Drop likes and reactions tables
-- Purpose: Feed engagement model changed to views + comments only. No likes/reactions.
-- Date: 2026-04-14
-- Note: DESTRUCTIVE. Existing like/reaction data will be lost.

BEGIN;

-- Drop tables (CASCADE to drop dependent RLS policies, indexes, FKs)
DROP TABLE IF EXISTS observer_reactions CASCADE;
DROP TABLE IF EXISTS observer_likes CASCADE;

-- Remove stale notification rows for the deprecated observer_like type
DELETE FROM notifications WHERE type = 'observer_like';

COMMIT;
