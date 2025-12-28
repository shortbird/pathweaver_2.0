-- ============================================
-- MIGRATION 022: Organization Analytics Function
-- ============================================
-- Efficient SQL function for organization analytics
-- Run Date: 2025-12-27
-- ============================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_organization_analytics(UUID);

CREATE OR REPLACE FUNCTION get_organization_analytics(p_org_id UUID)
RETURNS TABLE (
    total_users BIGINT,
    total_completions BIGINT,
    total_xp BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM public.users u WHERE u.organization_id = p_org_id)::BIGINT,
        (SELECT COUNT(*) FROM public.quest_task_completions qtc
         JOIN public.users u ON qtc.user_id = u.id
         WHERE u.organization_id = p_org_id)::BIGINT,
        -- XP is stored in user_skill_xp table, not users.total_xp
        COALESCE((
            SELECT SUM(COALESCE(sx.xp_amount, 0))
            FROM public.user_skill_xp sx
            JOIN public.users u ON sx.user_id = u.id
            WHERE u.organization_id = p_org_id
        ), 0)::BIGINT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_organization_analytics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_organization_analytics(UUID) TO service_role;
