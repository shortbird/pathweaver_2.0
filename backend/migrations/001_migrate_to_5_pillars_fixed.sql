-- Migration to 5-pillar system (FIXED VERSION)
-- This migration converts the old 6-category system to the new 5-pillar system
-- Old: reading_writing, thinking_skills, personal_growth, life_skills, making_creating, world_understanding
-- New: creativity, critical_thinking, practical_skills, communication, cultural_literacy

-- Step 1: Drop existing tables if they exist and recreate with correct schema
DROP TABLE IF EXISTS quest_skill_xp CASCADE;
DROP TABLE IF EXISTS user_skill_xp CASCADE;

-- Step 2: Create new tables for the 5-pillar system with correct column names
CREATE TABLE quest_skill_xp (
    id SERIAL PRIMARY KEY,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    skill VARCHAR(50) NOT NULL,  -- Changed from skill_name to skill
    xp INTEGER NOT NULL DEFAULT 0,  -- Changed from xp_value to xp
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(quest_id, skill)
);

CREATE TABLE user_skill_xp (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    skill VARCHAR(50) NOT NULL,  -- Changed from skill_name to skill
    xp INTEGER NOT NULL DEFAULT 0,  -- Changed from total_xp to xp
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, skill)
);

-- Step 3: Create mapping function for old categories to new pillars
CREATE OR REPLACE FUNCTION map_category_to_pillar(old_category TEXT) 
RETURNS TEXT AS $$
BEGIN
    CASE old_category
        WHEN 'reading_writing' THEN RETURN 'communication';
        WHEN 'thinking_skills' THEN RETURN 'critical_thinking';
        WHEN 'personal_growth' THEN RETURN 'practical_skills';
        WHEN 'life_skills' THEN RETURN 'practical_skills';
        WHEN 'making_creating' THEN RETURN 'creativity';
        WHEN 'world_understanding' THEN RETURN 'cultural_literacy';
        ELSE RETURN 'practical_skills'; -- Default fallback
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Check if quest_xp_awards table exists and migrate data
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quest_xp_awards') THEN
        -- Migrate quest XP awards from old system to new system
        INSERT INTO quest_skill_xp (quest_id, skill, xp)
        SELECT 
            q.id as quest_id,
            map_category_to_pillar(qxa.subject_type) as skill,
            SUM(qxa.xp_amount) as xp
        FROM quests q
        INNER JOIN quest_xp_awards qxa ON q.id = qxa.quest_id
        GROUP BY q.id, map_category_to_pillar(qxa.subject_type)
        ON CONFLICT (quest_id, skill) 
        DO UPDATE SET xp = quest_skill_xp.xp + EXCLUDED.xp;
    END IF;
END $$;

-- Step 5: Migrate user XP from completed quests
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_quests') THEN
        -- Calculate user XP based on completed quests
        INSERT INTO user_skill_xp (user_id, skill, xp)
        SELECT 
            uq.user_id,
            qsx.skill,
            SUM(qsx.xp) as total_xp
        FROM user_quests uq
        INNER JOIN quest_skill_xp qsx ON uq.quest_id = qsx.quest_id
        WHERE uq.status = 'completed'
        GROUP BY uq.user_id, qsx.skill
        ON CONFLICT (user_id, skill)
        DO UPDATE SET xp = user_skill_xp.xp + EXCLUDED.xp;
    END IF;
END $$;

-- Step 6: If quest_xp_awards doesn't exist but quests have skill data, populate from that
DO $$
BEGIN
    -- Check if quests table has skill-related columns
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'quests' 
               AND column_name IN ('creativity_xp', 'critical_thinking_xp', 'practical_skills_xp', 
                                   'communication_xp', 'cultural_literacy_xp')) THEN
        
        -- Populate quest_skill_xp from quest columns
        INSERT INTO quest_skill_xp (quest_id, skill, xp)
        SELECT quest_id, skill, xp FROM (
            SELECT id as quest_id, 'creativity' as skill, creativity_xp as xp 
            FROM quests WHERE creativity_xp > 0
            UNION ALL
            SELECT id, 'critical_thinking', critical_thinking_xp 
            FROM quests WHERE critical_thinking_xp > 0
            UNION ALL
            SELECT id, 'practical_skills', practical_skills_xp 
            FROM quests WHERE practical_skills_xp > 0
            UNION ALL
            SELECT id, 'communication', communication_xp 
            FROM quests WHERE communication_xp > 0
            UNION ALL
            SELECT id, 'cultural_literacy', cultural_literacy_xp 
            FROM quests WHERE cultural_literacy_xp > 0
        ) as skill_data
        ON CONFLICT (quest_id, skill) DO NOTHING;
        
    -- Alternative: Check for single xp_reward column and primary_skill
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'quests' 
                  AND column_name = 'xp_reward') THEN
        
        -- Use xp_reward and primary_skill (or default distribution)
        INSERT INTO quest_skill_xp (quest_id, skill, xp)
        SELECT 
            id as quest_id,
            COALESCE(primary_skill, 'practical_skills') as skill,
            COALESCE(xp_reward, 100) as xp
        FROM quests
        WHERE is_published = true OR is_published IS NULL
        ON CONFLICT (quest_id, skill) DO NOTHING;
    END IF;
END $$;

-- Step 7: Add columns to quests table if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quests' AND column_name = 'primary_skill') THEN
        ALTER TABLE quests ADD COLUMN primary_skill VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quests' AND column_name = 'difficulty_level') THEN
        ALTER TABLE quests ADD COLUMN difficulty_level VARCHAR(20) DEFAULT 'beginner';
    END IF;
END $$;

-- Step 8: Update quests with primary skill based on highest XP award
UPDATE quests q
SET primary_skill = (
    SELECT skill 
    FROM quest_skill_xp qsx
    WHERE qsx.quest_id = q.id
    ORDER BY xp DESC
    LIMIT 1
)
WHERE primary_skill IS NULL;

-- Step 9: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quest_skill_xp_quest_id ON quest_skill_xp(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_skill_xp_skill ON quest_skill_xp(skill);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_user_id ON user_skill_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_skill ON user_skill_xp(skill);

-- Step 10: Create view for user XP summary
CREATE OR REPLACE VIEW user_xp_summary AS
SELECT 
    u.id as user_id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'display_name', u.email) as display_name,
    COALESCE(usx_creativity.xp, 0) as creativity_xp,
    COALESCE(usx_critical.xp, 0) as critical_thinking_xp,
    COALESCE(usx_practical.xp, 0) as practical_skills_xp,
    COALESCE(usx_comm.xp, 0) as communication_xp,
    COALESCE(usx_cultural.xp, 0) as cultural_literacy_xp,
    (COALESCE(usx_creativity.xp, 0) + 
     COALESCE(usx_critical.xp, 0) + 
     COALESCE(usx_practical.xp, 0) + 
     COALESCE(usx_comm.xp, 0) + 
     COALESCE(usx_cultural.xp, 0)) as total_xp
FROM auth.users u
LEFT JOIN user_skill_xp usx_creativity ON u.id = usx_creativity.user_id AND usx_creativity.skill = 'creativity'
LEFT JOIN user_skill_xp usx_critical ON u.id = usx_critical.user_id AND usx_critical.skill = 'critical_thinking'
LEFT JOIN user_skill_xp usx_practical ON u.id = usx_practical.user_id AND usx_practical.skill = 'practical_skills'
LEFT JOIN user_skill_xp usx_comm ON u.id = usx_comm.user_id AND usx_comm.skill = 'communication'
LEFT JOIN user_skill_xp usx_cultural ON u.id = usx_cultural.user_id AND usx_cultural.skill = 'cultural_literacy';

-- Step 11: Clean up function
DROP FUNCTION IF EXISTS map_category_to_pillar(TEXT);

-- Step 12: Grant appropriate permissions
GRANT SELECT ON quest_skill_xp TO authenticated;
GRANT SELECT ON user_skill_xp TO authenticated;
GRANT SELECT ON user_xp_summary TO authenticated;

-- Migration complete!
-- Note: The column names are now 'skill' and 'xp' to match your existing schema