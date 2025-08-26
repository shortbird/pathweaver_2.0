-- Add missing columns for AI-generated quests
-- These columns are referenced by the AI generation service

-- Add difficulty column if it doesn't exist
ALTER TABLE quests 
ADD COLUMN IF NOT EXISTS difficulty TEXT CHECK (difficulty IN ('Beginner', 'Intermediate', 'Advanced'));

-- Add estimated_time column if it doesn't exist  
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS estimated_time INTEGER; -- Time in minutes

-- Add requirements column if it doesn't exist
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS requirements TEXT[]; -- Array of requirements

-- Add learning_outcomes column if it doesn't exist
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS learning_outcomes TEXT[]; -- Array of learning outcomes

-- Add resources column if it doesn't exist
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS resources TEXT[]; -- Array of resources

-- Add xp_reward column if it doesn't exist
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS xp_reward INTEGER DEFAULT 100;

-- Add ai_grade_score column if it doesn't exist
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS ai_grade_score INTEGER;

-- Add ai_grade_feedback column if it doesn't exist  
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS ai_grade_feedback TEXT;

-- Add average_rating column if it doesn't exist
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2) DEFAULT 0;

-- Add index on status for better query performance
CREATE INDEX IF NOT EXISTS idx_quests_status ON quests(status);

-- Add index on pillar for better query performance
CREATE INDEX IF NOT EXISTS idx_quests_pillar ON quests(pillar);