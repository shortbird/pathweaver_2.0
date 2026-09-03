-- Migration 08: Standardize pillar enum values
-- Ensures pillar_type enum has all necessary values for the V3 personalized system

-- The pillar_type enum should support both legacy shortened format and new underscore format
-- Legacy: communication, creativity, practical_skills, critical_thinking, cultural_literacy
-- New: language_communication, arts_creativity, life_wellness, stem_logic, society_culture

DO $$
BEGIN
    -- Add new enum values if they don't exist (won't error if they already exist)
    BEGIN
        ALTER TYPE pillar_type ADD VALUE IF NOT EXISTS 'language_communication';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE pillar_type ADD VALUE IF NOT EXISTS 'arts_creativity';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE pillar_type ADD VALUE IF NOT EXISTS 'life_wellness';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE pillar_type ADD VALUE IF NOT EXISTS 'stem_logic';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE pillar_type ADD VALUE IF NOT EXISTS 'society_culture';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Also ensure legacy values exist for backward compatibility
    BEGIN
        ALTER TYPE pillar_type ADD VALUE IF NOT EXISTS 'communication';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE pillar_type ADD VALUE IF NOT EXISTS 'creativity';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE pillar_type ADD VALUE IF NOT EXISTS 'practical_skills';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE pillar_type ADD VALUE IF NOT EXISTS 'critical_thinking';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE pillar_type ADD VALUE IF NOT EXISTS 'cultural_literacy';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    RAISE NOTICE 'Pillar enum values standardized successfully';
END $$;

-- Add a comment documenting the enum values
COMMENT ON TYPE pillar_type IS 'Skill pillars supporting both legacy (communication, creativity, practical_skills, critical_thinking, cultural_literacy) and new (language_communication, arts_creativity, life_wellness, stem_logic, society_culture) formats. Backend converts between formats using pillar_mapping.py utility.';
