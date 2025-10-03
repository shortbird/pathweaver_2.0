-- ============================================================================
-- PERSONALIZED QUEST SYSTEM - DATABASE MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Part 1: Create new tables for personalized quest system
-- ============================================================================

-- Table: user_quest_tasks (stores user-specific personalized tasks)
CREATE TABLE IF NOT EXISTS user_quest_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    user_quest_id UUID NOT NULL REFERENCES user_quests(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    pillar TEXT NOT NULL,
    xp_value INTEGER DEFAULT 100,
    order_index INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT true,
    is_manual BOOLEAN DEFAULT false,
    approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for user_quest_tasks
CREATE INDEX IF NOT EXISTS idx_user_quest_tasks_user_quest
    ON user_quest_tasks(user_id, quest_id);
CREATE INDEX IF NOT EXISTS idx_user_quest_tasks_user_quest_id
    ON user_quest_tasks(user_quest_id);
CREATE INDEX IF NOT EXISTS idx_user_quest_tasks_approval
    ON user_quest_tasks(approval_status) WHERE approval_status = 'pending';

-- Table: task_collaborations (task-level teamwork replacing quest-level)
CREATE TABLE IF NOT EXISTS task_collaborations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES user_quest_tasks(id) ON DELETE CASCADE,
    student_1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed')),
    double_xp_awarded BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for task_collaborations
CREATE INDEX IF NOT EXISTS idx_task_collaborations_students
    ON task_collaborations(student_1_id, student_2_id);
CREATE INDEX IF NOT EXISTS idx_task_collaborations_task
    ON task_collaborations(task_id);

-- Table: quest_personalization_sessions (tracks AI personalization process)
CREATE TABLE IF NOT EXISTS quest_personalization_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    selected_approach TEXT,
    selected_interests JSONB DEFAULT '[]'::jsonb,
    cross_curricular_subjects JSONB DEFAULT '[]'::jsonb,
    ai_generated_tasks JSONB,
    finalized_tasks JSONB,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for quest_personalization_sessions
CREATE INDEX IF NOT EXISTS idx_personalization_user_quest
    ON quest_personalization_sessions(user_id, quest_id);

-- Table: ai_task_cache (performance optimization for AI-generated tasks)
CREATE TABLE IF NOT EXISTS ai_task_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    cache_key TEXT NOT NULL,
    interests_hash TEXT,
    generated_tasks JSONB NOT NULL,
    hit_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

-- Indexes for ai_task_cache
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_cache_key
    ON ai_task_cache(quest_id, cache_key);
CREATE INDEX IF NOT EXISTS idx_task_cache_expiry
    ON ai_task_cache(expires_at);

-- Enable Row Level Security (RLS) on new tables
ALTER TABLE user_quest_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_personalization_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_task_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_quest_tasks
CREATE POLICY "Users can view their own tasks"
    ON user_quest_tasks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tasks"
    ON user_quest_tasks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks"
    ON user_quest_tasks FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for task_collaborations
CREATE POLICY "Users can view their own collaborations"
    ON task_collaborations FOR SELECT
    USING (auth.uid() = student_1_id OR auth.uid() = student_2_id);

CREATE POLICY "Users can create collaborations"
    ON task_collaborations FOR INSERT
    WITH CHECK (auth.uid() = student_1_id OR auth.uid() = student_2_id);

CREATE POLICY "Users can update their own collaborations"
    ON task_collaborations FOR UPDATE
    USING (auth.uid() = student_1_id OR auth.uid() = student_2_id);

-- RLS Policies for quest_personalization_sessions
CREATE POLICY "Users can view their own sessions"
    ON quest_personalization_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sessions"
    ON quest_personalization_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
    ON quest_personalization_sessions FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for ai_task_cache (read-only for users, write for service)
CREATE POLICY "Users can view cached tasks"
    ON ai_task_cache FOR SELECT
    USING (true);

-- Comment tables for documentation
COMMENT ON TABLE user_quest_tasks IS 'Stores user-specific personalized tasks generated through AI or created manually';
COMMENT ON TABLE task_collaborations IS 'Manages task-level collaboration between students for double XP';
COMMENT ON TABLE quest_personalization_sessions IS 'Tracks the AI personalization workflow for each user-quest combination';
COMMENT ON TABLE ai_task_cache IS 'Caches AI-generated tasks based on interests and subjects for performance';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Part 1 Complete: New tables created successfully';
END $$;
