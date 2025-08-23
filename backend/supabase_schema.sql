-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE subscription_tier AS ENUM ('explorer', 'creator', 'visionary');
CREATE TYPE quest_status AS ENUM ('in_progress', 'pending_review', 'completed', 'needs_changes');
CREATE TYPE friendship_status AS ENUM ('pending', 'accepted');
CREATE TYPE subject_type AS ENUM (
    'language_arts', 'math', 'science', 'social_studies', 
    'foreign_language', 'arts', 'technology', 'physical_education'
);

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    subscription_tier subscription_tier DEFAULT 'explorer',
    stripe_customer_id TEXT UNIQUE,
    role TEXT DEFAULT 'student',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quests table
CREATE TABLE quests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    evidence_requirements TEXT NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quest XP Awards table
CREATE TABLE quest_xp_awards (
    id SERIAL PRIMARY KEY,
    quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
    subject subject_type NOT NULL,
    xp_amount INTEGER NOT NULL CHECK (xp_amount > 0)
);

-- User Quests table (tracks user progress)
CREATE TABLE user_quests (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
    status quest_status DEFAULT 'in_progress',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, quest_id)
);

-- Submissions table
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_quest_id INTEGER REFERENCES user_quests(id) ON DELETE CASCADE,
    educator_id UUID REFERENCES users(id),
    feedback TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Submission Evidence table
CREATE TABLE submission_evidence (
    id SERIAL PRIMARY KEY,
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
    file_url TEXT,
    text_content TEXT
);

-- Friendships table
CREATE TABLE friendships (
    id SERIAL PRIMARY KEY,
    requester_id UUID REFERENCES users(id) ON DELETE CASCADE,
    addressee_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status friendship_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(requester_id, addressee_id)
);

-- Activity Log table
CREATE TABLE activity_log (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_user_quests_user_id ON user_quests(user_id);
CREATE INDEX idx_user_quests_quest_id ON user_quests(quest_id);
CREATE INDEX idx_user_quests_status ON user_quests(status);
CREATE INDEX idx_submissions_user_quest_id ON submissions(user_quest_id);
CREATE INDEX idx_friendships_requester ON friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_event_type ON activity_log(event_type);

-- Row Level Security (RLS) Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_xp_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view their own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Quests policies (public read)
CREATE POLICY "Quests are viewable by everyone" ON quests
    FOR SELECT USING (true);

CREATE POLICY "Only admins can create quests" ON users
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'educator'))
    );

-- User quests policies
CREATE POLICY "Users can view their own quests" ON user_quests
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can start quests" ON user_quests
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own quests" ON user_quests
    FOR UPDATE USING (user_id = auth.uid());

-- Submissions policies
CREATE POLICY "Users can view their own submissions" ON submissions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM user_quests WHERE id = user_quest_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can create submissions for their quests" ON submissions
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM user_quests WHERE id = user_quest_id AND user_id = auth.uid())
    );

-- Friendships policies
CREATE POLICY "Users can view their friendships" ON friendships
    FOR SELECT USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE POLICY "Users can send friend requests" ON friendships
    FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can update friendships they're part of" ON friendships
    FOR UPDATE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Functions
CREATE OR REPLACE FUNCTION get_user_total_xp(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(qa.xp_amount)
         FROM user_quests uq
         JOIN quest_xp_awards qa ON qa.quest_id = uq.quest_id
         WHERE uq.user_id = p_user_id AND uq.status = 'completed'),
        0
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_xp_by_subject(p_user_id UUID)
RETURNS TABLE(subject subject_type, total_xp INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT qa.subject, COALESCE(SUM(qa.xp_amount), 0)::INTEGER as total_xp
    FROM user_quests uq
    JOIN quest_xp_awards qa ON qa.quest_id = uq.quest_id
    WHERE uq.user_id = p_user_id AND uq.status = 'completed'
    GROUP BY qa.subject;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_monthly_active_users()
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(DISTINCT user_id)
        FROM activity_log
        WHERE created_at >= NOW() - INTERVAL '30 days'
    );
END;
$$ LANGUAGE plpgsql;