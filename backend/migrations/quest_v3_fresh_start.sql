-- Quest System V3 - Complete Database Rebuild
-- WARNING: This will DELETE all quest-related data. Back up first!

-- Step 1: Drop all old quest-related tables
DROP TABLE IF EXISTS quest_skill_xp CASCADE;
DROP TABLE IF EXISTS quest_xp_awards CASCADE;
DROP TABLE IF EXISTS submissions CASCADE;
DROP TABLE IF EXISTS submission_evidence CASCADE;
DROP TABLE IF EXISTS user_quests CASCADE;
DROP TABLE IF EXISTS quests CASCADE;
DROP TABLE IF EXISTS user_skill_xp CASCADE;
DROP TABLE IF EXISTS quest_collaborations CASCADE;
DROP TABLE IF EXISTS learning_logs CASCADE;
DROP TABLE IF EXISTS user_quest_tasks CASCADE;
DROP TABLE IF EXISTS quest_tasks CASCADE;

-- Step 2: Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 3: Create new tables

-- Main quests table (simplified)
CREATE TABLE quests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    big_idea TEXT NOT NULL,
    header_image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quest tasks (the actual work items)
CREATE TABLE quest_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    xp_amount INTEGER NOT NULL CHECK (xp_amount > 0),
    pillar TEXT NOT NULL CHECK (pillar IN ('creativity', 'critical_thinking', 'practical_skills', 'communication', 'cultural_literacy')),
    task_order INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT true,
    is_collaboration_eligible BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User quest enrollments
CREATE TABLE user_quests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, quest_id)
);

-- Task completions with evidence
CREATE TABLE user_quest_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    quest_task_id UUID REFERENCES quest_tasks(id) ON DELETE CASCADE,
    user_quest_id UUID REFERENCES user_quests(id) ON DELETE CASCADE,
    evidence_type TEXT NOT NULL CHECK (evidence_type IN ('text', 'link', 'image', 'video')),
    evidence_content TEXT NOT NULL, -- URL for files, actual content for text/links
    xp_awarded INTEGER NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, quest_task_id)
);

-- Team collaborations
CREATE TABLE quest_collaborations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL,
    partner_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(quest_id, requester_id, partner_id)
);

-- Learning logs
CREATE TABLE learning_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_quest_id UUID REFERENCES user_quests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    entry_text TEXT NOT NULL,
    media_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User XP tracking (simplified)
CREATE TABLE user_skill_xp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    pillar TEXT NOT NULL CHECK (pillar IN ('creativity', 'critical_thinking', 'practical_skills', 'communication', 'cultural_literacy')),
    xp_amount INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, pillar)
);

-- Step 4: Create indexes for performance
CREATE INDEX idx_quest_tasks_quest_id ON quest_tasks(quest_id);
CREATE INDEX idx_user_quests_user_id ON user_quests(user_id);
CREATE INDEX idx_user_quest_tasks_user_id ON user_quest_tasks(user_id);
CREATE INDEX idx_learning_logs_user_quest_id ON learning_logs(user_quest_id);
CREATE INDEX idx_quest_collaborations_partner_id ON quest_collaborations(partner_id);
CREATE INDEX idx_quest_collaborations_status ON quest_collaborations(status);
CREATE INDEX idx_user_skill_xp_user_id ON user_skill_xp(user_id);

-- Step 5: Create some sample data for testing
INSERT INTO quests (id, title, big_idea, header_image_url) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Digital Artist Journey', 'Master digital art fundamentals through hands-on creation', '/images/digital-art-header.jpg'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Code Your First Game', 'Learn programming by building an interactive game', '/images/coding-game-header.jpg'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Environmental Explorer', 'Document and analyze your local ecosystem', '/images/environment-header.jpg');

-- Add tasks for Digital Artist Journey
INSERT INTO quest_tasks (quest_id, title, description, xp_amount, pillar, task_order, is_collaboration_eligible) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Create a Digital Self-Portrait', 'Use any digital tool to create a self-portrait that expresses your personality', 100, 'creativity', 1, true),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Study Color Theory', 'Document your learning about color relationships and create a color palette', 75, 'critical_thinking', 2, false),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Share Your Process', 'Create a video or blog post showing your artistic process', 150, 'communication', 3, true),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Critique and Improve', 'Get feedback on your work and create an improved version', 125, 'critical_thinking', 4, false);

-- Add tasks for Code Your First Game
INSERT INTO quest_tasks (quest_id, title, description, xp_amount, pillar, task_order, is_collaboration_eligible) VALUES
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Design Your Game Concept', 'Create a game design document with rules and objectives', 80, 'creativity', 1, true),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Build the Game Logic', 'Code the core gameplay mechanics', 200, 'practical_skills', 2, true),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Add Graphics and Sound', 'Create or find assets to make your game engaging', 100, 'creativity', 3, false),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Test and Debug', 'Find and fix bugs, get feedback from testers', 150, 'critical_thinking', 4, true);

-- Add tasks for Environmental Explorer
INSERT INTO quest_tasks (quest_id, title, description, xp_amount, pillar, task_order, is_collaboration_eligible) VALUES
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Map Your Local Area', 'Create a detailed map of a local natural area', 90, 'practical_skills', 1, true),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Document Species', 'Photograph and identify at least 10 different species', 120, 'cultural_literacy', 2, true),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Analyze Environmental Impact', 'Research human impact on your chosen ecosystem', 100, 'critical_thinking', 3, false),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Create an Action Plan', 'Propose solutions to protect your local environment', 140, 'communication', 4, true);

-- Grant necessary permissions (adjust based on your Supabase setup)
-- These are examples - modify based on your RLS policies
GRANT ALL ON quests TO authenticated;
GRANT ALL ON quest_tasks TO authenticated;
GRANT ALL ON user_quests TO authenticated;
GRANT ALL ON user_quest_tasks TO authenticated;
GRANT ALL ON quest_collaborations TO authenticated;
GRANT ALL ON learning_logs TO authenticated;
GRANT ALL ON user_skill_xp TO authenticated;