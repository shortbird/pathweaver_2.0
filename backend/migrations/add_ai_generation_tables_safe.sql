-- AI Quest Generation Tables (Safe version - checks for existence)
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

-- Indexes (only create if they don't exist)
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
    quality_metrics JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for ai_generated_quests
CREATE INDEX IF NOT EXISTS idx_ai_generated_quests_job_id ON ai_generated_quests(generation_job_id);
CREATE INDEX IF NOT EXISTS idx_ai_generated_quests_review_status ON ai_generated_quests(review_status);
CREATE INDEX IF NOT EXISTS idx_ai_generated_quests_quality_score ON ai_generated_quests(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generated_quests_created_at ON ai_generated_quests(created_at DESC);

-- Table to track review history
CREATE TABLE IF NOT EXISTS ai_quest_review_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    generated_quest_id UUID REFERENCES ai_generated_quests(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES auth.users(id),
    action VARCHAR(50) NOT NULL CHECK (action IN ('approve', 'reject', 'modify')),
    previous_data JSONB,
    updated_data JSONB,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for review history
CREATE INDEX IF NOT EXISTS idx_ai_quest_review_history_generated_quest_id ON ai_quest_review_history(generated_quest_id);
CREATE INDEX IF NOT EXISTS idx_ai_quest_review_history_reviewer_id ON ai_quest_review_history(reviewer_id);

-- Table for generation analytics
CREATE TABLE IF NOT EXISTS ai_generation_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID REFERENCES ai_generation_jobs(id),
    metric_date DATE DEFAULT CURRENT_DATE,
    total_generated INTEGER DEFAULT 0,
    total_approved INTEGER DEFAULT 0,
    total_rejected INTEGER DEFAULT 0,
    avg_quality_score DECIMAL(5,2),
    category_distribution JSONB DEFAULT '{}',
    difficulty_distribution JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_ai_generation_analytics_metric_date ON ai_generation_analytics(metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generation_analytics_job_id ON ai_generation_analytics(job_id);