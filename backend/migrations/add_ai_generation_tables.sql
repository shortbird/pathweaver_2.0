-- AI Quest Generation Tables
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
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Parameters stored in JSONB will include:
    -- count: number of quests to generate
    -- distribution: how to distribute across categories
    -- skill_categories: specific categories to focus on
    -- difficulty_levels: distribution of difficulties
    -- themes: optional themes or topics
    -- min_hours/max_hours: time commitment range
);

-- Index for job status queries
CREATE INDEX idx_ai_generation_jobs_status ON ai_generation_jobs(status);
CREATE INDEX idx_ai_generation_jobs_created_at ON ai_generation_jobs(created_at DESC);

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
    published_at TIMESTAMP WITH TIME ZONE,
    
    -- quest_data JSONB will contain:
    -- title, description, skill_category, difficulty_level, 
    -- estimated_hours, xp_reward, prerequisites, learning_objectives,
    -- instructions, completion_criteria, resources, tags, subject
);

-- Indexes for efficient querying
CREATE INDEX idx_ai_generated_quests_job_id ON ai_generated_quests(generation_job_id);
CREATE INDEX idx_ai_generated_quests_review_status ON ai_generated_quests(review_status);
CREATE INDEX idx_ai_generated_quests_quality_score ON ai_generated_quests(quality_score DESC);
CREATE INDEX idx_ai_generated_quests_created_at ON ai_generated_quests(created_at DESC);

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
CREATE INDEX idx_ai_prompt_templates_active ON ai_prompt_templates(is_active);
CREATE INDEX idx_ai_prompt_templates_category ON ai_prompt_templates(skill_category);

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
CREATE INDEX idx_ai_quest_review_history_quest_id ON ai_quest_review_history(generated_quest_id);
CREATE INDEX idx_ai_quest_review_history_reviewer_id ON ai_quest_review_history(reviewer_id);

-- Function to calculate quality score for generated quests
CREATE OR REPLACE FUNCTION calculate_quest_quality_score(quest_data JSONB)
RETURNS DECIMAL AS $$
DECLARE
    score DECIMAL := 0;
    clarity_score DECIMAL := 0;
    educational_score DECIMAL := 0;
    engagement_score DECIMAL := 0;
    difficulty_alignment_score DECIMAL := 0;
    completion_criteria_score DECIMAL := 0;
BEGIN
    -- Clarity of instructions (25%)
    IF quest_data->>'instructions' IS NOT NULL AND length(quest_data->>'instructions') > 100 THEN
        clarity_score := 25;
    ELSIF quest_data->>'instructions' IS NOT NULL AND length(quest_data->>'instructions') > 50 THEN
        clarity_score := 15;
    ELSE
        clarity_score := 5;
    END IF;
    
    -- Educational value (25%)
    IF quest_data->'learning_objectives' IS NOT NULL AND jsonb_array_length(quest_data->'learning_objectives') > 0 THEN
        educational_score := 25;
    ELSIF quest_data->>'description' IS NOT NULL AND length(quest_data->>'description') > 100 THEN
        educational_score := 15;
    ELSE
        educational_score := 5;
    END IF;
    
    -- Engagement potential (20%)
    IF quest_data->>'title' IS NOT NULL AND length(quest_data->>'title') > 10 THEN
        engagement_score := 20;
    ELSE
        engagement_score := 10;
    END IF;
    
    -- Difficulty alignment (15%)
    IF quest_data->>'difficulty_level' IS NOT NULL AND quest_data->>'estimated_hours' IS NOT NULL THEN
        difficulty_alignment_score := 15;
    ELSE
        difficulty_alignment_score := 7;
    END IF;
    
    -- Completion criteria clarity (15%)
    IF quest_data->>'completion_criteria' IS NOT NULL AND length(quest_data->>'completion_criteria') > 50 THEN
        completion_criteria_score := 15;
    ELSE
        completion_criteria_score := 7;
    END IF;
    
    -- Calculate total score
    score := clarity_score + educational_score + engagement_score + difficulty_alignment_score + completion_criteria_score;
    
    RETURN score;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically calculate quality score when a quest is generated
CREATE OR REPLACE FUNCTION update_quest_quality_score()
RETURNS TRIGGER AS $$
BEGIN
    NEW.quality_score := calculate_quest_quality_score(NEW.quest_data);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_quality_score_trigger
    BEFORE INSERT OR UPDATE ON ai_generated_quests
    FOR EACH ROW
    EXECUTE FUNCTION update_quest_quality_score();

-- Function to check for duplicate quests
CREATE OR REPLACE FUNCTION check_quest_duplicate(new_title TEXT, similarity_threshold DECIMAL DEFAULT 0.8)
RETURNS UUID AS $$
DECLARE
    existing_quest_id UUID;
BEGIN
    -- Simple title similarity check (can be enhanced with fuzzy matching)
    SELECT id INTO existing_quest_id
    FROM quests
    WHERE similarity(title, new_title) > similarity_threshold
    ORDER BY similarity(title, new_title) DESC
    LIMIT 1;
    
    RETURN existing_quest_id;
END;
$$ LANGUAGE plpgsql;

-- Enable the pg_trgm extension for fuzzy text matching (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- RLS Policies for the new tables

-- Enable RLS
ALTER TABLE ai_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generated_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_quest_review_history ENABLE ROW LEVEL SECURITY;

-- Policies for ai_generation_jobs (admin only)
CREATE POLICY "Admins can view all generation jobs" ON ai_generation_jobs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can create generation jobs" ON ai_generation_jobs
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can update generation jobs" ON ai_generation_jobs
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Policies for ai_generated_quests (admin only)
CREATE POLICY "Admins can view all generated quests" ON ai_generated_quests
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can manage generated quests" ON ai_generated_quests
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Policies for ai_prompt_templates (admin read/write)
CREATE POLICY "Admins can manage prompt templates" ON ai_prompt_templates
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Policies for ai_quest_review_history (admin only)
CREATE POLICY "Admins can view review history" ON ai_quest_review_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can create review history" ON ai_quest_review_history
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Add indexes for text search on existing quests table (for duplicate detection)
CREATE INDEX IF NOT EXISTS idx_quests_title_trgm ON quests USING gin(title gin_trgm_ops);

-- Add a view for quest generation analytics
CREATE OR REPLACE VIEW ai_generation_analytics AS
SELECT 
    DATE(created_at) as generation_date,
    COUNT(*) as total_jobs,
    SUM(generated_count) as total_generated,
    SUM(approved_count) as total_approved,
    SUM(rejected_count) as total_rejected,
    AVG(CASE WHEN approved_count + rejected_count > 0 
        THEN approved_count::DECIMAL / (approved_count + rejected_count) * 100 
        ELSE NULL END) as approval_rate,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/60) as avg_processing_time_minutes
FROM ai_generation_jobs
WHERE status = 'completed'
GROUP BY DATE(created_at)
ORDER BY generation_date DESC;

-- Grant appropriate permissions
GRANT SELECT ON ai_generation_analytics TO authenticated;