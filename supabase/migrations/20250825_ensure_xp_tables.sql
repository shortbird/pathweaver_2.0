-- Migration: Ensure XP tracking tables exist
-- Description: Create XP tables if they don't exist for both old and new systems

-- Create user_xp table for backward compatibility (old subject-based system)
CREATE TABLE IF NOT EXISTS user_xp (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    total_xp INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, subject)
);

-- Ensure user_skill_xp table exists (new skill-based system)
CREATE TABLE IF NOT EXISTS user_skill_xp (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    skill_category TEXT NOT NULL CHECK (skill_category IN ('reading_writing', 'thinking_skills', 'personal_growth', 'life_skills', 'making_creating', 'world_understanding')),
    total_xp INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, skill_category)
);

-- Ensure user_skill_details table exists
CREATE TABLE IF NOT EXISTS user_skill_details (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    skill_name TEXT NOT NULL,
    times_practiced INTEGER DEFAULT 0,
    last_practiced TIMESTAMP,
    UNIQUE(user_id, skill_name)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_xp_user_id ON user_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_user_id ON user_skill_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skill_details_user_id ON user_skill_details(user_id);

-- Enable RLS
ALTER TABLE user_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skill_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skill_details ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_xp (old system)
CREATE POLICY "Users can view their own XP" ON user_xp
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all XP" ON user_xp
    FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for user_skill_xp (already exists but ensure they're correct)
DROP POLICY IF EXISTS "Users can view their own skill XP" ON user_skill_xp;
CREATE POLICY "Users can view their own skill XP" ON user_skill_xp
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage skill XP" ON user_skill_xp;
CREATE POLICY "Service role can manage skill XP" ON user_skill_xp
    FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for user_skill_details
DROP POLICY IF EXISTS "Users can view their own skill details" ON user_skill_details;
CREATE POLICY "Users can view their own skill details" ON user_skill_details
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage skill details" ON user_skill_details;
CREATE POLICY "Service role can manage skill details" ON user_skill_details
    FOR ALL USING (auth.role() = 'service_role');