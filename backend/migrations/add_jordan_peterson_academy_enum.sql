-- Migration: Add jordan_peterson_academy to quest_source enum
-- This fixes the enum constraint issue when adding new source images

-- First, check if the enum value already exists
DO $$
BEGIN
    -- Add the new enum value if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'jordan_peterson_academy'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'quest_source')
    ) THEN
        ALTER TYPE quest_source ADD VALUE 'jordan_peterson_academy';
        RAISE NOTICE 'Added jordan_peterson_academy to quest_source enum';
    ELSE
        RAISE NOTICE 'jordan_peterson_academy already exists in quest_source enum';
    END IF;
END $$;