-- Final adaptive migration that checks all table structures

-- Step 1: Analyze quests table structure
DO $$
DECLARE
    col_record RECORD;
    col_list TEXT := '';
    has_is_published BOOLEAN;
    has_status BOOLEAN;
    has_active BOOLEAN;
BEGIN
    RAISE NOTICE '=== Analyzing quests table structure ===';
    
    FOR col_record IN 
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'quests'
        ORDER BY ordinal_position
    LOOP
        col_list := col_list || col_record.column_name || ' (' || col_record.data_type || '), ';
    END LOOP;
    
    RAISE NOTICE 'Quests columns: %', col_list;
    
    -- Check for various possible status columns
    SELECT EXISTS(SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'quests' AND column_name = 'is_published') 
    INTO has_is_published;
    
    SELECT EXISTS(SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'quests' AND column_name = 'status') 
    INTO has_status;
    
    SELECT EXISTS(SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'quests' AND column_name = 'active') 
    INTO has_active;
    
    RAISE NOTICE 'has_is_published: %, has_status: %, has_active: %', 
                 has_is_published, has_status, has_active;
END $$;

-- Step 2: Ensure quest_skill_xp table exists with proper structure
DO $$
BEGIN
    -- Check if table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quest_skill_xp') THEN
        CREATE TABLE quest_skill_xp (
            id SERIAL PRIMARY KEY,
            quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
            skill VARCHAR(50) NOT NULL,
            xp INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(quest_id, skill)
        );
        RAISE NOTICE 'Created quest_skill_xp table';
    ELSE
        -- Check if it's empty
        IF NOT EXISTS (SELECT 1 FROM quest_skill_xp LIMIT 1) THEN
            RAISE NOTICE 'quest_skill_xp table exists but is empty';
        ELSE
            RAISE NOTICE 'quest_skill_xp table already has data - skipping population';
            RETURN; -- Exit if data exists
        END IF;
    END IF;
END $$;

-- Step 3: Ensure user_skill_xp table exists
CREATE TABLE IF NOT EXISTS user_skill_xp (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    skill VARCHAR(50) NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, skill)
);

-- Step 4: Add columns to quests if needed
DO $$
BEGIN
    -- Add primary_skill if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quests' AND column_name = 'primary_skill') THEN
        ALTER TABLE quests ADD COLUMN primary_skill VARCHAR(50);
        RAISE NOTICE 'Added primary_skill column to quests';
    END IF;
    
    -- Add xp_reward if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quests' AND column_name = 'xp_reward') THEN
        ALTER TABLE quests ADD COLUMN xp_reward INTEGER DEFAULT 100;
        RAISE NOTICE 'Added xp_reward column to quests';
    END IF;
    
    -- Add difficulty_level if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quests' AND column_name = 'difficulty_level') THEN
        ALTER TABLE quests ADD COLUMN difficulty_level VARCHAR(20) DEFAULT 'beginner';
        RAISE NOTICE 'Added difficulty_level column to quests';
    END IF;
END $$;

-- Step 5: Set default primary skills based on quest titles/descriptions
UPDATE quests 
SET primary_skill = 
    CASE 
        WHEN LOWER(title) LIKE '%creativ%' OR LOWER(title) LIKE '%design%' 
            OR LOWER(title) LIKE '%art%' OR LOWER(title) LIKE '%build%' 
            OR LOWER(title) LIKE '%make%' OR LOWER(title) LIKE '%craft%' THEN 'creativity'
        WHEN LOWER(title) LIKE '%think%' OR LOWER(title) LIKE '%analyz%' 
            OR LOWER(title) LIKE '%problem%' OR LOWER(title) LIKE '%logic%' 
            OR LOWER(title) LIKE '%reason%' OR LOWER(title) LIKE '%solv%' THEN 'critical_thinking'
        WHEN LOWER(title) LIKE '%communicat%' OR LOWER(title) LIKE '%write%' 
            OR LOWER(title) LIKE '%writ%' OR LOWER(title) LIKE '%speak%' 
            OR LOWER(title) LIKE '%present%' OR LOWER(title) LIKE '%essay%' THEN 'communication'
        WHEN LOWER(title) LIKE '%cultur%' OR LOWER(title) LIKE '%history%' 
            OR LOWER(title) LIKE '%social%' OR LOWER(title) LIKE '%global%' 
            OR LOWER(title) LIKE '%world%' OR LOWER(title) LIKE '%societ%' THEN 'cultural_literacy'
        ELSE 'practical_skills'
    END
WHERE primary_skill IS NULL;

-- Step 6: Populate quest_skill_xp based on available columns
DO $$
DECLARE
    has_is_published BOOLEAN;
    has_status BOOLEAN;
    has_active BOOLEAN;
    where_clause TEXT;
    query TEXT;
BEGIN
    -- Check what filter columns exist
    SELECT EXISTS(SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'quests' AND column_name = 'is_published') 
    INTO has_is_published;
    
    SELECT EXISTS(SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'quests' AND column_name = 'status') 
    INTO has_status;
    
    SELECT EXISTS(SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'quests' AND column_name = 'active') 
    INTO has_active;
    
    -- Build appropriate WHERE clause
    IF has_is_published THEN
        where_clause := 'WHERE is_published = true OR is_published IS NULL';
    ELSIF has_status THEN
        where_clause := 'WHERE status = ''published'' OR status = ''active'' OR status IS NULL';
    ELSIF has_active THEN
        where_clause := 'WHERE active = true OR active IS NULL';
    ELSE
        where_clause := ''; -- No filter, include all quests
    END IF;
    
    RAISE NOTICE 'Using WHERE clause: %', CASE WHEN where_clause = '' THEN '(none - including all quests)' ELSE where_clause END;
    
    -- Build and execute the INSERT query
    query := format('
        INSERT INTO quest_skill_xp (quest_id, skill, xp)
        SELECT 
            id,
            COALESCE(primary_skill, ''practical_skills''),
            COALESCE(xp_reward, 100)
        FROM quests
        %s
        ON CONFLICT (quest_id, skill) DO NOTHING',
        where_clause
    );
    
    EXECUTE query;
    
    RAISE NOTICE 'Populated quest_skill_xp table';
END $$;

-- Step 7: Calculate user XP from completed quests
TRUNCATE user_skill_xp;

INSERT INTO user_skill_xp (user_id, skill, xp)
SELECT 
    uq.user_id,
    qsx.skill,
    SUM(qsx.xp) as total_xp
FROM user_quests uq
INNER JOIN quest_skill_xp qsx ON uq.quest_id = qsx.quest_id
WHERE uq.status = 'completed'
GROUP BY uq.user_id, qsx.skill
ON CONFLICT (user_id, skill) DO UPDATE 
SET xp = user_skill_xp.xp + EXCLUDED.xp;

-- Step 8: Update user levels if column exists
DO $$
BEGIN
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
        
        RAISE NOTICE 'Updated user levels based on XP';
    END IF;
END $$;

-- Step 9: Create indexes
CREATE INDEX IF NOT EXISTS idx_quest_skill_xp_quest_id ON quest_skill_xp(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_skill_xp_skill ON quest_skill_xp(skill);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_user_id ON user_skill_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_skill ON user_skill_xp(skill);
CREATE INDEX IF NOT EXISTS idx_quests_primary_skill ON quests(primary_skill);

-- Step 10: Create user XP summary view
CREATE OR REPLACE VIEW user_xp_summary AS
SELECT 
    u.id as user_id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'display_name', u.email) as display_name,
    COALESCE((SELECT level FROM users WHERE id = u.id), 1) as level,
    COALESCE(MAX(CASE WHEN usx.skill = 'creativity' THEN usx.xp END), 0) as creativity_xp,
    COALESCE(MAX(CASE WHEN usx.skill = 'critical_thinking' THEN usx.xp END), 0) as critical_thinking_xp,
    COALESCE(MAX(CASE WHEN usx.skill = 'practical_skills' THEN usx.xp END), 0) as practical_skills_xp,
    COALESCE(MAX(CASE WHEN usx.skill = 'communication' THEN usx.xp END), 0) as communication_xp,
    COALESCE(MAX(CASE WHEN usx.skill = 'cultural_literacy' THEN usx.xp END), 0) as cultural_literacy_xp,
    COALESCE(SUM(usx.xp), 0) as total_xp
FROM auth.users u
LEFT JOIN user_skill_xp usx ON u.id = usx.user_id
GROUP BY u.id, u.email, u.raw_user_meta_data;

-- Step 11: Grant permissions
GRANT SELECT, INSERT, UPDATE ON quest_skill_xp TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_skill_xp TO authenticated;
GRANT SELECT ON user_xp_summary TO authenticated;

-- Step 12: Final report
DO $$
DECLARE
    total_quests INTEGER;
    quest_with_xp INTEGER;
    total_users INTEGER;
    users_with_xp INTEGER;
    quest_skills INTEGER;
    user_skills INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_quests FROM quests;
    SELECT COUNT(DISTINCT quest_id) INTO quest_with_xp FROM quest_skill_xp;
    SELECT COUNT(*) INTO total_users FROM auth.users;
    SELECT COUNT(DISTINCT user_id) INTO users_with_xp FROM user_skill_xp;
    SELECT COUNT(*) INTO quest_skills FROM quest_skill_xp;
    SELECT COUNT(*) INTO user_skills FROM user_skill_xp;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '     MIGRATION COMPLETED SUCCESSFULLY   ';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total quests: %', total_quests;
    RAISE NOTICE 'Quests with XP assigned: %', quest_with_xp;
    RAISE NOTICE 'Quest-skill assignments: %', quest_skills;
    RAISE NOTICE '';
    RAISE NOTICE 'Total users: %', total_users;
    RAISE NOTICE 'Users with XP: %', users_with_xp;
    RAISE NOTICE 'User-skill XP records: %', user_skills;
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Review quest primary_skill assignments';
    RAISE NOTICE '2. Adjust XP values if needed';
    RAISE NOTICE '3. Test the application with new XP system';
END $$;