-- Fix Function Search Path Security Issues
-- Handles triggers and dependencies with CASCADE

-- Step 1: Drop triggers that depend on functions
DROP TRIGGER IF EXISTS calculate_quality_score_trigger ON public.ai_generated_quests;
DROP TRIGGER IF EXISTS award_xp_trigger ON public.user_quests;
DROP TRIGGER IF EXISTS update_site_settings_updated_at ON public.site_settings;
DROP TRIGGER IF EXISTS initialize_skills_trigger ON public.users;
DROP TRIGGER IF EXISTS add_default_xp_trigger ON public.quest_tasks;
DROP TRIGGER IF EXISTS generate_slug_trigger ON public.users;

-- Step 2: Drop existing functions with CASCADE to handle any other dependencies
DROP FUNCTION IF EXISTS public.calculate_quest_quality_score(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.award_xp_on_completion() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_total_xp(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_user_skill_xp(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.initialize_user_skills() CASCADE;
DROP FUNCTION IF EXISTS public.update_quest_quality_score() CASCADE;
DROP FUNCTION IF EXISTS public.add_default_quest_xp() CASCADE;
DROP FUNCTION IF EXISTS public.get_monthly_active_users() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_xp_by_subject(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.check_quest_duplicate(TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.generate_portfolio_slug() CASCADE;

-- Step 3: Recreate functions with proper search_path

-- calculate_quest_quality_score function
CREATE OR REPLACE FUNCTION public.calculate_quest_quality_score(p_quest_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_score NUMERIC := 0;
BEGIN
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

-- award_xp_on_completion function (trigger function)
CREATE OR REPLACE FUNCTION public.award_xp_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
        PERFORM public.recalculate_user_skill_xp(NEW.user_id);
    END IF;
    RETURN NEW;
END;
$$;

-- get_user_total_xp function
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

-- recalculate_user_skill_xp function
CREATE OR REPLACE FUNCTION public.recalculate_user_skill_xp(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.user_skill_xp WHERE user_id = p_user_id;
    
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
    GROUP BY qt.pillar
    ON CONFLICT (user_id, pillar) DO UPDATE
    SET xp_amount = EXCLUDED.xp_amount;
END;
$$;

-- initialize_user_skills function (trigger function)
CREATE OR REPLACE FUNCTION public.initialize_user_skills()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
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

-- update_quest_quality_score function (trigger function)
CREATE OR REPLACE FUNCTION public.update_quest_quality_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
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

-- add_default_quest_xp function (trigger function)
CREATE OR REPLACE FUNCTION public.add_default_quest_xp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.xp_amount IS NULL THEN
        NEW.xp_amount := 100;
    END IF;
    RETURN NEW;
END;
$$;

-- get_monthly_active_users function
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

-- get_user_xp_by_subject function
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

-- update_updated_at_column function (trigger function)
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

-- check_quest_duplicate function
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

-- generate_portfolio_slug function (trigger function)
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
    IF NEW.first_name IS NOT NULL AND NEW.last_name IS NOT NULL THEN
        base_slug := LOWER(REGEXP_REPLACE(NEW.first_name || '-' || NEW.last_name, '[^a-zA-Z0-9-]', '-', 'g'));
    ELSIF NEW.display_name IS NOT NULL THEN
        base_slug := LOWER(REGEXP_REPLACE(NEW.display_name, '[^a-zA-Z0-9]', '-', 'g'));
    ELSIF NEW.email IS NOT NULL THEN
        base_slug := LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-zA-Z0-9]', '-', 'g'));
    ELSE
        base_slug := 'user-' || SUBSTRING(NEW.id::TEXT, 1, 8);
    END IF;
    
    final_slug := base_slug;
    
    WHILE EXISTS(SELECT 1 FROM public.diplomas WHERE portfolio_slug = final_slug AND user_id != NEW.id) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;
    
    INSERT INTO public.diplomas (user_id, portfolio_slug, is_public)
    VALUES (NEW.id, final_slug, true)
    ON CONFLICT (user_id) 
    DO UPDATE SET portfolio_slug = EXCLUDED.portfolio_slug
    WHERE public.diplomas.portfolio_slug IS NULL;
    
    RETURN NEW;
END;
$$;

-- Step 4: Recreate necessary triggers

-- Trigger for updating quality scores
CREATE TRIGGER calculate_quality_score_trigger
    AFTER INSERT OR UPDATE ON public.quest_ratings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_quest_quality_score();

-- Trigger for awarding XP on quest completion
CREATE TRIGGER award_xp_trigger
    AFTER UPDATE ON public.user_quests
    FOR EACH ROW
    EXECUTE FUNCTION public.award_xp_on_completion();

-- Trigger for initializing user skills
CREATE TRIGGER initialize_skills_trigger
    AFTER INSERT ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.initialize_user_skills();

-- Trigger for adding default XP to quest tasks
CREATE TRIGGER add_default_xp_trigger
    BEFORE INSERT ON public.quest_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.add_default_quest_xp();

-- Trigger for generating portfolio slug
CREATE TRIGGER generate_slug_trigger
    AFTER INSERT OR UPDATE OF first_name, last_name, display_name ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_portfolio_slug();

-- Trigger for updating updated_at column on site_settings
CREATE TRIGGER update_site_settings_updated_at
    BEFORE UPDATE ON public.site_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Note: Add other update_updated_at triggers as needed for other tables

-- Step 5: Verify the fixes
SELECT * FROM public.check_security_fixes();