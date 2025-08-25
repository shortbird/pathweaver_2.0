-- Migration: Ensure all quests have XP awards
-- Description: Add default XP awards to quests that don't have any

-- Function to add default XP awards to a quest
CREATE OR REPLACE FUNCTION add_default_quest_xp(p_quest_id UUID)
RETURNS void AS $$
DECLARE
    quest_record RECORD;
    base_xp INTEGER := 100;
    num_categories INTEGER;
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
    current_xp INTEGER;
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

-- Create trigger to automatically award XP when quest is marked complete
CREATE OR REPLACE FUNCTION award_xp_on_completion()
RETURNS TRIGGER AS $$
DECLARE
    award_record RECORD;
BEGIN
    -- Only process if status changed to completed
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- Award XP for each skill category
        FOR award_record IN 
            SELECT * FROM quest_skill_xp WHERE quest_id = NEW.quest_id
        LOOP
            -- Update or insert user's skill XP
            INSERT INTO user_skill_xp (user_id, skill_category, total_xp, last_updated)
            VALUES (NEW.user_id, award_record.skill_category, award_record.xp_amount, NOW())
            ON CONFLICT (user_id, skill_category) 
            DO UPDATE SET 
                total_xp = user_skill_xp.total_xp + award_record.xp_amount,
                last_updated = NOW();
        END LOOP;
        
        -- Update skill details for core skills
        FOR award_record IN 
            SELECT unnest(core_skills) as skill_name FROM quests WHERE id = NEW.quest_id
        LOOP
            IF award_record.skill_name IS NOT NULL THEN
                INSERT INTO user_skill_details (user_id, skill_name, times_practiced, last_practiced)
                VALUES (NEW.user_id, award_record.skill_name, 1, NOW())
                ON CONFLICT (user_id, skill_name)
                DO UPDATE SET 
                    times_practiced = user_skill_details.times_practiced + 1,
                    last_practiced = NOW();
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create or replace the trigger
DROP TRIGGER IF EXISTS award_xp_on_quest_completion ON user_quests;
CREATE TRIGGER award_xp_on_quest_completion
    AFTER UPDATE ON user_quests
    FOR EACH ROW
    EXECUTE FUNCTION award_xp_on_completion();