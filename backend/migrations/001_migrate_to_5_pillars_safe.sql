-- Safe migration to 5-pillar system
-- This version checks what exists before migrating

-- Step 1: Create new tables if they don't exist
CREATE TABLE IF NOT EXISTS quest_skill_xp (
    id SERIAL PRIMARY KEY,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    skill VARCHAR(50) NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(quest_id, skill)
);

CREATE TABLE IF NOT EXISTS user_skill_xp (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    skill VARCHAR(50) NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, skill)
);

-- Step 2: Add columns to quests table if they don't exist
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

-- Step 3: Check what columns exist in quest_xp_awards and migrate accordingly
DO $$
DECLARE
    col_exists boolean;
BEGIN
    -- Check if quest_xp_awards table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quest_xp_awards') THEN
        
        -- Check for different possible column names
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'quest_xp_awards' 
            AND column_name IN ('skill', 'skill_name', 'category', 'subject_type', 'pillar')
        ) INTO col_exists;
        
        IF col_exists THEN
            -- Get column information and build dynamic query
            -- For now, we'll skip this migration and do manual mapping
            RAISE NOTICE 'quest_xp_awards table exists but needs manual review of columns';
        END IF;
    END IF;
END $$;

-- Step 4: Populate quest_skill_xp from quests table if it has XP columns
DO $$
BEGIN
    -- Check if quests already has the 5 pillar XP columns
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'quests' 
               AND column_name = 'creativity_xp') THEN
        
        -- Clear existing data to avoid duplicates
        TRUNCATE quest_skill_xp;
        
        -- Insert creativity XP
        INSERT INTO quest_skill_xp (quest_id, skill, xp)
        SELECT id, 'creativity', creativity_xp
        FROM quests
        WHERE creativity_xp IS NOT NULL AND creativity_xp > 0;
        
        -- Insert critical_thinking XP
        INSERT INTO quest_skill_xp (quest_id, skill, xp)
        SELECT id, 'critical_thinking', critical_thinking_xp
        FROM quests
        WHERE critical_thinking_xp IS NOT NULL AND critical_thinking_xp > 0;
        
        -- Insert practical_skills XP
        INSERT INTO quest_skill_xp (quest_id, skill, xp)
        SELECT id, 'practical_skills', practical_skills_xp
        FROM quests
        WHERE practical_skills_xp IS NOT NULL AND practical_skills_xp > 0;
        
        -- Insert communication XP
        INSERT INTO quest_skill_xp (quest_id, skill, xp)
        SELECT id, 'communication', communication_xp
        FROM quests
        WHERE communication_xp IS NOT NULL AND communication_xp > 0;
        
        -- Insert cultural_literacy XP
        INSERT INTO quest_skill_xp (quest_id, skill, xp)
        SELECT id, 'cultural_literacy', cultural_literacy_xp
        FROM quests
        WHERE cultural_literacy_xp IS NOT NULL AND cultural_literacy_xp > 0;
        
        RAISE NOTICE 'Migrated XP data from quest columns';
        
    -- Alternative: If quests just has a single xp_reward column
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'quests' 
                  AND column_name = 'xp_reward') THEN
        
        -- Assign all XP to primary skill or distribute evenly
        INSERT INTO quest_skill_xp (quest_id, skill, xp)
        SELECT 
            id,
            CASE 
                WHEN primary_skill IS NOT NULL THEN primary_skill
                ELSE 'practical_skills'  -- Default skill
            END as skill,
            COALESCE(xp_reward, 100) as xp
        FROM quests
        WHERE (is_published = true OR is_published IS NULL)
        ON CONFLICT (quest_id, skill) DO NOTHING;
        
        RAISE NOTICE 'Created default XP distribution based on xp_reward column';
    END IF;
END $$;

-- Step 5: Calculate user XP from completed quests
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM quest_skill_xp LIMIT 1) THEN
        -- Clear and recalculate user XP
        TRUNCATE user_skill_xp;
        
        INSERT INTO user_skill_xp (user_id, skill, xp)
        SELECT 
            uq.user_id,
            qsx.skill,
            SUM(qsx.xp) as total_xp
        FROM user_quests uq
        INNER JOIN quest_skill_xp qsx ON uq.quest_id = qsx.quest_id
        WHERE uq.status = 'completed'
        GROUP BY uq.user_id, qsx.skill;
        
        RAISE NOTICE 'Calculated user XP from completed quests';
    END IF;
END $$;

-- Step 6: Update primary_skill for quests based on highest XP
UPDATE quests q
SET primary_skill = (
    SELECT skill 
    FROM quest_skill_xp qsx
    WHERE qsx.quest_id = q.id
    ORDER BY xp DESC
    LIMIT 1
)
WHERE primary_skill IS NULL
AND EXISTS (SELECT 1 FROM quest_skill_xp WHERE quest_id = q.id);

-- Step 7: Create indexes
CREATE INDEX IF NOT EXISTS idx_quest_skill_xp_quest_id ON quest_skill_xp(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_skill_xp_skill ON quest_skill_xp(skill);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_user_id ON user_skill_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_skill ON user_skill_xp(skill);

-- Step 8: Create or replace view for user XP summary
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

-- Step 9: Grant permissions
GRANT SELECT ON quest_skill_xp TO authenticated;
GRANT SELECT ON user_skill_xp TO authenticated;
GRANT SELECT ON user_xp_summary TO authenticated;
GRANT INSERT, UPDATE ON quest_skill_xp TO authenticated;
GRANT INSERT, UPDATE ON user_skill_xp TO authenticated;

-- Report what was done
DO $$
DECLARE
    quest_count INTEGER;
    user_count INTEGER;
BEGIN
    SELECT COUNT(DISTINCT quest_id) INTO quest_count FROM quest_skill_xp;
    SELECT COUNT(DISTINCT user_id) INTO user_count FROM user_skill_xp;
    
    RAISE NOTICE 'Migration complete!';
    RAISE NOTICE 'Quests with XP data: %', quest_count;
    RAISE NOTICE 'Users with XP data: %', user_count;
END $$;