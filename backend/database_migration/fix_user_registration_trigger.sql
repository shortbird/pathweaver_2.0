-- Fix User Registration Flow
-- This script recreates the function and trigger needed for automatic user profile creation
-- Run this in Supabase SQL Editor for project vvfgxcykxjybtvpfzwyx

-- Drop existing function and trigger if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create or replace the function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert a new row in public.users when a new auth.users row is created
  INSERT INTO public.users (id, email, role)
  VALUES (new.id, new.email, 'student');
  
  -- Return the new row
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger that calls the function after a new user is inserted in auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Verify the function and trigger were created
SELECT 
  'Function created: ' || proname AS status
FROM pg_proc 
WHERE proname = 'handle_new_user'
UNION ALL
SELECT 
  'Trigger created: ' || tgname AS status  
FROM pg_trigger 
WHERE tgname = 'on_auth_user_created';