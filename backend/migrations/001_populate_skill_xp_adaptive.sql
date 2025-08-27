-- Adaptive migration that works with existing table structure

-- Step 1: Check and display the actual structure of quest_skill_xp
DO $$
DECLARE
    col_record RECORD;
    col_list TEXT := '';
BEGIN
    RAISE NOTICE 'Checking quest_skill_xp table structure...';
    
    FOR col_record IN 
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'quest_skill_xp'
        ORDER BY ordinal_position
    LOOP
        col_list := col_list || col_record.column_name || ' (' || col_record.data_type || '), ';
    END LOOP;
    
    RAISE NOTICE 'quest_skill_xp columns: %', col_list;
END $$;

-- Step 2: Check what columns actually exist in quest_skill_xp
DO $$
DECLARE
    skill_column_name TEXT;
    xp_column_name TEXT;
    has_data BOOLEAN;
BEGIN
    -- Find the skill column (could be 'skill', 'skill_name', 'skill_type', etc.)
    SELECT column_name INTO skill_column_name
    FROM information_schema.columns
    WHERE table_name = 'quest_skill_xp'
    AND column_name IN ('skill', 'skill_name', 'skill_type', 'category', 'pillar')
    LIMIT 1;
    
    -- Find the XP column (could be 'xp', 'xp_value', 'xp_amount', etc.)
    SELECT column_name INTO xp_column_name
    FROM information_schema.columns
    WHERE table_name = 'quest_skill_xp'
    AND column_name IN ('xp', 'xp_value', 'xp_amount', 'points', 'value')
    LIMIT 1;
    
    -- Check if table has data
    SELECT EXISTS(SELECT 1 FROM quest_skill_xp LIMIT 1) INTO has_data;
    
    IF skill_column_name IS NULL OR xp_column_name IS NULL THEN
        RAISE NOTICE 'Could not identify skill or xp columns. Recreating table with correct structure...';
        
        -- Drop and recreate the table with correct structure
        DROP TABLE IF EXISTS quest_skill_xp CASCADE;
        
        CREATE TABLE quest_skill_xp (
            id SERIAL PRIMARY KEY,
            quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
            skill VARCHAR(50) NOT NULL,
            xp INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(quest_id, skill)
        );
        
        -- Set the column names for later use
        skill_column_name := 'skill';
        xp_column_name := 'xp';
        
    ELSE
        RAISE NOTICE 'Found columns: skill=%, xp=%', skill_column_name, xp_column_name;
        
        IF has_data THEN
            RAISE NOTICE 'Table already contains data. Skipping population.';
            RETURN; -- Exit if data already exists
        END IF;
    END IF;
    
    -- Now populate the table using dynamic SQL with the correct column names
    RAISE NOTICE 'Populating quest_skill_xp table...';
    
    -- Add missing columns to quests if needed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quests' AND column_name = 'primary_skill') THEN
        ALTER TABLE quests ADD COLUMN primary_skill VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quests' AND column_name = 'xp_reward') THEN
        ALTER TABLE quests ADD COLUMN xp_reward INTEGER DEFAULT 100;
    END IF;
    
    -- Set default primary skills based on quest titles
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
    
    -- Use dynamic SQL to insert with the correct column names
    EXECUTE format('
        INSERT INTO quest_skill_xp (quest_id, %I, %I)
        SELECT 
            id,
            COALESCE(primary_skill, ''practical_skills''),
            COALESCE(xp_reward, 100)
        FROM quests
        WHERE is_published = true OR is_published IS NULL
        ON CONFLICT (quest_id, %I) DO NOTHING',
        skill_column_name, xp_column_name, skill_column_name
    );
    
    RAISE NOTICE 'Quest skill XP data populated successfully';
END $$;

-- Step 3: Handle user_skill_xp table similarly
DO $$
DECLARE
    skill_column_name TEXT;
    xp_column_name TEXT;
    has_data BOOLEAN;
BEGIN
    -- Check if user_skill_xp exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_skill_xp') THEN
        CREATE TABLE user_skill_xp (
            id SERIAL PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            skill VARCHAR(50) NOT NULL,
            xp INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(user_id, skill)
        );
        skill_column_name := 'skill';
        xp_column_name := 'xp';
    ELSE
        -- Find column names
        SELECT column_name INTO skill_column_name
        FROM information_schema.columns
        WHERE table_name = 'user_skill_xp'
        AND column_name IN ('skill', 'skill_name', 'skill_type', 'category', 'pillar')
        LIMIT 1;
        
        SELECT column_name INTO xp_column_name
        FROM information_schema.columns
        WHERE table_name = 'user_skill_xp'
        AND column_name IN ('xp', 'xp_value', 'xp_amount', 'total_xp', 'points')
        LIMIT 1;
        
        -- Check if table has data
        SELECT EXISTS(SELECT 1 FROM user_skill_xp LIMIT 1) INTO has_data;
        
        IF has_data THEN
            RAISE NOTICE 'user_skill_xp already contains data. Skipping.';
            RETURN;
        END IF;
    END IF;
    
    -- Calculate user XP from completed quests
    EXECUTE format('
        INSERT INTO user_skill_xp (user_id, %I, %I)
        SELECT 
            uq.user_id,
            qsx.%I,
            SUM(qsx.%I) as total_xp
        FROM user_quests uq
        INNER JOIN quest_skill_xp qsx ON uq.quest_id = qsx.quest_id
        WHERE uq.status = ''completed''
        GROUP BY uq.user_id, qsx.%I
        ON CONFLICT (user_id, %I) DO UPDATE 
        SET %I = user_skill_xp.%I + EXCLUDED.%I',
        skill_column_name, xp_column_name,
        skill_column_name, xp_column_name,
        skill_column_name, skill_column_name,
        xp_column_name, xp_column_name, xp_column_name
    );
    
    RAISE NOTICE 'User skill XP calculated from completed quests';
END $$;

-- Step 4: Update user levels if the column exists
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
        
        RAISE NOTICE 'User levels updated based on total XP';
    END IF;
END $$;

-- Step 5: Create indexes
CREATE INDEX IF NOT EXISTS idx_quest_skill_xp_quest_id ON quest_skill_xp(quest_id);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_user_id ON user_skill_xp(user_id);

-- Step 6: Grant permissions
GRANT SELECT, INSERT, UPDATE ON quest_skill_xp TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_skill_xp TO authenticated;

-- Step 7: Report results
DO $$
DECLARE
    quest_count INTEGER;
    user_count INTEGER;
    quest_skill_count INTEGER;
    user_skill_count INTEGER;
BEGIN
    SELECT COUNT(DISTINCT quest_id) INTO quest_count FROM quest_skill_xp;
    SELECT COUNT(DISTINCT user_id) INTO user_count FROM user_skill_xp;
    SELECT COUNT(*) INTO quest_skill_count FROM quest_skill_xp;
    SELECT COUNT(*) INTO user_skill_count FROM user_skill_xp;
    
    RAISE NOTICE '=================================';
    RAISE NOTICE 'Migration Results:';
    RAISE NOTICE 'Quests with skill XP: %', quest_count;
    RAISE NOTICE 'Total quest-skill entries: %', quest_skill_count;
    RAISE NOTICE 'Users with skill XP: %', user_count;
    RAISE NOTICE 'Total user-skill entries: %', user_skill_count;
    RAISE NOTICE '=================================';
END $$;