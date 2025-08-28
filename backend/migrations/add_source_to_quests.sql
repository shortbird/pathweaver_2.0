-- Add source field to quests table
ALTER TABLE quests 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'optio';

-- Add index for better query performance when filtering by source
CREATE INDEX IF NOT EXISTS idx_quests_source ON quests(source);

-- Update existing quests to have a default source if needed
UPDATE quests 
SET source = 'optio' 
WHERE source IS NULL;