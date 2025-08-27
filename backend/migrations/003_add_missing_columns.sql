-- Add any missing columns and constraints for the 5-pillar system

-- Step 1: Ensure users table has necessary fields
ALTER TABLE users
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS streak_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS badges JSONB DEFAULT '[]';

-- Step 2: Ensure quests table has all necessary fields
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS estimated_time_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS prerequisite_quest_id UUID REFERENCES quests(id),
ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS is_repeatable BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS resources JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS rubric JSONB DEFAULT '{}';

-- Step 3: Ensure user_quests has all tracking fields
ALTER TABLE user_quests
ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS time_spent_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS score DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS feedback TEXT,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES auth.users(id);

-- Step 4: Create quest_reviews table for peer/instructor reviews
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

-- Step 5: Create user_achievements table
CREATE TABLE IF NOT EXISTS user_achievements (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    achievement_type VARCHAR(50) NOT NULL,
    achievement_name VARCHAR(100) NOT NULL,
    achievement_data JSONB DEFAULT '{}',
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, achievement_type, achievement_name)
);

-- Step 6: Create leaderboards table
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

-- Step 7: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_quests_user_id_status ON user_quests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_quests_quest_id ON user_quests(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_reviews_user_quest_id ON quest_reviews(user_quest_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboards_period ON leaderboards(period_type, period_start);

-- Step 8: Add triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_quest_reviews_updated_at BEFORE UPDATE ON quest_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migration complete!