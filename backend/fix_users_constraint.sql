-- Fix the users table foreign key constraint issue
-- The problem: users.id has a foreign key to itself or auth.users, creating a circular reference

-- First, check the current constraint
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='users';

-- Drop the problematic constraint if it exists
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey CASCADE;

-- The users.id should reference auth.users(id), not the other way around
-- Recreate the correct foreign key constraint
ALTER TABLE public.users 
ADD CONSTRAINT users_auth_id_fkey 
FOREIGN KEY (id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE;

-- Ensure the table has the correct structure
-- The users table should extend auth.users, not reference itself
COMMENT ON TABLE public.users IS 'Profile data for users, extends auth.users';
COMMENT ON COLUMN public.users.id IS 'References auth.users.id';

-- Verify the fix
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='users';