-- Migration: Remove enum constraint from quests.source column
-- This allows adding new source images without enum constraint issues

-- Step 1: Create a backup of current data (optional, for safety)
-- Step 2: Change the column type from enum to varchar to allow any source value

BEGIN;

-- Check current enum values for reference
SELECT unnest(enum_range(NULL::quest_source)) AS current_enum_values;

-- Change the column type from quest_source enum to varchar
-- This removes the enum constraint and allows any string value
ALTER TABLE quests
ALTER COLUMN source TYPE varchar(100) USING source::varchar;

-- Optional: Add a comment explaining the change
COMMENT ON COLUMN quests.source IS 'Source identifier - can be any string value (previously constrained by quest_source enum)';

COMMIT;

-- Note: After this migration, the quest_source enum type can be dropped if not used elsewhere
-- DROP TYPE IF EXISTS quest_source;