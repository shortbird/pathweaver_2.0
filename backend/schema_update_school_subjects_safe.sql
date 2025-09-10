-- Safe migration for school_subjects field
-- Handles any existing pillar values without assumptions about enum constraints

-- Step 1: Create school subjects enum type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'school_subject') THEN
        CREATE TYPE school_subject AS ENUM (
            'language_arts',
            'math',
            'science', 
            'social_studies',
            'financial_literacy',
            'health',
            'pe',
            'fine_arts',
            'cte',
            'digital_literacy',
            'electives'
        );
    END IF;
END$$;

-- Step 2: Add school_subjects column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quest_tasks' AND column_name = 'school_subjects') THEN
        ALTER TABLE quest_tasks 
        ADD COLUMN school_subjects school_subject[] DEFAULT '{}';
        
        -- Add comment to document the new field
        COMMENT ON COLUMN quest_tasks.school_subjects IS 'Array of school subjects this task provides credit for, separate from the XP pillar';
    END IF;
END$$;

-- Step 3: Create index if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_quest_tasks_school_subjects') THEN
        CREATE INDEX idx_quest_tasks_school_subjects ON quest_tasks USING gin(school_subjects);
    END IF;
END$$;

-- Step 4: Update existing tasks with default school subjects
-- Use string comparison to avoid enum constraint issues
UPDATE quest_tasks 
SET school_subjects = 
    CASE 
        -- Map based on string values, regardless of enum type
        WHEN pillar::text = 'arts_creativity' OR pillar::text = 'creativity' THEN 
            ARRAY['fine_arts'::school_subject]
        WHEN pillar::text = 'stem_logic' OR pillar::text = 'critical_thinking' THEN 
            ARRAY['math'::school_subject, 'science'::school_subject]
        WHEN pillar::text = 'life_wellness' OR pillar::text = 'practical_skills' THEN 
            ARRAY['health'::school_subject, 'pe'::school_subject]
        WHEN pillar::text = 'language_communication' OR pillar::text = 'communication' THEN 
            ARRAY['language_arts'::school_subject]
        WHEN pillar::text = 'society_culture' OR pillar::text = 'cultural_literacy' THEN 
            ARRAY['social_studies'::school_subject]
        -- Default fallback for any other values
        ELSE ARRAY['electives'::school_subject]
    END
WHERE (school_subjects = '{}' OR school_subjects IS NULL)
AND EXISTS (SELECT 1 FROM quest_tasks WHERE id = quest_tasks.id);

-- Display completion message
DO $$
BEGIN
    RAISE NOTICE 'School subjects migration completed successfully!';
    RAISE NOTICE 'Updated % tasks with default school subjects', 
        (SELECT COUNT(*) FROM quest_tasks WHERE school_subjects IS NOT NULL AND array_length(school_subjects, 1) > 0);
END$$;