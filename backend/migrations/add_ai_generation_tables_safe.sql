-- AI Quest Generation Tables (Safe Version - Checks for Existence)
-- These tables support the AI-powered quest generation system

-- Table to track AI generation jobs
CREATE TABLE IF NOT EXISTS ai_generation_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    parameters JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    generated_count INTEGER DEFAULT 0,
    approved_count INTEGER DEFAULT 0,
    rejected_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Index for job status queries
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_status ON ai_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_created_at ON ai_generation_jobs(created_at DESC);

-- Table to store AI-generated quests pending review
CREATE TABLE IF NOT EXISTS ai_generated_quests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    generation_job_id UUID REFERENCES ai_generation_jobs(id) ON DELETE CASCADE,
    quest_data JSONB NOT NULL,
    quality_score DECIMAL(5,2) CHECK (quality_score >= 0 AND quality_score <= 100),
    review_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'modified', 'published')),
    review_notes TEXT,
    reviewer_id UUID REFERENCES auth.users(id),
    published_quest_id UUID REFERENCES quests(id),
    duplicate_of_quest_id UUID REFERENCES quests(id),
    
    -- Quality metrics stored as JSONB
    quality_metrics JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_generated_quests_job_id ON ai_generated_quests(generation_job_id);
CREATE INDEX IF NOT EXISTS idx_ai_generated_quests_review_status ON ai_generated_quests(review_status);
CREATE INDEX IF NOT EXISTS idx_ai_generated_quests_quality_score ON ai_generated_quests(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generated_quests_created_at ON ai_generated_quests(created_at DESC);

-- Table to track prompt templates and their performance
CREATE TABLE IF NOT EXISTS ai_prompt_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    prompt_template TEXT NOT NULL,
    skill_category VARCHAR(100),
    difficulty_level VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    performance_metrics JSONB DEFAULT '{}',
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2),
    average_quality_score DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for active templates
CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_active ON ai_prompt_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_category ON ai_prompt_templates(skill_category);

-- Table to track quality review history
CREATE TABLE IF NOT EXISTS ai_quest_review_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    generated_quest_id UUID REFERENCES ai_generated_quests(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES auth.users(id),
    action VARCHAR(50) NOT NULL CHECK (action IN ('approve', 'reject', 'modify', 'request_changes')),
    previous_data JSONB,
    updated_data JSONB,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for review history queries
CREATE INDEX IF NOT EXISTS idx_ai_quest_review_history_quest_id ON ai_quest_review_history(generated_quest_id);
CREATE INDEX IF NOT EXISTS idx_ai_quest_review_history_reviewer_id ON ai_quest_review_history(reviewer_id);

-- Enable the pg_trgm extension for fuzzy text matching (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable RLS
ALTER TABLE ai_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generated_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_quest_review_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Admins can view all generation jobs" ON ai_generation_jobs;
CREATE POLICY "Admins can view all generation jobs" ON ai_generation_jobs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can create generation jobs" ON ai_generation_jobs;
CREATE POLICY "Admins can create generation jobs" ON ai_generation_jobs
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can update generation jobs" ON ai_generation_jobs;
CREATE POLICY "Admins can update generation jobs" ON ai_generation_jobs
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Policies for ai_generated_quests (admin only)
DROP POLICY IF EXISTS "Admins can view all generated quests" ON ai_generated_quests;
CREATE POLICY "Admins can view all generated quests" ON ai_generated_quests
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can manage generated quests" ON ai_generated_quests;
CREATE POLICY "Admins can manage generated quests" ON ai_generated_quests
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Policies for ai_prompt_templates (admin read/write)
DROP POLICY IF EXISTS "Admins can manage prompt templates" ON ai_prompt_templates;
CREATE POLICY "Admins can manage prompt templates" ON ai_prompt_templates
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Policies for ai_quest_review_history (admin only)
DROP POLICY IF EXISTS "Admins can view review history" ON ai_quest_review_history;
CREATE POLICY "Admins can view review history" ON ai_quest_review_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can create review history" ON ai_quest_review_history;
CREATE POLICY "Admins can create review history" ON ai_quest_review_history
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Add indexes for text search on existing quests table (for duplicate detection)
CREATE INDEX IF NOT EXISTS idx_quests_title_trgm ON quests USING gin(title gin_trgm_ops);

-- Grant appropriate permissions
GRANT SELECT ON ai_generation_analytics TO authenticated;
