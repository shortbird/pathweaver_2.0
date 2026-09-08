-- File: migrations/005_update_users_roles.sql
-- Purpose: Add observer role to user roles constraint
-- Date: January 2025

-- Ensure role column exists with correct constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'student';
  END IF;
END $$;

-- Update role constraint to include observer
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('student', 'parent', 'admin', 'advisor', 'observer'));

-- Ensure all existing users have valid roles
UPDATE users
SET role = 'student'
WHERE role IS NULL OR role NOT IN ('student', 'parent', 'admin', 'advisor', 'observer');

-- Verify role distribution
SELECT role, COUNT(*) as count
FROM users
GROUP BY role
ORDER BY role;
