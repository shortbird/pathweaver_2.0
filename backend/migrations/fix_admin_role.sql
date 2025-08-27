-- Fix admin role for your account
-- Run this in Supabase SQL editor

-- First, let's see all users and their roles
SELECT 
    u.id,
    au.email,
    u.first_name,
    u.last_name,
    u.role,
    au.raw_user_meta_data->>'role' as meta_role
FROM users u
JOIN auth.users au ON u.id = au.id
ORDER BY au.created_at;

-- Update your account to admin role
-- Replace 'your-email@example.com' with your actual email
UPDATE users 
SET role = 'admin'
WHERE id IN (
    SELECT id FROM auth.users 
    WHERE email = 'tannerbowman@gmail.com'  -- CHANGE THIS TO YOUR EMAIL
);

-- Alternative: If you're the first user or have 'admin' in your email
UPDATE users 
SET role = 'admin'
WHERE id IN (
    SELECT id FROM auth.users 
    ORDER BY created_at 
    LIMIT 1  -- Makes the first user an admin
);

-- Or if your email contains 'admin' or you know it contains specific text
-- UPDATE users 
-- SET role = 'admin'
-- WHERE id IN (
--     SELECT id FROM auth.users 
--     WHERE email LIKE '%tanner%'  -- Uncomment and modify if needed
-- );

-- Verify the update
SELECT 
    u.id,
    au.email,
    u.first_name,
    u.last_name,
    u.role,
    u.display_name
FROM users u
JOIN auth.users au ON u.id = au.id
WHERE u.role = 'admin';