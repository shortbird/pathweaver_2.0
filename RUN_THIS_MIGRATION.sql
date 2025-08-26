-- Migration: Ensure all quests have XP awards
-- Run this in your Supabase SQL editor to fix the dashboard XP display

-- Function to add default XP awards to a quest
CREATE OR REPLACE FUNCTION add_default_quest_xp(p_quest_id UUID)
RETURNS void AS $$
DECLARE
    quest_record RECORD;
    base_xp INTEGER := 100;
BEGIN
    -- Get quest details
    SELECT * INTO quest_record FROM quests WHERE id = p_quest_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Check if quest already has skill XP awards
    IF EXISTS (SELECT 1 FROM quest_skill_xp WHERE quest_skill_xp.quest_id = p_quest_id) THEN
        RETURN;
    END IF;
    
    -- Calculate base XP based on difficulty
    IF quest_record.difficulty_level = 'beginner' THEN
        base_xp := 50;
    ELSIF quest_record.difficulty_level = 'intermediate' THEN
        base_xp := 100;
    ELSIF quest_record.difficulty_level = 'advanced' THEN
        base_xp := 200;
    END IF;
    
    -- Adjust for effort level
    IF quest_record.effort_level = 'light' THEN
        base_xp := base_xp * 0.8;
    ELSIF quest_record.effort_level = 'intensive' THEN
        base_xp := base_xp * 1.5;
    END IF;
    
    -- Add XP awards to 2 default categories
    INSERT INTO quest_skill_xp (quest_id, skill_category, xp_amount)
    VALUES 
        (p_quest_id, 'thinking_skills', base_xp / 2),
        (p_quest_id, 'personal_growth', base_xp / 2)
    ON CONFLICT (quest_id, skill_category) DO NOTHING;
    
END;
$$ LANGUAGE plpgsql;

-- Add default XP to all quests that don't have any
DO $$
DECLARE
    quest_record RECORD;
BEGIN
    FOR quest_record IN SELECT id FROM quests
    LOOP
        PERFORM add_default_quest_xp(quest_record.id);
    END LOOP;
END $$;

-- Function to recalculate user XP from completed quests
CREATE OR REPLACE FUNCTION recalculate_user_skill_xp(p_user_id UUID)
RETURNS void AS $$
DECLARE
    quest_record RECORD;
    award_record RECORD;
BEGIN
    -- Reset all skill XP for the user
    UPDATE user_skill_xp 
    SET total_xp = 0, last_updated = NOW()
    WHERE user_id = p_user_id;
    
    -- Ensure all skill categories exist for user
    INSERT INTO user_skill_xp (user_id, skill_category, total_xp)
    VALUES 
        (p_user_id, 'reading_writing', 0),
        (p_user_id, 'thinking_skills', 0),
        (p_user_id, 'personal_growth', 0),
        (p_user_id, 'life_skills', 0),
        (p_user_id, 'making_creating', 0),
        (p_user_id, 'world_understanding', 0)
    ON CONFLICT (user_id, skill_category) DO NOTHING;
    
    -- Sum up XP from all completed quests
    FOR quest_record IN 
        SELECT quest_id FROM user_quests 
        WHERE user_id = p_user_id AND status = 'completed'
    LOOP
        -- Get XP awards for this quest
        FOR award_record IN 
            SELECT * FROM quest_skill_xp WHERE quest_id = quest_record.quest_id
        LOOP
            -- Update user's skill XP
            UPDATE user_skill_xp 
            SET total_xp = total_xp + award_record.xp_amount,
                last_updated = NOW()
            WHERE user_id = p_user_id 
            AND skill_category = award_record.skill_category;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Recalculate XP for all users with completed quests
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN 
        SELECT DISTINCT user_id FROM user_quests WHERE status = 'completed'
    LOOP
        PERFORM recalculate_user_skill_xp(user_record.user_id);
    END LOOP;
END $$;

-- Verify the data was populated
SELECT 
    'quest_skill_xp' as table_name,
    COUNT(*) as record_count 
FROM quest_skill_xp
UNION ALL
SELECT 
    'user_skill_xp with XP > 0' as table_name,
    COUNT(*) as record_count 
FROM user_skill_xp 
WHERE total_xp > 0;