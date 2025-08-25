-- Migration: Remove username attribute (Safe version)
-- Description: Safely remove username from users table and update portfolio slug generation

-- 1. First check if username column exists and handle accordingly
DO $$
BEGIN
    -- Only proceed if username column exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'username'
    ) THEN
        -- Update existing portfolio slugs before removing username
        DECLARE
            user_record RECORD;
            new_slug TEXT;
        BEGIN
            FOR user_record IN 
                SELECT u.id, u.first_name, u.last_name, d.id as diploma_id 
                FROM users u 
                JOIN diplomas d ON d.user_id = u.id
            LOOP
                new_slug := lower(regexp_replace(user_record.first_name || user_record.last_name, '[^a-zA-Z0-9]', '', 'g'));
                
                -- Ensure uniqueness
                DECLARE
                    counter INTEGER := 1;
                    final_slug TEXT := new_slug;
                BEGIN
                    WHILE EXISTS (SELECT 1 FROM diplomas WHERE portfolio_slug = final_slug AND id != user_record.diploma_id) LOOP
                        final_slug := new_slug || counter::TEXT;
                        counter := counter + 1;
                    END LOOP;
                    
                    UPDATE diplomas SET portfolio_slug = final_slug WHERE id = user_record.diploma_id;
                END;
            END LOOP;
        END;
        
        -- Now drop the username column
        ALTER TABLE users DROP COLUMN username;
        
        RAISE NOTICE 'Username column has been removed successfully';
    ELSE
        RAISE NOTICE 'Username column does not exist, skipping removal';
    END IF;
END $$;

-- 2. Create or replace the generate_portfolio_slug function to use first and last name
CREATE OR REPLACE FUNCTION generate_portfolio_slug(first_name TEXT, last_name TEXT)
RETURNS TEXT AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    -- Create base slug from first and last name
    base_slug := lower(regexp_replace(COALESCE(first_name, '') || COALESCE(last_name, ''), '[^a-zA-Z0-9]', '', 'g'));
    
    -- Handle empty names
    IF base_slug = '' THEN
        base_slug := 'user';
    END IF;
    
    final_slug := base_slug;
    
    -- Check for uniqueness and add counter if needed
    WHILE EXISTS (SELECT 1 FROM diplomas WHERE portfolio_slug = final_slug) LOOP
        counter := counter + 1;
        final_slug := base_slug || counter::TEXT;
    END LOOP;
    
    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- 3. Update the initialize_user_skills trigger function
CREATE OR REPLACE FUNCTION initialize_user_skills()
RETURNS TRIGGER AS $$
BEGIN
    -- Create diploma for new user using first and last name
    INSERT INTO diplomas (user_id, portfolio_slug)
    VALUES (NEW.id, generate_portfolio_slug(NEW.first_name, NEW.last_name))
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Initialize all skill categories with 0 XP
    INSERT INTO user_skill_xp (user_id, skill_category, total_xp)
    VALUES 
        (NEW.id, 'reading_writing', 0),
        (NEW.id, 'thinking_skills', 0),
        (NEW.id, 'personal_growth', 0),
        (NEW.id, 'life_skills', 0),
        (NEW.id, 'making_creating', 0),
        (NEW.id, 'world_understanding', 0)
    ON CONFLICT (user_id, skill_category) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Ensure the trigger exists
DROP TRIGGER IF EXISTS on_user_created ON users;
CREATE TRIGGER on_user_created
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION initialize_user_skills();