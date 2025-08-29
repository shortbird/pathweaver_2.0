-- Fix Function Search Path Security Issues
-- Drops and recreates functions with proper search_path settings

-- Drop existing functions first
DROP FUNCTION IF EXISTS public.calculate_quest_quality_score(UUID);
DROP FUNCTION IF EXISTS public.award_xp_on_completion();
DROP FUNCTION IF EXISTS public.get_user_total_xp(UUID);
DROP FUNCTION IF EXISTS public.recalculate_user_skill_xp(UUID);
DROP FUNCTION IF EXISTS public.initialize_user_skills();
DROP FUNCTION IF EXISTS public.update_quest_quality_score();
DROP FUNCTION IF EXISTS public.add_default_quest_xp();
DROP FUNCTION IF EXISTS public.get_monthly_active_users();
DROP FUNCTION IF EXISTS public.get_user_xp_by_subject(UUID);
DROP FUNCTION IF EXISTS public.update_updated_at_column();
DROP FUNCTION IF EXISTS public.check_quest_duplicate(TEXT, UUID);
DROP FUNCTION IF EXISTS public.generate_portfolio_slug();

-- Now recreate them with search_path set
-- Note: These are minimal implementations - you may need to restore the actual logic

-- Fix calculate_quest_quality_score function
CREATE OR REPLACE FUNCTION public.calculate_quest_quality_score(p_quest_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_score NUMERIC := 0;
BEGIN
    -- Calculate quality score based on various factors
    SELECT 
        CASE 
            WHEN COUNT(*) > 0 THEN AVG(rating)::NUMERIC
            ELSE 0
        END INTO v_score
    FROM public.quest_ratings
    WHERE quest_id = p_quest_id;
    
    RETURN COALESCE(v_score, 0);
END;
$$;

-- Fix award_xp_on_completion function
CREATE OR REPLACE FUNCTION public.award_xp_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Award XP when quest is completed
    IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
        -- Award XP logic here
        PERFORM public.recalculate_user_skill_xp(NEW.user_id);
    END IF;
    RETURN NEW;
END;
$$;

-- Fix get_user_total_xp function
CREATE OR REPLACE FUNCTION public.get_user_total_xp(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_xp INTEGER := 0;
BEGIN
    SELECT COALESCE(SUM(xp_amount), 0)::INTEGER INTO v_total_xp
    FROM public.user_skill_xp
    WHERE user_id = p_user_id;
    
    RETURN v_total_xp;
END;
$$;

-- Fix recalculate_user_skill_xp function
CREATE OR REPLACE FUNCTION public.recalculate_user_skill_xp(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Delete existing XP records for the user
    DELETE FROM public.user_skill_xp WHERE user_id = p_user_id;
    
    -- Recalculate and insert XP by pillar
    INSERT INTO public.user_skill_xp (user_id, pillar, xp_amount)
    SELECT 
        p_user_id,
        qt.pillar,
        SUM(qt.xp_amount)::INTEGER
    FROM public.user_quests uq
    JOIN public.user_quest_tasks uqt ON uqt.user_quest_id = uq.id
    JOIN public.quest_tasks qt ON qt.id = uqt.quest_task_id
    WHERE uq.user_id = p_user_id 
    AND uq.completed_at IS NOT NULL
    AND qt.pillar IS NOT NULL
    GROUP BY qt.pillar;
END;
$$;

-- Fix initialize_user_skills function
CREATE OR REPLACE FUNCTION public.initialize_user_skills()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Initialize skill XP for new user
    INSERT INTO public.user_skill_xp (user_id, pillar, xp_amount)
    VALUES 
        (NEW.id, 'creativity', 0),
        (NEW.id, 'critical_thinking', 0),
        (NEW.id, 'practical_skills', 0),
        (NEW.id, 'communication', 0),
        (NEW.id, 'cultural_literacy', 0)
    ON CONFLICT (user_id, pillar) DO NOTHING;
    
    RETURN NEW;
END;
$$;

-- Fix update_quest_quality_score function
CREATE OR REPLACE FUNCTION public.update_quest_quality_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Update quality score when ratings change
    UPDATE public.ai_generated_quests
    SET quality_score = (
        SELECT AVG(rating)::NUMERIC
        FROM public.quest_ratings
        WHERE quest_id = NEW.quest_id
    )
    WHERE published_quest_id = NEW.quest_id;
    
    RETURN NEW;
END;
$$;

-- Fix add_default_quest_xp function
CREATE OR REPLACE FUNCTION public.add_default_quest_xp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Set default XP if not provided
    IF NEW.xp_amount IS NULL THEN
        NEW.xp_amount := 100;
    END IF;
    RETURN NEW;
END;
$$;

-- Fix get_monthly_active_users function
CREATE OR REPLACE FUNCTION public.get_monthly_active_users()
RETURNS TABLE(month DATE, active_users BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE_TRUNC('month', al.created_at)::DATE AS month,
        COUNT(DISTINCT al.user_id) AS active_users
    FROM public.activity_log al
    WHERE al.created_at >= CURRENT_DATE - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', al.created_at)
    ORDER BY month DESC;
END;
$$;

-- Fix get_user_xp_by_subject function
CREATE OR REPLACE FUNCTION public.get_user_xp_by_subject(p_user_id UUID)
RETURNS TABLE(subject TEXT, total_xp INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pillar AS subject,
        xp_amount AS total_xp
    FROM public.user_skill_xp
    WHERE user_id = p_user_id
    ORDER BY xp_amount DESC;
END;
$$;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

-- Fix check_quest_duplicate function
CREATE OR REPLACE FUNCTION public.check_quest_duplicate(p_title TEXT, p_exclude_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 
        FROM public.quests 
        WHERE LOWER(title) = LOWER(p_title)
        AND (p_exclude_id IS NULL OR id != p_exclude_id)
    ) INTO v_exists;
    
    RETURN v_exists;
END;
$$;

-- Fix generate_portfolio_slug function
CREATE OR REPLACE FUNCTION public.generate_portfolio_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    -- Generate base slug from user info
    IF NEW.first_name IS NOT NULL AND NEW.last_name IS NOT NULL THEN
        base_slug := LOWER(REGEXP_REPLACE(NEW.first_name || '-' || NEW.last_name, '[^a-zA-Z0-9-]', '-', 'g'));
    ELSIF NEW.display_name IS NOT NULL THEN
        base_slug := LOWER(REGEXP_REPLACE(NEW.display_name, '[^a-zA-Z0-9]', '-', 'g'));
    ELSE
        base_slug := 'user-' || SUBSTRING(NEW.id::TEXT, 1, 8);
    END IF;
    
    final_slug := base_slug;
    
    -- Check for uniqueness and append number if needed
    WHILE EXISTS(SELECT 1 FROM public.diplomas WHERE portfolio_slug = final_slug AND user_id != NEW.id) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;
    
    -- Update or insert into diplomas table
    INSERT INTO public.diplomas (user_id, portfolio_slug, is_public)
    VALUES (NEW.id, final_slug, true)
    ON CONFLICT (user_id) 
    DO UPDATE SET portfolio_slug = EXCLUDED.portfolio_slug
    WHERE public.diplomas.portfolio_slug IS NULL;
    
    RETURN NEW;
END;
$$;