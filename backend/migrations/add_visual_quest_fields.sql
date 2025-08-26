-- Add Visual/Diploma Pillars format fields to quests table
-- These fields support the new quest display format

-- Add text/varchar fields
ALTER TABLE quests ADD COLUMN IF NOT EXISTS big_idea TEXT;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS primary_pillar VARCHAR(50);
ALTER TABLE quests ADD COLUMN IF NOT EXISTS primary_pillar_icon VARCHAR(10);
ALTER TABLE quests ADD COLUMN IF NOT EXISTS intensity VARCHAR(20);
ALTER TABLE quests ADD COLUMN IF NOT EXISTS estimated_time VARCHAR(100);
ALTER TABLE quests ADD COLUMN IF NOT EXISTS showcase_your_journey TEXT;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS collaboration_spark TEXT;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS collaboration_bonus VARCHAR(255) DEFAULT '2x XP when working with others';
ALTER TABLE quests ADD COLUMN IF NOT EXISTS heads_up TEXT;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE quests ADD COLUMN IF NOT EXISTS quest_banner_image TEXT;

-- Add JSONB fields for structured data
ALTER TABLE quests ADD COLUMN IF NOT EXISTS what_youll_create JSONB DEFAULT '[]'::jsonb;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS your_mission JSONB DEFAULT '[]'::jsonb;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS helpful_resources JSONB DEFAULT '{"tools": [], "materials": [], "links": []}'::jsonb;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS core_competencies JSONB DEFAULT '[]'::jsonb;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS real_world_bonus JSONB DEFAULT '[]'::jsonb;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS log_bonus JSONB DEFAULT '{"description": "Keep a learning log", "prompt": "Document your journey", "xp_amount": 25}'::jsonb;

-- Add numeric field
ALTER TABLE quests ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0;

-- Add indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_quests_primary_pillar ON quests(primary_pillar);
CREATE INDEX IF NOT EXISTS idx_quests_intensity ON quests(intensity);

-- Update RLS policies if needed (keeping existing policies)
-- The existing policies should work fine with the new columns