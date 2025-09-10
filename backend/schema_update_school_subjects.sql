-- Add school_subjects field to quest_tasks table
-- This allows quest tasks to be tagged with multiple school subjects
-- while maintaining the existing pillar system for XP awards

-- Create school subjects enum type
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

-- Add school_subjects column to quest_tasks table
ALTER TABLE quest_tasks 
ADD COLUMN school_subjects school_subject[] DEFAULT '{}';

-- Add comment to document the new field
COMMENT ON COLUMN quest_tasks.school_subjects IS 'Array of school subjects this task provides credit for, separate from the XP pillar';

-- Create index for efficient filtering by school subjects
CREATE INDEX idx_quest_tasks_school_subjects ON quest_tasks USING gin(school_subjects);

-- Update existing tasks with default school subjects based on their pillar
-- This provides a reasonable starting point for migration
UPDATE quest_tasks SET school_subjects = 
    CASE pillar
        WHEN 'arts_creativity' THEN ARRAY['fine_arts'::school_subject]
        WHEN 'stem_logic' THEN ARRAY['math'::school_subject, 'science'::school_subject]
        WHEN 'life_wellness' THEN ARRAY['health'::school_subject, 'pe'::school_subject]
        WHEN 'language_communication' THEN ARRAY['language_arts'::school_subject]
        WHEN 'society_culture' THEN ARRAY['social_studies'::school_subject]
        -- Handle legacy pillar names
        WHEN 'creativity' THEN ARRAY['fine_arts'::school_subject]
        WHEN 'critical_thinking' THEN ARRAY['math'::school_subject, 'science'::school_subject]
        WHEN 'practical_skills' THEN ARRAY['health'::school_subject, 'pe'::school_subject]
        WHEN 'communication' THEN ARRAY['language_arts'::school_subject]
        WHEN 'cultural_literacy' THEN ARRAY['social_studies'::school_subject]
        ELSE ARRAY['electives'::school_subject]
    END
WHERE school_subjects = '{}';