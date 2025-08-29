-- Role-Based Access Control Migration
-- Run this script in Supabase SQL editor to set up role indexes and constraints

-- Step 1: Ensure all users have a role (default to 'student')
UPDATE users 
SET role = 'student' 
WHERE role IS NULL;

-- Step 2: Create index for better query performance on role field
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Step 3: Add check constraint to validate roles
-- First, update any invalid roles to 'student'
UPDATE users 
SET role = 'student' 
WHERE role NOT IN ('student', 'parent', 'advisor', 'admin');

-- Then add the constraint
ALTER TABLE users 
DROP CONSTRAINT IF EXISTS valid_role;

ALTER TABLE users 
ADD CONSTRAINT valid_role CHECK (
    role IN ('student', 'parent', 'advisor', 'admin')
);

-- Step 4: Create parent-child relationships table for parent accounts
CREATE TABLE IF NOT EXISTS parent_child_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES users(id) ON DELETE CASCADE,
    child_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(parent_id, child_id)
);

-- Create indexes for parent-child relationships
CREATE INDEX IF NOT EXISTS idx_parent_child_parent ON parent_child_relationships(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_child_child ON parent_child_relationships(child_id);
CREATE INDEX IF NOT EXISTS idx_parent_child_status ON parent_child_relationships(status);

-- Step 5: Create advisor groups tables
CREATE TABLE IF NOT EXISTS advisor_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    advisor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS advisor_group_members (
    group_id UUID REFERENCES advisor_groups(id) ON DELETE CASCADE,
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY(group_id, student_id)
);

-- Create indexes for advisor groups
CREATE INDEX IF NOT EXISTS idx_advisor_groups_advisor ON advisor_groups(advisor_id);
CREATE INDEX IF NOT EXISTS idx_advisor_groups_active ON advisor_groups(is_active);
CREATE INDEX IF NOT EXISTS idx_group_members_student ON advisor_group_members(student_id);

-- Step 6: Create role change audit log table
CREATE TABLE IF NOT EXISTS role_change_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    changed_by UUID REFERENCES users(id),
    old_role TEXT,
    new_role TEXT,
    reason TEXT,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_change_user ON role_change_log(user_id);
CREATE INDEX IF NOT EXISTS idx_role_change_by ON role_change_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_role_change_time ON role_change_log(changed_at);

-- Step 7: Update RLS policies for new tables

-- Parent-child relationships policies
ALTER TABLE parent_child_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can view their relationships" ON parent_child_relationships
    FOR SELECT USING (auth.uid() = parent_id);

CREATE POLICY "Children can view their parent relationships" ON parent_child_relationships
    FOR SELECT USING (auth.uid() = child_id AND status = 'approved');

CREATE POLICY "Admins can manage all relationships" ON parent_child_relationships
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Advisor groups policies
ALTER TABLE advisor_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can manage their groups" ON advisor_groups
    FOR ALL USING (auth.uid() = advisor_id);

CREATE POLICY "Students can view groups they're in" ON advisor_groups
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM advisor_group_members 
            WHERE group_id = advisor_groups.id 
            AND student_id = auth.uid()
        )
    );

CREATE POLICY "Admins can manage all groups" ON advisor_groups
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Advisor group members policies
ALTER TABLE advisor_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can manage their group members" ON advisor_group_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM advisor_groups 
            WHERE id = group_id 
            AND advisor_id = auth.uid()
        )
    );

CREATE POLICY "Students can view their group memberships" ON advisor_group_members
    FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Admins can manage all memberships" ON advisor_group_members
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Role change log policies (admin only)
ALTER TABLE role_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view role changes" ON role_change_log
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Only admins can insert role changes" ON role_change_log
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Grant necessary permissions
GRANT ALL ON parent_child_relationships TO authenticated;
GRANT ALL ON advisor_groups TO authenticated;
GRANT ALL ON advisor_group_members TO authenticated;
GRANT ALL ON role_change_log TO authenticated;

-- Migration complete message
DO $$
BEGIN
    RAISE NOTICE 'Role-based access control migration completed successfully!';
    RAISE NOTICE 'Tables created: parent_child_relationships, advisor_groups, advisor_group_members, role_change_log';
    RAISE NOTICE 'Indexes and constraints added for optimal performance';
    RAISE NOTICE 'Row Level Security policies configured';
END $$;