-- COMPLETE 5-PILLAR SYSTEM SETUP - CLEAN VERSION
-- This will DROP and RECREATE the users table, then recreate accounts from auth.users

-- ========================================
-- STEP 1: DROP OLD TABLES
-- ========================================

-- Drop tables that depend on users table
DROP TABLE IF EXISTS user_skill_xp CASCADE;
DROP TABLE IF EXISTS user_quests CASCADE;
DROP TABLE IF EXISTS user_achievements CASCADE;
DROP TABLE IF EXISTS leaderboards CASCADE;
DROP TABLE IF EXISTS quest_reviews CASCADE;

-- Drop the users table completely
DROP TABLE IF EXISTS users CASCADE;

-- Drop other old XP-related tables
DROP TABLE IF EXISTS quest_skill_xp CASCADE;
DROP TABLE IF EXISTS quest_xp_awards CASCADE;
DROP TABLE IF EXISTS user_subjects CASCADE;
DROP TABLE IF EXISTS quest_subjects CASCADE;
DROP TABLE IF EXISTS subject_progress CASCADE;
DROP VIEW IF EXISTS user_xp_summary CASCADE;
DROP VIEW IF EXISTS user_category_xp CASCADE;
DROP VIEW IF EXISTS quest_category_distribution CASCADE;

-- ========================================
-- STEP 2: CREATE USERS TABLE (FRESH)
-- ========================================

CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    display_name VARCHAR(100),
    email VARCHAR(255),
    role VARCHAR(50) DEFAULT 'student' CHECK (role IN ('student', 'educator', 'admin')),
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

-- Populate users table from auth.users
INSERT INTO users (id, email, first_name, last_name, display_name, role)
SELECT 
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'first_name', split_part(au.email, '@', 1)),
    COALESCE(au.raw_user_meta_data->>'last_name', ''),
    COALESCE(
        au.raw_user_meta_data->>'display_name',
        CONCAT(
            COALESCE(au.raw_user_meta_data->>'first_name', split_part(au.email, '@', 1)),
            ' ',
            COALESCE(au.raw_user_meta_data->>'last_name', '')
        )
    ),
    CASE 
        WHEN au.raw_user_meta_data->>'role' = 'admin' THEN 'admin'
        WHEN au.raw_user_meta_data->>'role' = 'educator' THEN 'educator'
        WHEN au.email LIKE '%admin%' THEN 'admin'
        ELSE 'student'
    END
FROM auth.users au;

-- Ensure admin accounts are properly set
UPDATE users 
SET role = 'admin'
WHERE email LIKE '%admin%' 
   OR id IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin');

-- ========================================
-- STEP 3: CREATE USER_QUESTS TABLE
-- ========================================

CREATE TABLE user_quests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    evidence TEXT,
    evidence_url TEXT,
    reflection TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    attempt_count INTEGER DEFAULT 1,
    time_spent_minutes INTEGER DEFAULT 0,
    score DECIMAL(5,2),
    feedback TEXT,
    submitted_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    reviewer_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, quest_id)
);

-- ========================================
-- STEP 4: CREATE XP TABLES
-- ========================================

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
-- STEP 5: UPDATE QUESTS TABLE
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
    -- List of old columns to drop
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quests' AND column_name = 'subject_type') THEN
        ALTER TABLE quests DROP COLUMN subject_type;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quests' AND column_name = 'category') THEN
        ALTER TABLE quests DROP COLUMN category;
    END IF;
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
-- STEP 6: CREATE ADDITIONAL TABLES
-- ========================================

CREATE TABLE quest_reviews (
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

CREATE TABLE user_achievements (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    achievement_type VARCHAR(50) NOT NULL,
    achievement_name VARCHAR(100) NOT NULL,
    achievement_data JSONB DEFAULT '{}',
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, achievement_type, achievement_name)
);

CREATE TABLE leaderboards (
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
-- STEP 7: POPULATE QUEST DATA
-- ========================================

-- Set primary skills for existing quests based on title
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
            OR LOWER(title) LIKE '%speak%' OR LOWER(title) LIKE '%present%' 
            OR LOWER(title) LIKE '%essay%' OR LOWER(title) LIKE '%report%' THEN 'communication'
        WHEN LOWER(title) LIKE '%cultur%' OR LOWER(title) LIKE '%history%' 
            OR LOWER(title) LIKE '%social%' OR LOWER(title) LIKE '%global%' 
            OR LOWER(title) LIKE '%world%' THEN 'cultural_literacy'
        ELSE 'practical_skills'
    END
WHERE primary_skill IS NULL;

-- Ensure all quests have xp_reward
UPDATE quests SET xp_reward = 100 WHERE xp_reward IS NULL;

-- Populate quest_skill_xp
INSERT INTO quest_skill_xp (quest_id, skill, xp)
SELECT 
    id,
    COALESCE(primary_skill, 'practical_skills'),
    COALESCE(xp_reward, 100)
FROM quests
ON CONFLICT (quest_id, skill) DO NOTHING;

-- ========================================
-- STEP 8: CREATE VIEWS
-- ========================================

CREATE OR REPLACE VIEW user_xp_summary AS
SELECT 
    u.id as user_id,
    u.email,
    u.display_name,
    u.first_name,
    u.last_name,
    u.role,
    u.level,
    COALESCE(MAX(CASE WHEN usx.skill = 'creativity' THEN usx.xp END), 0) as creativity_xp,
    COALESCE(MAX(CASE WHEN usx.skill = 'critical_thinking' THEN usx.xp END), 0) as critical_thinking_xp,
    COALESCE(MAX(CASE WHEN usx.skill = 'practical_skills' THEN usx.xp END), 0) as practical_skills_xp,
    COALESCE(MAX(CASE WHEN usx.skill = 'communication' THEN usx.xp END), 0) as communication_xp,
    COALESCE(MAX(CASE WHEN usx.skill = 'cultural_literacy' THEN usx.xp END), 0) as cultural_literacy_xp,
    COALESCE(SUM(usx.xp), 0) as total_xp
FROM users u
LEFT JOIN user_skill_xp usx ON u.id = usx.user_id
GROUP BY u.id, u.email, u.display_name, u.first_name, u.last_name, u.role, u.level;

-- ========================================
-- STEP 9: CREATE INDEXES
-- ========================================

CREATE INDEX idx_quest_skill_xp_quest_id ON quest_skill_xp(quest_id);
CREATE INDEX idx_quest_skill_xp_skill ON quest_skill_xp(skill);
CREATE INDEX idx_user_skill_xp_user_id ON user_skill_xp(user_id);
CREATE INDEX idx_user_skill_xp_skill ON user_skill_xp(skill);
CREATE INDEX idx_quests_primary_skill ON quests(primary_skill);
CREATE INDEX idx_user_quests_user_id ON user_quests(user_id);
CREATE INDEX idx_user_quests_quest_id ON user_quests(quest_id);
CREATE INDEX idx_user_quests_status ON user_quests(status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email);

-- ========================================
-- STEP 10: SET PERMISSIONS
-- ========================================

GRANT SELECT ON quest_skill_xp TO authenticated;
GRANT SELECT ON user_skill_xp TO authenticated;
GRANT SELECT ON user_xp_summary TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_quests TO authenticated;
GRANT SELECT ON quests TO authenticated;
GRANT SELECT, UPDATE ON users TO authenticated;
GRANT SELECT, INSERT ON quest_reviews TO authenticated;
GRANT SELECT, INSERT ON user_achievements TO authenticated;
GRANT SELECT ON leaderboards TO authenticated;

-- Grant all permissions to service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ========================================
-- STEP 11: CREATE TRIGGERS
-- ========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_quests_updated_at 
    BEFORE UPDATE ON user_quests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quest_reviews_updated_at 
    BEFORE UPDATE ON quest_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_skill_xp_updated_at 
    BEFORE UPDATE ON user_skill_xp
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- STEP 12: VERIFY RESULTS
-- ========================================

DO $$
DECLARE
    user_count INTEGER;
    admin_count INTEGER;
    quest_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO admin_count FROM users WHERE role IN ('admin', 'educator');
    SELECT COUNT(*) INTO quest_count FROM quests;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '   5-PILLAR SYSTEM SETUP COMPLETE!     ';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Users recreated: %', user_count;
    RAISE NOTICE 'Admin/Educator accounts: %', admin_count;
    RAISE NOTICE 'Total quests: %', quest_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Your account has been recreated.';
    RAISE NOTICE 'You can now log in with your existing credentials.';
    RAISE NOTICE '========================================';
END $$;