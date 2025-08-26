-- Fix AI Quest Generation Tables
-- This script handles existing views and partial migrations

-- First, drop the view if it exists (it's blocking table creation)
DROP VIEW IF EXISTS ai_generation_analytics CASCADE;

-- Now create all tables safely
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

-- Create a simple analytics view instead of a table
-- This avoids the need for a separate analytics table
CREATE OR REPLACE VIEW ai_generation_analytics AS
SELECT 
    j.id as job_id,
    j.created_at::DATE as metric_date,
    j.generated_count as total_generated,
    j.approved_count as total_approved,
    j.rejected_count as total_rejected,
    COALESCE((
        SELECT AVG(quality_score) 
        FROM ai_generated_quests 
        WHERE generation_job_id = j.id
    ), 0) as avg_quality_score,
    j.created_at
FROM ai_generation_jobs j;

-- Verify tables were created
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_generation_jobs') THEN
        RAISE NOTICE '✅ Table ai_generation_jobs exists';
    ELSE
        RAISE WARNING '❌ Table ai_generation_jobs does NOT exist';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_generated_quests') THEN
        RAISE NOTICE '✅ Table ai_generated_quests exists';
    ELSE
        RAISE WARNING '❌ Table ai_generated_quests does NOT exist';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_quest_review_history') THEN
        RAISE NOTICE '✅ Table ai_quest_review_history exists';
    ELSE
        RAISE WARNING '❌ Table ai_quest_review_history does NOT exist';
    END IF;
END $$;