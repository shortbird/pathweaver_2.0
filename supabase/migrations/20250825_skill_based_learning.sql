-- Migration: Skill-based Learning System
-- Description: Convert from subject-based to skill-based learning with diploma system

-- 1. Add new columns to quests table
ALTER TABLE quests ADD COLUMN IF NOT EXISTS difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced'));
ALTER TABLE quests ADD COLUMN IF NOT EXISTS estimated_hours INTEGER;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS effort_level TEXT CHECK (effort_level IN ('light', 'moderate', 'intensive'));
ALTER TABLE quests ADD COLUMN IF NOT EXISTS accepted_evidence_types TEXT[];
ALTER TABLE quests ADD COLUMN IF NOT EXISTS example_submissions TEXT;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS core_skills TEXT[];
ALTER TABLE quests ADD COLUMN IF NOT EXISTS resources_needed TEXT;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS location_requirements TEXT;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS optional_challenges JSONB;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS safety_considerations TEXT;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS requires_adult_supervision BOOLEAN DEFAULT FALSE;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS collaboration_ideas TEXT;

-- 2. Create new skills-based XP table
CREATE TABLE IF NOT EXISTS quest_skill_xp (
    id SERIAL PRIMARY KEY,
    quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
    skill_category TEXT NOT NULL CHECK (skill_category IN ('reading_writing', 'thinking_skills', 'personal_growth', 'life_skills', 'making_creating', 'world_understanding')),
    xp_amount INTEGER NOT NULL CHECK (xp_amount > 0),
    UNIQUE(quest_id, skill_category)
);

-- 3. Create diploma/portfolio system tables
CREATE TABLE IF NOT EXISTS diplomas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) UNIQUE,
    issued_date TIMESTAMP DEFAULT NOW(),
    portfolio_slug TEXT UNIQUE,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Track user's XP by skill category
CREATE TABLE IF NOT EXISTS user_skill_xp (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    skill_category TEXT NOT NULL CHECK (skill_category IN ('reading_writing', 'thinking_skills', 'personal_growth', 'life_skills', 'making_creating', 'world_understanding')),
    total_xp INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, skill_category)
);

-- 5. Track individual skill development
CREATE TABLE IF NOT EXISTS user_skill_details (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    skill_name TEXT NOT NULL,
    times_practiced INTEGER DEFAULT 0,
    last_practiced TIMESTAMP,
    UNIQUE(user_id, skill_name)
);

-- 6. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_quest_skill_xp_quest_id ON quest_skill_xp(quest_id);
CREATE INDEX IF NOT EXISTS idx_diplomas_portfolio_slug ON diplomas(portfolio_slug);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_user_id ON user_skill_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skill_details_user_id ON user_skill_details(user_id);

-- 7. Enable RLS on new tables
ALTER TABLE quest_skill_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE diplomas ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skill_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skill_details ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for quest_skill_xp
CREATE POLICY "Quest skill XP viewable by all" ON quest_skill_xp
    FOR SELECT USING (true);

CREATE POLICY "Quest skill XP insertable by admins" ON quest_skill_xp
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

CREATE POLICY "Quest skill XP updatable by admins" ON quest_skill_xp
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

CREATE POLICY "Quest skill XP deletable by admins" ON quest_skill_xp
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- 9. RLS Policies for diplomas
CREATE POLICY "Diplomas viewable by owner or if public" ON diplomas
    FOR SELECT USING (
        user_id = auth.uid() OR is_public = true
    );

CREATE POLICY "Diplomas insertable by system" ON diplomas
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Diplomas updatable by owner" ON diplomas
    FOR UPDATE USING (user_id = auth.uid());

-- 10. RLS Policies for user_skill_xp
CREATE POLICY "User skill XP viewable by owner or admins" ON user_skill_xp
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

CREATE POLICY "User skill XP insertable by system" ON user_skill_xp
    FOR INSERT WITH CHECK (true);

CREATE POLICY "User skill XP updatable by system" ON user_skill_xp
    FOR UPDATE USING (true);

-- 11. RLS Policies for user_skill_details
CREATE POLICY "User skill details viewable by owner or admins" ON user_skill_details
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

CREATE POLICY "User skill details insertable by system" ON user_skill_details
    FOR INSERT WITH CHECK (true);

CREATE POLICY "User skill details updatable by system" ON user_skill_details
    FOR UPDATE USING (true);

-- 12. Function to generate unique portfolio slug
CREATE OR REPLACE FUNCTION generate_portfolio_slug(username TEXT)
RETURNS TEXT AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    -- Create base slug from username
    base_slug := lower(regexp_replace(username, '[^a-zA-Z0-9]', '', 'g'));
    final_slug := base_slug;
    
    -- Check for uniqueness and add counter if needed
    WHILE EXISTS (SELECT 1 FROM diplomas WHERE portfolio_slug = final_slug) LOOP
        counter := counter + 1;
        final_slug := base_slug || counter::TEXT;
    END LOOP;
    
    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- 13. Function to initialize user skills on registration
CREATE OR REPLACE FUNCTION initialize_user_skills()
RETURNS TRIGGER AS $$
BEGIN
    -- Create diploma for new user
    INSERT INTO diplomas (user_id, portfolio_slug)
    VALUES (NEW.id, generate_portfolio_slug(NEW.username));
    
    -- Initialize all skill categories with 0 XP
    INSERT INTO user_skill_xp (user_id, skill_category, total_xp)
    VALUES 
        (NEW.id, 'reading_writing', 0),
        (NEW.id, 'thinking_skills', 0),
        (NEW.id, 'personal_growth', 0),
        (NEW.id, 'life_skills', 0),
        (NEW.id, 'making_creating', 0),
        (NEW.id, 'world_understanding', 0);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 14. Create trigger for new user registration
CREATE TRIGGER on_user_created
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION initialize_user_skills();

-- 15. Migrate existing users (create diplomas and skill XP records)
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN SELECT id, username FROM users WHERE NOT EXISTS (SELECT 1 FROM diplomas WHERE user_id = users.id)
    LOOP
        -- Create diploma
        INSERT INTO diplomas (user_id, portfolio_slug)
        VALUES (user_record.id, generate_portfolio_slug(user_record.username))
        ON CONFLICT (user_id) DO NOTHING;
        
        -- Initialize skill categories
        INSERT INTO user_skill_xp (user_id, skill_category, total_xp)
        VALUES 
            (user_record.id, 'reading_writing', 0),
            (user_record.id, 'thinking_skills', 0),
            (user_record.id, 'personal_growth', 0),
            (user_record.id, 'life_skills', 0),
            (user_record.id, 'making_creating', 0),
            (user_record.id, 'world_understanding', 0)
        ON CONFLICT (user_id, skill_category) DO NOTHING;
    END LOOP;
END $$;

-- Note: The old quest_xp_awards table will be dropped after data migration is complete
-- Use the migration script to convert existing quest XP awards to skill-based system