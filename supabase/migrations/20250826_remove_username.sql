-- Migration: Remove username attribute
-- Description: Remove username from users table and update portfolio slug generation to use first_name + last_name

-- 1. Update the generate_portfolio_slug function to use first and last name
CREATE OR REPLACE FUNCTION generate_portfolio_slug(first_name TEXT, last_name TEXT)
RETURNS TEXT AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    -- Create base slug from first and last name
    base_slug := lower(regexp_replace(first_name || last_name, '[^a-zA-Z0-9]', '', 'g'));
    final_slug := base_slug;
    
    -- Check for uniqueness and add counter if needed
    WHILE EXISTS (SELECT 1 FROM diplomas WHERE portfolio_slug = final_slug) LOOP
        counter := counter + 1;
        final_slug := base_slug || counter::TEXT;
    END LOOP;
    
    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- 2. Update the initialize_user_skills function to use first and last name
CREATE OR REPLACE FUNCTION initialize_user_skills()
RETURNS TRIGGER AS $$
BEGIN
    -- Create diploma for new user using first and last name
    INSERT INTO diplomas (user_id, portfolio_slug)
    VALUES (NEW.id, generate_portfolio_slug(NEW.first_name, NEW.last_name));
    
    -- Initialize all skill categories with 0 XP
    INSERT INTO user_skill_xp (user_id, skill_category, total_xp)
    VALUES 
        (NEW.id, 'reading_writing', 0),
        (NEW.id, 'thinking_skills', 0),
        (NEW.id, 'personal_growth', 0),
        (NEW.id, 'life_skills', 0),
        (NEW.id, 'making_creating', 0),
        (NEW.id, 'world_understanding', 0);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Update existing portfolio slugs to use first and last name
DO $$
DECLARE
    user_record RECORD;
    new_slug TEXT;
BEGIN
    FOR user_record IN 
        SELECT u.id, u.first_name, u.last_name, d.id as diploma_id 
        FROM users u 
        JOIN diplomas d ON d.user_id = u.id
    LOOP
        new_slug := generate_portfolio_slug(user_record.first_name, user_record.last_name);
        UPDATE diplomas SET portfolio_slug = new_slug WHERE id = user_record.diploma_id;
    END LOOP;
END $$;

-- 4. Drop the username column and its unique constraint
ALTER TABLE users DROP COLUMN IF EXISTS username;

-- 5. Update RLS policies that might reference username (none found in current schema)
-- No updates needed for RLS policies