-- Cleanup Duplicate Functions with Specific Signatures
-- First, let's check what functions exist

-- Query to see all function signatures (run this first to see what we have):
/*
SELECT 
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN (
    'add_default_quest_xp',
    'calculate_quest_quality_score',
    'check_quest_duplicate',
    'generate_portfolio_slug'
)
ORDER BY p.proname;
*/

-- Drop functions with specific signatures
-- For add_default_quest_xp
DO $$ 
BEGIN
    -- Try dropping different possible signatures
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'add_default_quest_xp') THEN
        EXECUTE 'DROP FUNCTION IF EXISTS public.add_default_quest_xp() CASCADE';
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- For calculate_quest_quality_score
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'calculate_quest_quality_score') THEN
        EXECUTE 'DROP FUNCTION IF EXISTS public.calculate_quest_quality_score(uuid) CASCADE';
        EXECUTE 'DROP FUNCTION IF EXISTS public.calculate_quest_quality_score() CASCADE';
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- For check_quest_duplicate
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_quest_duplicate') THEN
        EXECUTE 'DROP FUNCTION IF EXISTS public.check_quest_duplicate(text) CASCADE';
        EXECUTE 'DROP FUNCTION IF EXISTS public.check_quest_duplicate(text, uuid) CASCADE';
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- For generate_portfolio_slug
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'generate_portfolio_slug') THEN
        EXECUTE 'DROP FUNCTION IF EXISTS public.generate_portfolio_slug() CASCADE';
        EXECUTE 'DROP FUNCTION IF EXISTS public.generate_portfolio_slug(uuid) CASCADE';
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Alternative approach: Drop ALL overloads using a loop
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Drop all versions of these functions
    FOR func_record IN 
        SELECT 'DROP FUNCTION IF EXISTS ' || n.nspname || '.' || p.proname || '(' || 
               pg_get_function_identity_arguments(p.oid) || ') CASCADE' AS drop_cmd
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname IN (
            'add_default_quest_xp',
            'calculate_quest_quality_score', 
            'check_quest_duplicate',
            'generate_portfolio_slug'
        )
    LOOP
        EXECUTE func_record.drop_cmd;
    END LOOP;
END $$;

-- Now recreate the functions with proper search_path

-- add_default_quest_xp - trigger function
CREATE FUNCTION public.add_default_quest_xp()
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

-- calculate_quest_quality_score - with UUID parameter
CREATE FUNCTION public.calculate_quest_quality_score(p_quest_id UUID)
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

-- check_quest_duplicate - with two parameters
CREATE FUNCTION public.check_quest_duplicate(p_title TEXT, p_exclude_id UUID DEFAULT NULL)
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

-- generate_portfolio_slug - trigger function
CREATE FUNCTION public.generate_portfolio_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    -- Generate slug from user data
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
    
    -- Ensure uniqueness
    WHILE EXISTS(SELECT 1 FROM public.diplomas WHERE portfolio_slug = final_slug AND user_id != NEW.id) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;
    
    -- Insert or update diploma
    INSERT INTO public.diplomas (user_id, portfolio_slug, is_public)
    VALUES (NEW.id, final_slug, true)
    ON CONFLICT (user_id) 
    DO UPDATE SET portfolio_slug = EXCLUDED.portfolio_slug
    WHERE public.diplomas.portfolio_slug IS NULL;
    
    RETURN NEW;
END;
$$;

-- Recreate triggers if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'add_default_xp_trigger'
    ) THEN
        CREATE TRIGGER add_default_xp_trigger
            BEFORE INSERT ON public.quest_tasks
            FOR EACH ROW
            EXECUTE FUNCTION public.add_default_quest_xp();
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'generate_slug_trigger'
    ) THEN
        CREATE TRIGGER generate_slug_trigger
            AFTER INSERT OR UPDATE OF first_name, last_name, display_name ON public.users
            FOR EACH ROW
            EXECUTE FUNCTION public.generate_portfolio_slug();
    END IF;
END $$;

-- Final check
SELECT * FROM public.check_security_fixes();