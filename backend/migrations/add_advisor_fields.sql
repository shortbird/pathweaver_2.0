-- Migration: Add advisor functionality fields
-- This migration adds fields needed for advisor features

-- Add advisor_id to users table (student-advisor relationship)
ALTER TABLE users ADD COLUMN IF NOT EXISTS advisor_id UUID REFERENCES users(id);

-- Add custom badge tracking fields to badges table
ALTER TABLE badges ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT FALSE;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Add assigned_by to user_badges table (track who assigned a badge)
ALTER TABLE user_badges ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id);

-- Add index for advisor queries
CREATE INDEX IF NOT EXISTS idx_users_advisor_id ON users(advisor_id);
CREATE INDEX IF NOT EXISTS idx_badges_created_by ON badges(created_by);
CREATE INDEX IF NOT EXISTS idx_user_badges_assigned_by ON user_badges(assigned_by);

-- Create view for advisor dashboard stats (optional, for performance)
CREATE OR REPLACE VIEW advisor_student_stats AS
SELECT
    u.advisor_id,
    COUNT(DISTINCT u.id) as total_students,
    COUNT(DISTINCT CASE WHEN u.last_active > NOW() - INTERVAL '7 days' THEN u.id END) as active_students,
    COUNT(DISTINCT ub.id) as total_badges_assigned,
    COUNT(DISTINCT CASE WHEN ub.earned = TRUE THEN ub.id END) as total_badges_earned
FROM users u
LEFT JOIN user_badges ub ON u.id = ub.user_id
WHERE u.advisor_id IS NOT NULL AND u.role = 'student'
GROUP BY u.advisor_id;

-- Add comment for documentation
COMMENT ON COLUMN users.advisor_id IS 'References the advisor (educator role) assigned to this student';
COMMENT ON COLUMN badges.is_custom IS 'True if this badge was created by an advisor, false for system badges';
COMMENT ON COLUMN badges.created_by IS 'References the user (advisor) who created this custom badge';
COMMENT ON COLUMN user_badges.assigned_by IS 'References the advisor who assigned this badge to the student';
