-- Enable pgvector extension for semantic similarity searches
CREATE EXTENSION IF NOT EXISTS vector;

-- Create ai_seeds table to hold the master prompt for AI agents
CREATE TABLE ai_seeds (
    id SERIAL PRIMARY KEY,
    prompt_name TEXT NOT NULL UNIQUE DEFAULT 'primary_seed',
    prompt_text TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add a placeholder seed prompt
INSERT INTO ai_seeds (prompt_text) VALUES ('Initial seed prompt: Define AI persona, goals, and rules here...');

ALTER TABLE ai_seeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage AI seeds" ON ai_seeds
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Create quest_ideas table for user-submitted ideas
CREATE TABLE quest_ideas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_expansion', -- pending_expansion, expanded, failed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE quest_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own quest ideas" ON quest_ideas
    FOR ALL USING (auth.uid() = user_id);

-- Create quest_ratings table for user and admin feedback
CREATE TABLE quest_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(quest_id, user_id)
);

ALTER TABLE quest_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own quest ratings" ON quest_ratings
    FOR ALL USING (auth.uid() = user_id);

-- Modify quests table - add columns for AI workflow, ratings, and vector embeddings
ALTER TABLE quests ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE quests ADD COLUMN ai_grade_score NUMERIC(5, 2);
ALTER TABLE quests ADD COLUMN ai_grade_feedback TEXT;

-- Add columns for ratings
ALTER TABLE quests ADD COLUMN average_rating NUMERIC(3, 2) DEFAULT 0.00;

-- Add column for vector embedding (size 384 for 'all-MiniLM-L6-v2' model)
ALTER TABLE quests ADD COLUMN embedding vector(384);

-- Create an index for fast similarity searches
CREATE INDEX ON quests USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);

-- Modify submissions table - add columns for AI validation data
ALTER TABLE submissions ADD COLUMN ai_validation_score NUMERIC(5, 2);
ALTER TABLE submissions ADD COLUMN ai_validation_summary TEXT;