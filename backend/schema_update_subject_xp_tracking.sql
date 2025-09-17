-- Migration for subject-specific XP tracking and quest material links
-- Adds support for tracking XP by individual school subjects and quest material links

-- Step 1: Create user_subject_xp table for tracking XP by school subject
CREATE TABLE IF NOT EXISTS user_subject_xp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    school_subject school_subject NOT NULL,
    xp_amount INTEGER NOT NULL DEFAULT 0 CHECK (xp_amount >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, school_subject)
);

-- Step 2: Add material_link field to quests table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'quests' AND column_name = 'material_link') THEN
        ALTER TABLE quests
        ADD COLUMN material_link TEXT;

        COMMENT ON COLUMN quests.material_link IS 'Optional URL link to external materials or resources for this quest';
    END IF;
END$$;

-- Step 3: Add subject_xp_distribution to quest_tasks table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'quest_tasks' AND column_name = 'subject_xp_distribution') THEN
        ALTER TABLE quest_tasks
        ADD COLUMN subject_xp_distribution JSONB DEFAULT '{}';

        COMMENT ON COLUMN quest_tasks.subject_xp_distribution IS 'JSON object mapping school subjects to XP amounts for diploma credit tracking';
    END IF;
END$$;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_subject_xp_user_id ON user_subject_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subject_xp_subject ON user_subject_xp(school_subject);
CREATE INDEX IF NOT EXISTS idx_quest_tasks_subject_xp_distribution ON quest_tasks USING gin(subject_xp_distribution);

-- Step 5: Set up RLS policies for user_subject_xp
ALTER TABLE user_subject_xp ENABLE ROW LEVEL SECURITY;

-- Users can view their own subject XP
CREATE POLICY "Users can view their own subject XP" ON user_subject_xp
    FOR SELECT USING (user_id = auth.uid());

-- Public viewing for diploma pages
CREATE POLICY "Public subject XP viewing for diplomas" ON user_subject_xp
    FOR SELECT USING (true);

-- Only system can insert/update subject XP (through task completion)
CREATE POLICY "System can manage subject XP" ON user_subject_xp
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Step 6: Migrate existing quest_tasks to have default subject XP distributions
-- This populates the new field based on existing school_subjects arrays
UPDATE quest_tasks
SET subject_xp_distribution = (
    SELECT jsonb_object_agg(
        unnest_subject,
        CASE
            WHEN array_length(school_subjects, 1) = 1 THEN xp_amount
            ELSE FLOOR(xp_amount::float / array_length(school_subjects, 1))::int
        END
    )
    FROM unnest(school_subjects) AS unnest_subject
)
WHERE subject_xp_distribution = '{}'
  AND school_subjects IS NOT NULL
  AND array_length(school_subjects, 1) > 0;

-- Step 7: Populate user_subject_xp table with existing data
-- Calculate subject XP from completed tasks
INSERT INTO user_subject_xp (user_id, school_subject, xp_amount)
SELECT
    uqt.user_id,
    subject_key::school_subject,
    COALESCE(SUM(subject_xp_value::integer), 0) as total_xp
FROM user_quest_tasks uqt
JOIN quest_tasks qt ON uqt.quest_task_id = qt.id
CROSS JOIN LATERAL jsonb_each_text(qt.subject_xp_distribution) AS subject_dist(subject_key, subject_xp_value)
WHERE qt.subject_xp_distribution != '{}'
GROUP BY uqt.user_id, subject_key
ON CONFLICT (user_id, school_subject)
DO UPDATE SET
    xp_amount = EXCLUDED.xp_amount,
    updated_at = NOW();

-- Display completion message
DO $$
BEGIN
    RAISE NOTICE 'Subject XP tracking migration completed successfully!';
    RAISE NOTICE 'Created user_subject_xp table with % records',
        (SELECT COUNT(*) FROM user_subject_xp);
    RAISE NOTICE 'Updated % quest_tasks with subject XP distributions',
        (SELECT COUNT(*) FROM quest_tasks WHERE subject_xp_distribution != '{}');
END$$;