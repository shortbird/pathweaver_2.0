-- ========================================
-- RENDER POSTGRES DATABASE SCHEMA
-- Cleaned up and optimized version
-- ========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE user_role AS ENUM ('student', 'parent', 'advisor', 'admin');
CREATE TYPE subscription_tier AS ENUM ('explorer', 'creator', 'visionary', 'academy');
CREATE TYPE quest_source AS ENUM ('khan_academy', 'brilliant', 'custom', 'admin', 'community');
CREATE TYPE skill_pillar AS ENUM ('creativity', 'critical_thinking', 'practical_skills', 'communication', 'cultural_literacy');
CREATE TYPE submission_status AS ENUM ('pending', 'approved', 'rejected');

-- ========================================
-- CORE USER TABLES
-- ========================================

-- Users table (simplified - no auth dependency)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role user_role DEFAULT 'student',
    subscription_tier subscription_tier DEFAULT 'explorer',
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    subscription_status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_users_email (email),
    INDEX idx_users_username (username),
    INDEX idx_users_stripe (stripe_customer_id)
);

-- User profiles (extended info)
CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    avatar_url TEXT,
    location VARCHAR(255),
    birthdate DATE,
    parent_email VARCHAR(255),
    school VARCHAR(255),
    grade_level INTEGER,
    interests TEXT[],
    portfolio_slug VARCHAR(100) UNIQUE,
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_profiles_slug (portfolio_slug)
);

-- ========================================
-- QUEST SYSTEM TABLES (V3)
-- ========================================

-- Quests table (cleaned up)
CREATE TABLE quests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    source quest_source DEFAULT 'custom',
    category VARCHAR(100),
    difficulty_level INTEGER DEFAULT 1 CHECK (difficulty_level >= 1 AND difficulty_level <= 5),
    estimated_hours INTEGER,
    prerequisites TEXT[],
    tags TEXT[],
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_quests_source (source),
    INDEX idx_quests_active (is_active),
    INDEX idx_quests_featured (is_featured)
);

-- Quest tasks (V3 system)
CREATE TABLE quest_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    pillar skill_pillar NOT NULL,
    xp_value INTEGER NOT NULL CHECK (xp_value > 0),
    order_index INTEGER NOT NULL,
    is_required BOOLEAN DEFAULT true,
    resources JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(quest_id, order_index),
    INDEX idx_tasks_quest (quest_id),
    INDEX idx_tasks_pillar (pillar)
);

-- User quest enrollments
CREATE TABLE user_quests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    UNIQUE(user_id, quest_id),
    INDEX idx_user_quests_user (user_id),
    INDEX idx_user_quests_quest (quest_id),
    INDEX idx_user_quests_active (is_active)
);

-- Task completions (evidence)
CREATE TABLE quest_task_completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES quest_tasks(id) ON DELETE CASCADE,
    evidence_text TEXT,
    evidence_url TEXT,
    evidence_files JSONB,
    xp_awarded INTEGER,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by UUID REFERENCES users(id),
    UNIQUE(user_id, task_id),
    INDEX idx_completions_user (user_id),
    INDEX idx_completions_quest (quest_id),
    INDEX idx_completions_task (task_id)
);

-- ========================================
-- XP AND SKILLS TRACKING
-- ========================================

-- User skill XP (aggregated)
CREATE TABLE user_skill_xp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pillar skill_pillar NOT NULL,
    xp_amount INTEGER DEFAULT 0 CHECK (xp_amount >= 0),
    level INTEGER DEFAULT 1,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, pillar),
    INDEX idx_skill_xp_user (user_id),
    INDEX idx_skill_xp_pillar (pillar)
);

-- XP history (for tracking changes)
CREATE TABLE xp_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pillar skill_pillar NOT NULL,
    xp_change INTEGER NOT NULL,
    reason TEXT,
    source_type VARCHAR(50), -- 'task_completion', 'bonus', 'adjustment'
    source_id UUID, -- References the completion or adjustment
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_xp_history_user (user_id),
    INDEX idx_xp_history_date (created_at)
);

-- ========================================
-- QUEST SUBMISSIONS (Custom Quests)
-- ========================================

CREATE TABLE quest_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    suggested_tasks JSONB NOT NULL,
    make_public BOOLEAN DEFAULT false,
    status submission_status DEFAULT 'pending',
    approved_quest_id UUID REFERENCES quests(id),
    review_notes TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_submissions_user (user_id),
    INDEX idx_submissions_status (status)
);

-- ========================================
-- COLLABORATION AND SOCIAL
-- ========================================

CREATE TABLE quest_collaborations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'participant',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(quest_id, user_id),
    INDEX idx_collaborations_quest (quest_id),
    INDEX idx_collaborations_user (user_id)
);

-- Quest ratings
CREATE TABLE quest_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(quest_id, user_id),
    INDEX idx_ratings_quest (quest_id)
);

-- ========================================
-- LEARNING LOGS
-- ========================================

CREATE TABLE learning_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id UUID REFERENCES quests(id) ON DELETE SET NULL,
    task_id UUID REFERENCES quest_tasks(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    reflection TEXT,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_logs_user (user_id),
    INDEX idx_logs_date (created_at)
);

-- ========================================
-- SITE SETTINGS
-- ========================================

CREATE TABLE site_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

-- Composite indexes for common queries
CREATE INDEX idx_completions_user_quest ON quest_task_completions(user_id, quest_id);
CREATE INDEX idx_user_quests_active_user ON user_quests(user_id, is_active);
CREATE INDEX idx_quests_source_active ON quests(source, is_active);

-- ========================================
-- TRIGGERS FOR UPDATED_AT
-- ========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quests_updated_at BEFORE UPDATE ON quests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

-- Function to calculate user level based on XP
CREATE OR REPLACE FUNCTION calculate_level(xp INTEGER)
RETURNS INTEGER AS $$
BEGIN
    RETURN FLOOR(SQRT(xp / 100)) + 1;
END;
$$ LANGUAGE plpgsql;

-- Function to update user quest progress
CREATE OR REPLACE FUNCTION update_quest_progress(p_user_id UUID, p_quest_id UUID)
RETURNS void AS $$
DECLARE
    total_tasks INTEGER;
    completed_tasks INTEGER;
    progress INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_tasks
    FROM quest_tasks
    WHERE quest_id = p_quest_id AND is_required = true;
    
    SELECT COUNT(*) INTO completed_tasks
    FROM quest_task_completions
    WHERE user_id = p_user_id AND quest_id = p_quest_id
    AND task_id IN (
        SELECT id FROM quest_tasks 
        WHERE quest_id = p_quest_id AND is_required = true
    );
    
    IF total_tasks > 0 THEN
        progress := (completed_tasks * 100) / total_tasks;
        
        UPDATE user_quests
        SET progress_percentage = progress,
            completed_at = CASE 
                WHEN progress = 100 THEN NOW() 
                ELSE NULL 
            END
        WHERE user_id = p_user_id AND quest_id = p_quest_id;
    END IF;
END;
$$ LANGUAGE plpgsql;