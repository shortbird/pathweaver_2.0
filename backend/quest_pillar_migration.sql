-- Quest and Pillar System Migration Only
-- This preserves user data and only migrates quest/XP/pillar related tables

-- Drop quest/pillar related triggers first
DROP TRIGGER IF EXISTS trigger_update_user_mastery ON user_skill_xp;

-- Drop quest/pillar related functions
DROP FUNCTION IF EXISTS update_user_mastery_trigger();
DROP FUNCTION IF EXISTS calculate_mastery_level(BIGINT);
DROP FUNCTION IF EXISTS get_user_total_xp(UUID);
DROP FUNCTION IF EXISTS get_user_xp_by_pillar(UUID);
DROP FUNCTION IF EXISTS get_user_xp_by_subject(UUID);

-- Drop quest/XP related tables only (in correct order for dependencies)
DROP TABLE IF EXISTS learning_logs CASCADE;
DROP TABLE IF EXISTS user_mastery CASCADE;
DROP TABLE IF EXISTS quest_collaborations CASCADE;
DROP TABLE IF EXISTS quest_submissions CASCADE;
DROP TABLE IF EXISTS user_skill_xp CASCADE;
DROP TABLE IF EXISTS user_quest_tasks CASCADE;
DROP TABLE IF EXISTS user_quests CASCADE;
DROP TABLE IF EXISTS quest_tasks CASCADE;
DROP TABLE IF EXISTS quest_xp_awards CASCADE;
DROP TABLE IF EXISTS quests CASCADE;

-- Drop quest/pillar related types only
DROP TYPE IF EXISTS collaboration_status CASCADE;
DROP TYPE IF EXISTS evidence_type CASCADE;
DROP TYPE IF EXISTS quest_source CASCADE;
DROP TYPE IF EXISTS pillar_type CASCADE;
DROP TYPE IF EXISTS quest_status CASCADE;

-- Create new quest/pillar specific types
CREATE TYPE pillar_type AS ENUM (
    'arts_creativity', 
    'stem_logic', 
    'life_wellness', 
    'language_communication', 
    'society_culture'
);
CREATE TYPE quest_source AS ENUM ('khan_academy', 'brilliant', 'custom', 'optio');
CREATE TYPE evidence_type AS ENUM ('text', 'link', 'image', 'video', 'document');
CREATE TYPE collaboration_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

-- Quests table (V3 structure)
CREATE TABLE quests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    big_idea TEXT,
    source quest_source DEFAULT 'custom',
    header_image_url TEXT,
    is_v3 BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quest Tasks table (V3)
CREATE TABLE quest_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    evidence_prompt TEXT,
    materials_needed JSONB DEFAULT '[]',
    pillar pillar_type NOT NULL,
    xp_amount INTEGER NOT NULL CHECK (xp_amount > 0),
    order_index INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT TRUE,
    is_collaboration_eligible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Quest Enrollments (V3)
CREATE TABLE user_quests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Quest Task Completions (V3)
CREATE TABLE user_quest_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_task_id UUID NOT NULL REFERENCES quest_tasks(id) ON DELETE CASCADE,
    user_quest_id UUID NOT NULL REFERENCES user_quests(id) ON DELETE CASCADE,
    evidence_type evidence_type NOT NULL,
    evidence_content TEXT NOT NULL,
    xp_awarded INTEGER NOT NULL CHECK (xp_awarded > 0),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, quest_task_id)
);

-- User Skill XP (V3 - uses new pillar system)
CREATE TABLE user_skill_xp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pillar pillar_type NOT NULL,
    xp_amount INTEGER NOT NULL DEFAULT 0 CHECK (xp_amount >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, pillar)
);

-- Quest Submissions (Custom quest requests)
CREATE TABLE quest_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    suggested_tasks JSONB DEFAULT '[]',
    make_public BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_quest_id UUID REFERENCES quests(id),
    admin_feedback TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Quest Collaborations
CREATE TABLE quest_collaborations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status collaboration_status DEFAULT 'pending',
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(requester_id, partner_id, quest_id),
    CHECK (requester_id != partner_id)
);

-- User Mastery Levels
CREATE TABLE user_mastery (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_xp INTEGER NOT NULL DEFAULT 0,
    mastery_level INTEGER NOT NULL DEFAULT 1,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Learning Logs
CREATE TABLE learning_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_quest_id UUID NOT NULL REFERENCES user_quests(id) ON DELETE CASCADE,
    entry_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_quests_active ON quests(is_active);
CREATE INDEX idx_quests_source ON quests(source);
CREATE INDEX idx_quest_tasks_quest_id ON quest_tasks(quest_id);
CREATE INDEX idx_quest_tasks_pillar ON quest_tasks(pillar);
CREATE INDEX idx_user_quests_user_id ON user_quests(user_id);
CREATE INDEX idx_user_quests_quest_id ON user_quests(quest_id);
CREATE INDEX idx_user_quests_active ON user_quests(is_active);
CREATE INDEX idx_user_quest_tasks_user_id ON user_quest_tasks(user_id);
CREATE INDEX idx_user_quest_tasks_task_id ON user_quest_tasks(quest_task_id);
CREATE INDEX idx_user_quest_tasks_completion ON user_quest_tasks(completed_at);
CREATE INDEX idx_user_skill_xp_user_id ON user_skill_xp(user_id);
CREATE INDEX idx_user_skill_xp_pillar ON user_skill_xp(pillar);
CREATE INDEX idx_quest_submissions_user_id ON quest_submissions(user_id);
CREATE INDEX idx_quest_submissions_status ON quest_submissions(status);
CREATE INDEX idx_quest_collaborations_requester ON quest_collaborations(requester_id);
CREATE INDEX idx_quest_collaborations_partner ON quest_collaborations(partner_id);
CREATE INDEX idx_learning_logs_user_quest ON learning_logs(user_quest_id);

-- Enable RLS on quest/XP tables
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quest_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skill_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_logs ENABLE ROW LEVEL SECURITY;

-- Quest policies (public read)
CREATE POLICY "Quests are viewable by everyone" ON quests
    FOR SELECT USING (is_active = true);

CREATE POLICY "Only admins can manage quests" ON quests
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Quest tasks policies
CREATE POLICY "Quest tasks viewable with quests" ON quest_tasks
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM quests WHERE id = quest_id AND is_active = true)
    );

CREATE POLICY "Only admins can manage quest tasks" ON quest_tasks
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- User quests policies
CREATE POLICY "Users can view their own quest enrollments" ON user_quests
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can enroll in quests" ON user_quests
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own quest enrollments" ON user_quests
    FOR UPDATE USING (user_id = auth.uid());

-- User quest tasks policies
CREATE POLICY "Users can view their own task completions" ON user_quest_tasks
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can complete their own tasks" ON user_quest_tasks
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- User skill XP policies
CREATE POLICY "Users can view their own XP" ON user_skill_xp
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Public XP viewing for diplomas" ON user_skill_xp
    FOR SELECT USING (true);

-- Quest submissions policies
CREATE POLICY "Users can view their own submissions" ON quest_submissions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create submissions" ON quest_submissions
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all submissions" ON quest_submissions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can update submissions" ON quest_submissions
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Collaboration policies
CREATE POLICY "Users can view their collaborations" ON quest_collaborations
    FOR SELECT USING (requester_id = auth.uid() OR partner_id = auth.uid());

CREATE POLICY "Users can create collaboration requests" ON quest_collaborations
    FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can respond to collaborations" ON quest_collaborations
    FOR UPDATE USING (partner_id = auth.uid() OR requester_id = auth.uid());

-- Mastery policies
CREATE POLICY "Users can view their own mastery" ON user_mastery
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Public mastery viewing for diplomas" ON user_mastery
    FOR SELECT USING (true);

-- Learning logs policies
CREATE POLICY "Users can manage their own learning logs" ON learning_logs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_quests 
            WHERE id = user_quest_id AND user_id = auth.uid()
        )
    );

-- Recreate necessary functions
CREATE OR REPLACE FUNCTION calculate_mastery_level(total_xp BIGINT)
RETURNS INTEGER AS $$
BEGIN
    CASE
        WHEN total_xp <= 500 THEN RETURN 1;
        WHEN total_xp <= 1500 THEN RETURN 2;
        WHEN total_xp <= 3500 THEN RETURN 3;
        WHEN total_xp <= 7000 THEN RETURN 4;
        WHEN total_xp <= 12500 THEN RETURN 5;
        WHEN total_xp <= 20000 THEN RETURN 6;
        WHEN total_xp <= 30000 THEN RETURN 7;
        WHEN total_xp <= 45000 THEN RETURN 8;
        WHEN total_xp <= 65000 THEN RETURN 9;
        WHEN total_xp <= 90000 THEN RETURN 10;
        WHEN total_xp <= 120000 THEN RETURN 11;
        WHEN total_xp <= 160000 THEN RETURN 12;
        ELSE RETURN 13 + ((total_xp - 160000) / 40000)::INTEGER;
    END CASE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_total_xp(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(xp_amount) FROM user_skill_xp WHERE user_id = p_user_id),
        0
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_xp_by_pillar(p_user_id UUID)
RETURNS TABLE(pillar pillar_type, total_xp INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT uskx.pillar, uskx.xp_amount
    FROM user_skill_xp uskx
    WHERE uskx.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_user_mastery_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_mastery (user_id, total_xp, mastery_level, last_updated)
    VALUES (
        NEW.user_id, 
        get_user_total_xp(NEW.user_id),
        calculate_mastery_level(get_user_total_xp(NEW.user_id)),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        total_xp = get_user_total_xp(NEW.user_id),
        mastery_level = calculate_mastery_level(get_user_total_xp(NEW.user_id)),
        last_updated = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate triggers
CREATE TRIGGER trigger_update_user_mastery
    AFTER INSERT OR UPDATE ON user_skill_xp
    FOR EACH ROW
    EXECUTE FUNCTION update_user_mastery_trigger();

-- Update timestamp trigger for quest tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_quests_updated_at
    BEFORE UPDATE ON quests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_user_skill_xp_updated_at
    BEFORE UPDATE ON user_skill_xp
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_learning_logs_updated_at
    BEFORE UPDATE ON learning_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();