-- Migration to 5-pillar system
-- This migration converts the old 6-category system to the new 5-pillar system
-- Old: reading_writing, thinking_skills, personal_growth, life_skills, making_creating, world_understanding
-- New: creativity, critical_thinking, practical_skills, communication, cultural_literacy

-- Step 1: Create new tables for the 5-pillar system if they don't exist
CREATE TABLE IF NOT EXISTS quest_skill_xp (
    id SERIAL PRIMARY KEY,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    skill_name VARCHAR(50) NOT NULL,
    xp_value INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(quest_id, skill_name)
);

CREATE TABLE IF NOT EXISTS user_skill_xp (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    skill_name VARCHAR(50) NOT NULL,
    total_xp INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, skill_name)
);

-- Step 2: Create mapping function for old categories to new pillars
CREATE OR REPLACE FUNCTION map_category_to_pillar(old_category TEXT) 
RETURNS TEXT AS $$
BEGIN
    CASE old_category
        WHEN 'reading_writing' THEN RETURN 'communication';
        WHEN 'thinking_skills' THEN RETURN 'critical_thinking';
        WHEN 'personal_growth' THEN RETURN 'practical_skills';
        WHEN 'life_skills' THEN RETURN 'practical_skills';
        WHEN 'making_creating' THEN RETURN 'creativity';
        WHEN 'world_understanding' THEN RETURN 'cultural_literacy';
        ELSE RETURN 'practical_skills'; -- Default fallback
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Migrate quest XP awards from old system to new system
INSERT INTO quest_skill_xp (quest_id, skill_name, xp_value)
SELECT 
    q.id as quest_id,
    map_category_to_pillar(qxa.subject_type) as skill_name,
    SUM(qxa.xp_amount) as xp_value
FROM quests q
INNER JOIN quest_xp_awards qxa ON q.id = qxa.quest_id
GROUP BY q.id, map_category_to_pillar(qxa.subject_type)
ON CONFLICT (quest_id, skill_name) 
DO UPDATE SET xp_value = quest_skill_xp.xp_value + EXCLUDED.xp_value;

-- Step 4: Migrate user XP from old system to new system
-- First, ensure we have all user completions tracked
INSERT INTO user_skill_xp (user_id, skill_name, total_xp)
SELECT 
    uq.user_id,
    map_category_to_pillar(qxa.subject_type) as skill_name,
    SUM(qxa.xp_amount) as total_xp
FROM user_quests uq
INNER JOIN quest_xp_awards qxa ON uq.quest_id = qxa.quest_id
WHERE uq.status = 'completed'
GROUP BY uq.user_id, map_category_to_pillar(qxa.subject_type)
ON CONFLICT (user_id, skill_name)
DO UPDATE SET total_xp = user_skill_xp.total_xp + EXCLUDED.total_xp;

-- Step 5: Add columns to quests table if they don't exist
ALTER TABLE quests 
ADD COLUMN IF NOT EXISTS primary_skill VARCHAR(50),
ADD COLUMN IF NOT EXISTS difficulty_level VARCHAR(20) DEFAULT 'beginner';

-- Step 6: Update quests with primary skill based on highest XP award
UPDATE quests q
SET primary_skill = (
    SELECT skill_name 
    FROM quest_skill_xp qsx
    WHERE qsx.quest_id = q.id
    ORDER BY xp_value DESC
    LIMIT 1
)
WHERE primary_skill IS NULL;

-- Step 7: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quest_skill_xp_quest_id ON quest_skill_xp(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_skill_xp_skill_name ON quest_skill_xp(skill_name);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_user_id ON user_skill_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_skill_name ON user_skill_xp(skill_name);

-- Step 8: Create view for user XP summary
CREATE OR REPLACE VIEW user_xp_summary AS
SELECT 
    u.id as user_id,
    u.email,
    u.display_name,
    COALESCE(usx_creativity.total_xp, 0) as creativity_xp,
    COALESCE(usx_critical.total_xp, 0) as critical_thinking_xp,
    COALESCE(usx_practical.total_xp, 0) as practical_skills_xp,
    COALESCE(usx_comm.total_xp, 0) as communication_xp,
    COALESCE(usx_cultural.total_xp, 0) as cultural_literacy_xp,
    (COALESCE(usx_creativity.total_xp, 0) + 
     COALESCE(usx_critical.total_xp, 0) + 
     COALESCE(usx_practical.total_xp, 0) + 
     COALESCE(usx_comm.total_xp, 0) + 
     COALESCE(usx_cultural.total_xp, 0)) as total_xp
FROM auth.users u
LEFT JOIN user_skill_xp usx_creativity ON u.id = usx_creativity.user_id AND usx_creativity.skill_name = 'creativity'
LEFT JOIN user_skill_xp usx_critical ON u.id = usx_critical.user_id AND usx_critical.skill_name = 'critical_thinking'
LEFT JOIN user_skill_xp usx_practical ON u.id = usx_practical.user_id AND usx_practical.skill_name = 'practical_skills'
LEFT JOIN user_skill_xp usx_comm ON u.id = usx_comm.user_id AND usx_comm.skill_name = 'communication'
LEFT JOIN user_skill_xp usx_cultural ON u.id = usx_cultural.user_id AND usx_cultural.skill_name = 'cultural_literacy';

-- Step 9: Clean up function
DROP FUNCTION IF EXISTS map_category_to_pillar(TEXT);

-- Migration complete!