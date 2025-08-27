-- Populate skill XP tables for 5-pillar system
-- Since quest_xp_awards doesn't exist, we'll set up initial data

-- Step 1: Ensure tables exist with correct schema
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

-- Step 2: Add missing columns to quests table
DO $$
BEGIN
    -- Add primary_skill if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quests' AND column_name = 'primary_skill') THEN
        ALTER TABLE quests ADD COLUMN primary_skill VARCHAR(50);
    END IF;
    
    -- Add difficulty_level if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quests' AND column_name = 'difficulty_level') THEN
        ALTER TABLE quests ADD COLUMN difficulty_level VARCHAR(20) DEFAULT 'beginner';
    END IF;
    
    -- Add xp_reward if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quests' AND column_name = 'xp_reward') THEN
        ALTER TABLE quests ADD COLUMN xp_reward INTEGER DEFAULT 100;
    END IF;
END $$;

-- Step 3: Check what XP-related columns exist in quests table
DO $$
DECLARE
    has_pillar_xp_columns BOOLEAN;
    has_xp_reward BOOLEAN;
    has_category_column BOOLEAN;
BEGIN
    -- Check for 5-pillar XP columns
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quests' 
        AND column_name IN ('creativity_xp', 'critical_thinking_xp', 'practical_skills_xp', 
                           'communication_xp', 'cultural_literacy_xp')
    ) INTO has_pillar_xp_columns;
    
    -- Check for xp_reward column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quests' 
        AND column_name = 'xp_reward'
    ) INTO has_xp_reward;
    
    -- Check for category/subject columns
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quests' 
        AND column_name IN ('category', 'subject', 'skill_category')
    ) INTO has_category_column;
    
    -- Clear existing quest_skill_xp data to avoid duplicates
    TRUNCATE quest_skill_xp CASCADE;
    
    IF has_pillar_xp_columns THEN
        -- Populate from individual XP columns
        RAISE NOTICE 'Populating quest_skill_xp from individual XP columns';
        
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
        
    ELSIF has_xp_reward THEN
        -- Use xp_reward and assign to primary skill or distribute
        RAISE NOTICE 'Populating quest_skill_xp from xp_reward column';
        
        -- First, set default primary_skill for quests that don't have one
        UPDATE quests 
        SET primary_skill = 
            CASE 
                WHEN title ILIKE '%creativ%' OR title ILIKE '%design%' OR title ILIKE '%art%' 
                    OR title ILIKE '%build%' OR title ILIKE '%make%' THEN 'creativity'
                WHEN title ILIKE '%think%' OR title ILIKE '%analyz%' OR title ILIKE '%problem%' 
                    OR title ILIKE '%logic%' OR title ILIKE '%reason%' THEN 'critical_thinking'
                WHEN title ILIKE '%communicat%' OR title ILIKE '%write%' OR title ILIKE '%speak%' 
                    OR title ILIKE '%present%' OR title ILIKE '%essay%' THEN 'communication'
                WHEN title ILIKE '%cultur%' OR title ILIKE '%history%' OR title ILIKE '%social%' 
                    OR title ILIKE '%global%' OR title ILIKE '%world%' THEN 'cultural_literacy'
                ELSE 'practical_skills'
            END
        WHERE primary_skill IS NULL;
        
        -- Insert XP based on primary skill
        INSERT INTO quest_skill_xp (quest_id, skill, xp)
        SELECT 
            id,
            COALESCE(primary_skill, 'practical_skills'),
            COALESCE(xp_reward, 100)
        FROM quests
        WHERE is_published = true OR is_published IS NULL;
        
    ELSE
        -- No XP data found, create default entries
        RAISE NOTICE 'No XP columns found, creating default XP values';
        
        -- Set default primary skills based on quest titles
        UPDATE quests 
        SET primary_skill = 'practical_skills'
        WHERE primary_skill IS NULL;
        
        -- Create default 100 XP for each quest
        INSERT INTO quest_skill_xp (quest_id, skill, xp)
        SELECT 
            id,
            COALESCE(primary_skill, 'practical_skills'),
            100
        FROM quests
        WHERE is_published = true OR is_published IS NULL;
    END IF;
END $$;

-- Step 4: Update primary_skill for quests based on highest XP
UPDATE quests q
SET primary_skill = (
    SELECT skill 
    FROM quest_skill_xp qsx
    WHERE qsx.quest_id = q.id
    ORDER BY xp DESC
    LIMIT 1
)
WHERE EXISTS (SELECT 1 FROM quest_skill_xp WHERE quest_id = q.id);

-- Step 5: Calculate user XP from completed quests
DO $$
BEGIN
    -- Clear and recalculate user XP
    TRUNCATE user_skill_xp CASCADE;
    
    INSERT INTO user_skill_xp (user_id, skill, xp)
    SELECT 
        uq.user_id,
        qsx.skill,
        SUM(qsx.xp) as total_xp
    FROM user_quests uq
    INNER JOIN quest_skill_xp qsx ON uq.quest_id = qsx.quest_id
    WHERE uq.status = 'completed'
    GROUP BY uq.user_id, qsx.skill;
    
    RAISE NOTICE 'User XP calculated from completed quests';
END $$;

-- Step 6: Update users table level based on total XP
DO $$
BEGIN
    -- Only update if level column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'users' AND column_name = 'level') THEN
        
        UPDATE users u
        SET level = 
            CASE 
                WHEN total_xp.xp >= 5000 THEN 10
                WHEN total_xp.xp >= 3000 THEN 8
                WHEN total_xp.xp >= 2000 THEN 7
                WHEN total_xp.xp >= 1500 THEN 6
                WHEN total_xp.xp >= 1000 THEN 5
                WHEN total_xp.xp >= 500 THEN 4
                WHEN total_xp.xp >= 250 THEN 3
                WHEN total_xp.xp >= 100 THEN 2
                ELSE 1
            END
        FROM (
            SELECT user_id, SUM(xp) as xp
            FROM user_skill_xp
            GROUP BY user_id
        ) total_xp
        WHERE u.id = total_xp.user_id;
        
        RAISE NOTICE 'User levels updated based on total XP';
    END IF;
END $$;

-- Step 7: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quest_skill_xp_quest_id ON quest_skill_xp(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_skill_xp_skill ON quest_skill_xp(skill);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_user_id ON user_skill_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_skill ON user_skill_xp(skill);
CREATE INDEX IF NOT EXISTS idx_quests_primary_skill ON quests(primary_skill);

-- Step 8: Create or replace view for user XP summary
CREATE OR REPLACE VIEW user_xp_summary AS
SELECT 
    u.id as user_id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'display_name', u.email) as display_name,
    COALESCE(usr.level, 1) as level,
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
LEFT JOIN users usr ON u.id = usr.id
LEFT JOIN user_skill_xp usx_creativity ON u.id = usx_creativity.user_id AND usx_creativity.skill = 'creativity'
LEFT JOIN user_skill_xp usx_critical ON u.id = usx_critical.user_id AND usx_critical.skill = 'critical_thinking'
LEFT JOIN user_skill_xp usx_practical ON u.id = usx_practical.user_id AND usx_practical.skill = 'practical_skills'
LEFT JOIN user_skill_xp usx_comm ON u.id = usx_comm.user_id AND usx_comm.skill = 'communication'
LEFT JOIN user_skill_xp usx_cultural ON u.id = usx_cultural.user_id AND usx_cultural.skill = 'cultural_literacy';

-- Step 9: Grant appropriate permissions
GRANT SELECT ON quest_skill_xp TO authenticated;
GRANT SELECT ON user_skill_xp TO authenticated;
GRANT SELECT ON user_xp_summary TO authenticated;
GRANT INSERT, UPDATE ON quest_skill_xp TO authenticated;
GRANT INSERT, UPDATE ON user_skill_xp TO authenticated;

-- Step 10: Report migration results
DO $$
DECLARE
    quest_count INTEGER;
    user_count INTEGER;
    total_skills INTEGER;
BEGIN
    SELECT COUNT(DISTINCT quest_id) INTO quest_count FROM quest_skill_xp;
    SELECT COUNT(DISTINCT user_id) INTO user_count FROM user_skill_xp;
    SELECT COUNT(*) INTO total_skills FROM quest_skill_xp;
    
    RAISE NOTICE '=== Migration Complete ===';
    RAISE NOTICE 'Quests with skill XP: %', quest_count;
    RAISE NOTICE 'Users with skill XP: %', user_count;
    RAISE NOTICE 'Total skill-XP assignments: %', total_skills;
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Review quest primary_skill assignments';
    RAISE NOTICE '2. Adjust XP values as needed';
    RAISE NOTICE '3. Run 002_cleanup_old_tables.sql if old tables need removal';
END $$;