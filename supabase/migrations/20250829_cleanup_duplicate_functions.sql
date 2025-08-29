-- Cleanup Duplicate Function Overloads
-- Some functions have multiple versions with different signatures

-- First, let's identify and drop ALL versions of functions that appear to have duplicates
-- Using CASCADE to handle dependencies

-- Drop ALL versions of add_default_quest_xp
DROP FUNCTION IF EXISTS public.add_default_quest_xp CASCADE;
DROP FUNCTION IF EXISTS public.add_default_quest_xp() CASCADE;

-- Drop ALL versions of calculate_quest_quality_score
DROP FUNCTION IF EXISTS public.calculate_quest_quality_score CASCADE;
DROP FUNCTION IF EXISTS public.calculate_quest_quality_score() CASCADE;
DROP FUNCTION IF EXISTS public.calculate_quest_quality_score(UUID) CASCADE;

-- Drop ALL versions of check_quest_duplicate
DROP FUNCTION IF EXISTS public.check_quest_duplicate CASCADE;
DROP FUNCTION IF EXISTS public.check_quest_duplicate(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.check_quest_duplicate(TEXT, UUID) CASCADE;

-- Drop ALL versions of generate_portfolio_slug
DROP FUNCTION IF EXISTS public.generate_portfolio_slug CASCADE;
DROP FUNCTION IF EXISTS public.generate_portfolio_slug() CASCADE;
DROP FUNCTION IF EXISTS public.generate_portfolio_slug(UUID) CASCADE;

-- Now recreate ONLY the versions we need with proper search_path

-- add_default_quest_xp - trigger function (no parameters)
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

-- calculate_quest_quality_score - callable function with parameter
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

-- check_quest_duplicate - callable function with parameters
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

-- generate_portfolio_slug - trigger function (no parameters)
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

-- Recreate any triggers that were dropped
CREATE TRIGGER add_default_xp_trigger
    BEFORE INSERT ON public.quest_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.add_default_quest_xp();

CREATE TRIGGER generate_slug_trigger
    AFTER INSERT OR UPDATE OF first_name, last_name, display_name ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_portfolio_slug();

-- Now check again
SELECT * FROM public.check_security_fixes();