-- Migration: Fix missing functions and procedures
-- Description: Add any missing RPC functions that the backend expects

-- Note: These functions are not strictly necessary anymore since we've updated
-- the backend to handle calculations directly, but they can be useful for 
-- performance optimization if needed.

-- Optional: Function to get user's total XP (across all categories)
CREATE OR REPLACE FUNCTION get_user_total_xp(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    total INTEGER := 0;
BEGIN
    -- Try skill-based XP first
    SELECT COALESCE(SUM(total_xp), 0) INTO total
    FROM user_skill_xp
    WHERE user_id = p_user_id;
    
    -- If no skill XP found, calculate from completed quests
    IF total = 0 THEN
        SELECT COALESCE(SUM(qxa.xp_amount), 0) INTO total
        FROM user_quests uq
        JOIN quest_xp_awards qxa ON qxa.quest_id = uq.quest_id
        WHERE uq.user_id = p_user_id AND uq.status = 'completed';
    END IF;
    
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Optional: Function to get monthly active users count
CREATE OR REPLACE FUNCTION get_monthly_active_users()
RETURNS INTEGER AS $$
DECLARE
    active_count INTEGER := 0;
BEGIN
    SELECT COUNT(DISTINCT user_id) INTO active_count
    FROM activity_log
    WHERE created_at >= NOW() - INTERVAL '30 days';
    
    RETURN active_count;
END;
$$ LANGUAGE plpgsql;

-- Optional: Function to get user XP by subject/category
CREATE OR REPLACE FUNCTION get_user_xp_by_subject(p_user_id UUID)
RETURNS TABLE(category TEXT, total_xp INTEGER) AS $$
BEGIN
    -- Try skill-based XP first
    RETURN QUERY
    SELECT skill_category::TEXT, total_xp::INTEGER
    FROM user_skill_xp
    WHERE user_id = p_user_id;
    
    -- If no results, try subject-based XP
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT 
            qxa.subject::TEXT as category,
            SUM(qxa.xp_amount)::INTEGER as total_xp
        FROM user_quests uq
        JOIN quest_xp_awards qxa ON qxa.quest_id = uq.quest_id
        WHERE uq.user_id = p_user_id AND uq.status = 'completed'
        GROUP BY qxa.subject;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_total_xp(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_active_users() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_xp_by_subject(UUID) TO authenticated;