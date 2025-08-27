-- COMPLETE 5-PILLAR SYSTEM SETUP (FIXED)
-- This will reset quest and XP data but PRESERVE user accounts and authentication

-- ========================================
-- STEP 1: PRESERVE AUTH DATA
-- ========================================
-- auth.users table is managed by Supabase - DO NOT DROP
-- We'll only modify our custom tables

-- ========================================
-- STEP 2: DROP AND RECREATE XP TABLES
-- ========================================

-- Drop old XP-related tables if they exist
DROP TABLE IF EXISTS quest_skill_xp CASCADE;
DROP TABLE IF EXISTS user_skill_xp CASCADE;
DROP TABLE IF EXISTS quest_xp_awards CASCADE;
DROP TABLE IF EXISTS user_subjects CASCADE;
DROP TABLE IF EXISTS quest_subjects CASCADE;
DROP TABLE IF EXISTS subject_progress CASCADE;
DROP VIEW IF EXISTS user_xp_summary CASCADE;
DROP VIEW IF EXISTS user_category_xp CASCADE;
DROP VIEW IF EXISTS quest_category_distribution CASCADE;

-- Create new 5-pillar XP tables
CREATE TABLE quest_skill_xp (
    id SERIAL PRIMARY KEY,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    skill VARCHAR(50) NOT NULL CHECK (skill IN ('creativity', 'critical_thinking', 'practical_skills', 'communication', 'cultural_literacy')),
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(quest_id, skill)
);

CREATE TABLE user_skill_xp (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    skill VARCHAR(50) NOT NULL CHECK (skill IN ('creativity', 'critical_thinking', 'practical_skills', 'communication', 'cultural_literacy')),
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, skill)
);

-- ========================================
-- STEP 3: UPDATE QUESTS TABLE
-- ========================================

-- Add new columns if they don't exist
ALTER TABLE quests 
ADD COLUMN IF NOT EXISTS primary_skill VARCHAR(50) CHECK (primary_skill IN ('creativity', 'critical_thinking', 'practical_skills', 'communication', 'cultural_literacy')),
ADD COLUMN IF NOT EXISTS difficulty_level VARCHAR(20) DEFAULT 'beginner' CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
ADD COLUMN IF NOT EXISTS xp_reward INTEGER DEFAULT 100 CHECK (xp_reward > 0),
ADD COLUMN IF NOT EXISTS estimated_time_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS prerequisite_quest_id UUID REFERENCES quests(id),
ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS is_repeatable BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS resources JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS rubric JSONB DEFAULT '{}';

-- Drop old columns if they exist
DO $$
BEGIN
    -- Drop old category columns
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quests' AND column_name = 'subject_type') THEN
        ALTER TABLE quests DROP COLUMN subject_type;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quests' AND column_name = 'category') THEN
        ALTER TABLE quests DROP COLUMN category;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quests' AND column_name = 'old_skill_category') THEN
        ALTER TABLE quests DROP COLUMN old_skill_category;
    END IF;
    
    -- Drop individual XP columns if they exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quests' AND column_name = 'creativity_xp') THEN
        ALTER TABLE quests DROP COLUMN creativity_xp;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quests' AND column_name = 'critical_thinking_xp') THEN
        ALTER TABLE quests DROP COLUMN critical_thinking_xp;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quests' AND column_name = 'practical_skills_xp') THEN
        ALTER TABLE quests DROP COLUMN practical_skills_xp;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quests' AND column_name = 'communication_xp') THEN
        ALTER TABLE quests DROP COLUMN communication_xp;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quests' AND column_name = 'cultural_literacy_xp') THEN
        ALTER TABLE quests DROP COLUMN cultural_literacy_xp;
    END IF;
END $$;

-- ========================================
-- STEP 4: UPDATE/CREATE USERS TABLE
-- ========================================

-- Check if users table exists and what columns it has
DO $$
DECLARE
    table_exists BOOLEAN;
    has_email BOOLEAN;
    has_role BOOLEAN;
BEGIN
    -- Check if users table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'users'
    ) INTO table_exists;
    
    IF NOT table_exists THEN
        -- Create users table if it doesn't exist
        CREATE TABLE users (
            id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            display_name VARCHAR(100),
            role VARCHAR(50) DEFAULT 'student',
            level INTEGER DEFAULT 1,
            streak_days INTEGER DEFAULT 0,
            last_active TIMESTAMPTZ DEFAULT NOW(),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            preferences JSONB DEFAULT '{}',
            badges JSONB DEFAULT '[]',
            bio TEXT,
            avatar_url TEXT,
            portfolio_slug VARCHAR(100) UNIQUE
        );
        RAISE NOTICE 'Created users table';
    ELSE
        -- Add missing columns to existing users table
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS display_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'student',
        ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS streak_days INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS badges JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS bio TEXT,
        ADD COLUMN IF NOT EXISTS avatar_url TEXT,
        ADD COLUMN IF NOT EXISTS portfolio_slug VARCHAR(100);
        
        RAISE NOTICE 'Updated users table structure';
    END IF;
END $$;

-- Ensure all auth.users have a corresponding entry in users table
INSERT INTO users (id, display_name, role)
SELECT 
    au.id, 
    COALESCE(au.raw_user_meta_data->>'display_name', au.email),
    COALESCE(au.raw_user_meta_data->>'role', 'student')
FROM auth.users au
ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(users.display_name, EXCLUDED.display_name),
    role = CASE 
        WHEN users.role IN ('admin', 'educator') THEN users.role  -- Preserve admin/educator roles
        ELSE COALESCE(users.role, EXCLUDED.role)
    END;

-- Ensure admin accounts have admin role
UPDATE users 
SET role = 'admin'
WHERE id IN (
    SELECT id FROM auth.users 
    WHERE raw_user_meta_data->>'role' = 'admin'
    OR email LIKE '%admin%'  -- Fallback pattern match
);

-- ========================================
-- STEP 5: UPDATE USER_QUESTS TABLE
-- ========================================

ALTER TABLE user_quests
ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS time_spent_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS score DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS feedback TEXT,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES auth.users(id);

-- ========================================
-- STEP 6: CREATE ADDITIONAL TABLES
-- ========================================

-- Quest reviews table
CREATE TABLE IF NOT EXISTS quest_reviews (
    id SERIAL PRIMARY KEY,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    user_quest_id UUID NOT NULL REFERENCES user_quests(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES auth.users(id),
    review_type VARCHAR(20) NOT NULL CHECK (review_type IN ('peer', 'instructor', 'auto')),
    score DECIMAL(5,2),
    feedback TEXT,
    rubric_scores JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User achievements table
CREATE TABLE IF NOT EXISTS user_achievements (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    achievement_type VARCHAR(50) NOT NULL,
    achievement_name VARCHAR(100) NOT NULL,
    achievement_data JSONB DEFAULT '{}',
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, achievement_type, achievement_name)
);

-- Leaderboards table
CREATE TABLE IF NOT EXISTS leaderboards (
    id SERIAL PRIMARY KEY,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'all_time')),
    period_start DATE NOT NULL,
    skill_name VARCHAR(50),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    xp_earned INTEGER NOT NULL DEFAULT 0,
    rank INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(period_type, period_start, skill_name, user_id)
);

-- ========================================
-- STEP 7: POPULATE INITIAL DATA
-- ========================================

-- Set primary skills for existing quests based on title analysis
UPDATE quests 
SET primary_skill = 
    CASE 
        WHEN LOWER(title) LIKE '%creativ%' OR LOWER(title) LIKE '%design%' 
            OR LOWER(title) LIKE '%art%' OR LOWER(title) LIKE '%build%' 
            OR LOWER(title) LIKE '%make%' OR LOWER(title) LIKE '%craft%' 
            OR LOWER(title) LIKE '%invent%' OR LOWER(title) LIKE '%imagin%' THEN 'creativity'
        WHEN LOWER(title) LIKE '%think%' OR LOWER(title) LIKE '%analyz%' 
            OR LOWER(title) LIKE '%problem%' OR LOWER(title) LIKE '%logic%' 
            OR LOWER(title) LIKE '%reason%' OR LOWER(title) LIKE '%solv%'
            OR LOWER(title) LIKE '%research%' OR LOWER(title) LIKE '%evaluat%' THEN 'critical_thinking'
        WHEN LOWER(title) LIKE '%communicat%' OR LOWER(title) LIKE '%write%' 
            OR LOWER(title) LIKE '%writ%' OR LOWER(title) LIKE '%speak%' 
            OR LOWER(title) LIKE '%present%' OR LOWER(title) LIKE '%essay%'
            OR LOWER(title) LIKE '%report%' OR LOWER(title) LIKE '%letter%' THEN 'communication'
        WHEN LOWER(title) LIKE '%cultur%' OR LOWER(title) LIKE '%history%' 
            OR LOWER(title) LIKE '%social%' OR LOWER(title) LIKE '%global%' 
            OR LOWER(title) LIKE '%world%' OR LOWER(title) LIKE '%societ%'
            OR LOWER(title) LIKE '%communit%' OR LOWER(title) LIKE '%tradition%' THEN 'cultural_literacy'
        ELSE 'practical_skills'
    END
WHERE primary_skill IS NULL;

-- Ensure all quests have an xp_reward value
UPDATE quests SET xp_reward = 100 WHERE xp_reward IS NULL;

-- Populate quest_skill_xp based on primary skill and xp_reward
INSERT INTO quest_skill_xp (quest_id, skill, xp)
SELECT 
    id,
    COALESCE(primary_skill, 'practical_skills'),
    COALESCE(xp_reward, 100)
FROM quests
ON CONFLICT (quest_id, skill) DO NOTHING;

-- Calculate user XP from completed quests
INSERT INTO user_skill_xp (user_id, skill, xp)
SELECT 
    uq.user_id,
    qsx.skill,
    SUM(qsx.xp) as total_xp
FROM user_quests uq
INNER JOIN quest_skill_xp qsx ON uq.quest_id = qsx.quest_id
WHERE uq.status = 'completed'
GROUP BY uq.user_id, qsx.skill
ON CONFLICT (user_id, skill) DO NOTHING;

-- Update user levels based on total XP
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

-- ========================================
-- STEP 8: CREATE VIEWS
-- ========================================

CREATE OR REPLACE VIEW user_xp_summary AS
SELECT 
    u.id as user_id,
    au.email,
    u.display_name,
    u.role,
    u.level,
    COALESCE(MAX(CASE WHEN usx.skill = 'creativity' THEN usx.xp END), 0) as creativity_xp,
    COALESCE(MAX(CASE WHEN usx.skill = 'critical_thinking' THEN usx.xp END), 0) as critical_thinking_xp,
    COALESCE(MAX(CASE WHEN usx.skill = 'practical_skills' THEN usx.xp END), 0) as practical_skills_xp,
    COALESCE(MAX(CASE WHEN usx.skill = 'communication' THEN usx.xp END), 0) as communication_xp,
    COALESCE(MAX(CASE WHEN usx.skill = 'cultural_literacy' THEN usx.xp END), 0) as cultural_literacy_xp,
    COALESCE(SUM(usx.xp), 0) as total_xp
FROM users u
JOIN auth.users au ON u.id = au.id
LEFT JOIN user_skill_xp usx ON u.id = usx.user_id
GROUP BY u.id, au.email, u.display_name, u.role, u.level;

-- ========================================
-- STEP 9: CREATE INDEXES
-- ========================================

CREATE INDEX IF NOT EXISTS idx_quest_skill_xp_quest_id ON quest_skill_xp(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_skill_xp_skill ON quest_skill_xp(skill);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_user_id ON user_skill_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_skill ON user_skill_xp(skill);
CREATE INDEX IF NOT EXISTS idx_quests_primary_skill ON quests(primary_skill);
CREATE INDEX IF NOT EXISTS idx_user_quests_user_id_status ON user_quests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_quests_quest_id ON user_quests(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_reviews_user_quest_id ON quest_reviews(user_quest_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboards_period ON leaderboards(period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ========================================
-- STEP 10: SET PERMISSIONS
-- ========================================

-- Grant permissions to authenticated users
GRANT SELECT ON quest_skill_xp TO authenticated;
GRANT SELECT ON user_skill_xp TO authenticated;
GRANT SELECT ON user_xp_summary TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_quests TO authenticated;
GRANT SELECT ON quests TO authenticated;
GRANT SELECT, UPDATE ON users TO authenticated;
GRANT SELECT, INSERT ON quest_reviews TO authenticated;
GRANT SELECT, INSERT ON user_achievements TO authenticated;
GRANT SELECT ON leaderboards TO authenticated;

-- Grant additional permissions to service role for admin functions
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ========================================
-- STEP 11: CREATE TRIGGERS
-- ========================================

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
DROP TRIGGER IF EXISTS update_quest_reviews_updated_at ON quest_reviews;
CREATE TRIGGER update_quest_reviews_updated_at 
    BEFORE UPDATE ON quest_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_skill_xp_updated_at ON user_skill_xp;
CREATE TRIGGER update_user_skill_xp_updated_at 
    BEFORE UPDATE ON user_skill_xp
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- STEP 12: VERIFY ADMIN ACCESS
-- ========================================

DO $$
DECLARE
    admin_count INTEGER;
    admin_emails TEXT;
BEGIN
    -- Count and list admin users
    SELECT COUNT(*), STRING_AGG(au.email, ', ') 
    INTO admin_count, admin_emails
    FROM users u
    JOIN auth.users au ON u.id = au.id
    WHERE u.role IN ('admin', 'educator');
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '     5-PILLAR SYSTEM SETUP COMPLETE     ';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Admin/Educator accounts preserved: %', admin_count;
    IF admin_emails IS NOT NULL THEN
        RAISE NOTICE 'Admin emails: %', admin_emails;
    END IF;
    RAISE NOTICE '';
    
    -- Report statistics
    RAISE NOTICE 'Database Statistics:';
    RAISE NOTICE '- Total users: %', (SELECT COUNT(*) FROM users);
    RAISE NOTICE '- Total quests: %', (SELECT COUNT(*) FROM quests);
    RAISE NOTICE '- Quests with XP: %', (SELECT COUNT(DISTINCT quest_id) FROM quest_skill_xp);
    RAISE NOTICE '- Users with XP: %', (SELECT COUNT(DISTINCT user_id) FROM user_skill_xp);
    RAISE NOTICE '';
    RAISE NOTICE 'Your admin account is preserved and can log in.';
    RAISE NOTICE '========================================';
END $$;