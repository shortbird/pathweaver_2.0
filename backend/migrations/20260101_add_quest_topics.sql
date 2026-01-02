-- Migration: Add topic fields to quests table
-- Purpose: Enable topic-based quest discovery with AI-generated topics

-- Add topics array column (stores specific topics like "Music", "3D Printing", etc.)
ALTER TABLE quests ADD COLUMN IF NOT EXISTS topics TEXT[] DEFAULT '{}';

-- Add primary topic column (the main category for map clustering)
ALTER TABLE quests ADD COLUMN IF NOT EXISTS topic_primary VARCHAR(50);

-- Create index for topic filtering
CREATE INDEX IF NOT EXISTS idx_quests_topic_primary ON quests(topic_primary);
CREATE INDEX IF NOT EXISTS idx_quests_topics ON quests USING GIN(topics);

-- Add comment for documentation
COMMENT ON COLUMN quests.topics IS 'Array of topic tags (e.g., Music, 3D Printing, Gardening)';
COMMENT ON COLUMN quests.topic_primary IS 'Primary topic category for map clustering (e.g., Creative, Science, Building)';
