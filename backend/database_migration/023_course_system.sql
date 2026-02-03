-- Migration 023: Course System
-- Purpose: Create course system with enrollments and quest sequencing
-- Created: 2025-12-29
-- Part of: LMS Transformation - Course Management

BEGIN;

-- ========================================
-- 1. Add 'course_completion' to badge_type enum
-- ========================================

-- Drop existing constraint
ALTER TABLE badges
DROP CONSTRAINT IF EXISTS valid_badge_type;

-- Add new constraint with course_completion type
ALTER TABLE badges
ADD CONSTRAINT valid_badge_type
CHECK (badge_type IN ('exploration', 'onfire_pathway', 'course_completion'));

-- ========================================
-- 2. Create courses table
-- ========================================

CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    badge_id UUID REFERENCES badges(id) ON DELETE SET NULL,
    intro_content JSONB DEFAULT '{}',
    cover_image_url TEXT,
    status VARCHAR(50) DEFAULT 'draft' NOT NULL,
    visibility VARCHAR(50) DEFAULT 'organization' NOT NULL,
    navigation_mode VARCHAR(50) DEFAULT 'sequential' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_course_status CHECK (
        status IN ('draft', 'published', 'archived')
    ),
    CONSTRAINT valid_course_visibility CHECK (
        visibility IN ('organization', 'public', 'private')
    ),
    CONSTRAINT valid_navigation_mode CHECK (
        navigation_mode IN ('sequential', 'freeform')
    )
);

-- Indexes for courses
CREATE INDEX idx_courses_organization ON courses(organization_id);
CREATE INDEX idx_courses_created_by ON courses(created_by);
CREATE INDEX idx_courses_badge ON courses(badge_id);
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_org_status ON courses(organization_id, status);

-- Enable RLS for courses
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view courses in their organization
CREATE POLICY "users_view_org_courses" ON courses
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    );

-- RLS Policy: Admins and teachers can create courses
CREATE POLICY "admins_teachers_create_courses" ON courses
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid()
            AND role IN ('admin', 'org_admin', 'teacher')
        )
    );

-- RLS Policy: Course creators and admins can update courses
CREATE POLICY "creators_admins_update_courses" ON courses
    FOR UPDATE
    USING (
        created_by = auth.uid()
        OR organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid()
            AND role IN ('admin', 'org_admin')
        )
    )
    WITH CHECK (
        created_by = auth.uid()
        OR organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid()
            AND role IN ('admin', 'org_admin')
        )
    );

-- RLS Policy: Course creators and admins can delete courses
CREATE POLICY "creators_admins_delete_courses" ON courses
    FOR DELETE
    USING (
        created_by = auth.uid()
        OR organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid()
            AND role IN ('admin', 'org_admin')
        )
    );

-- ========================================
-- 3. Create course_quests table
-- ========================================

CREATE TABLE IF NOT EXISTS course_quests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL,
    custom_title VARCHAR(255),
    intro_content JSONB DEFAULT '{}',
    is_required BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate quests in same course
    CONSTRAINT unique_course_quest UNIQUE (course_id, quest_id),
    -- Prevent duplicate sequence orders in same course
    CONSTRAINT unique_course_sequence UNIQUE (course_id, sequence_order)
);

-- Indexes for course_quests
CREATE INDEX idx_course_quests_course ON course_quests(course_id);
CREATE INDEX idx_course_quests_quest ON course_quests(quest_id);
CREATE INDEX idx_course_quests_sequence ON course_quests(course_id, sequence_order);

-- Enable RLS for course_quests
ALTER TABLE course_quests ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view course quests if they can view the course
CREATE POLICY "users_view_course_quests" ON course_quests
    FOR SELECT
    USING (
        course_id IN (
            SELECT id FROM courses
            WHERE organization_id IN (
                SELECT organization_id FROM users WHERE id = auth.uid()
            )
        )
    );

-- RLS Policy: Course creators and admins can manage course quests
CREATE POLICY "creators_admins_manage_course_quests" ON course_quests
    FOR ALL
    USING (
        course_id IN (
            SELECT id FROM courses
            WHERE created_by = auth.uid()
            OR organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid()
                AND role IN ('admin', 'org_admin', 'teacher')
            )
        )
    )
    WITH CHECK (
        course_id IN (
            SELECT id FROM courses
            WHERE created_by = auth.uid()
            OR organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid()
                AND role IN ('admin', 'org_admin', 'teacher')
            )
        )
    );

-- ========================================
-- 4. Create course_enrollments table
-- ========================================

CREATE TABLE IF NOT EXISTS course_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active' NOT NULL,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    current_quest_id UUID REFERENCES quests(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate enrollments
    CONSTRAINT unique_course_enrollment UNIQUE (course_id, user_id),
    CONSTRAINT valid_enrollment_status CHECK (
        status IN ('active', 'completed', 'dropped')
    ),
    -- Completed courses must have completed_at timestamp
    CONSTRAINT completed_has_timestamp CHECK (
        (status = 'completed' AND completed_at IS NOT NULL)
        OR (status != 'completed' AND completed_at IS NULL)
    )
);

-- Indexes for course_enrollments
CREATE INDEX idx_enrollments_course ON course_enrollments(course_id);
CREATE INDEX idx_enrollments_user ON course_enrollments(user_id);
CREATE INDEX idx_enrollments_current_quest ON course_enrollments(current_quest_id);
CREATE INDEX idx_enrollments_user_status ON course_enrollments(user_id, status);
CREATE INDEX idx_enrollments_course_status ON course_enrollments(course_id, status);

-- Enable RLS for course_enrollments
ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own enrollments
CREATE POLICY "users_view_own_enrollments" ON course_enrollments
    FOR SELECT
    USING (user_id = auth.uid());

-- RLS Policy: Teachers/admins can view enrollments in their org courses
CREATE POLICY "teachers_admins_view_enrollments" ON course_enrollments
    FOR SELECT
    USING (
        course_id IN (
            SELECT id FROM courses
            WHERE organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid()
                AND role IN ('admin', 'org_admin', 'teacher')
            )
        )
    );

-- RLS Policy: Users can enroll themselves in published courses
CREATE POLICY "users_enroll_in_courses" ON course_enrollments
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND course_id IN (
            SELECT id FROM courses
            WHERE status = 'published'
            AND organization_id IN (
                SELECT organization_id FROM users WHERE id = auth.uid()
            )
        )
    );

-- RLS Policy: Teachers/admins can enroll users in their org courses
CREATE POLICY "teachers_admins_enroll_users" ON course_enrollments
    FOR INSERT
    WITH CHECK (
        course_id IN (
            SELECT id FROM courses
            WHERE organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid()
                AND role IN ('admin', 'org_admin', 'teacher')
            )
        )
    );

-- RLS Policy: Users can update their own enrollments
CREATE POLICY "users_update_own_enrollments" ON course_enrollments
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- RLS Policy: Teachers/admins can update enrollments in their org courses
CREATE POLICY "teachers_admins_update_enrollments" ON course_enrollments
    FOR UPDATE
    USING (
        course_id IN (
            SELECT id FROM courses
            WHERE organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid()
                AND role IN ('admin', 'org_admin', 'teacher')
            )
        )
    )
    WITH CHECK (
        course_id IN (
            SELECT id FROM courses
            WHERE organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid()
                AND role IN ('admin', 'org_admin', 'teacher')
            )
        )
    );

-- RLS Policy: Teachers/admins can delete enrollments in their org courses
CREATE POLICY "teachers_admins_delete_enrollments" ON course_enrollments
    FOR DELETE
    USING (
        course_id IN (
            SELECT id FROM courses
            WHERE organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid()
                AND role IN ('admin', 'org_admin', 'teacher')
            )
        )
    );

-- ========================================
-- 5. Documentation
-- ========================================

COMMENT ON TABLE courses IS 'Structured learning paths that group quests in a specific sequence';
COMMENT ON COLUMN courses.intro_content IS 'Rich content (text, images, videos) shown before course starts';
COMMENT ON COLUMN courses.navigation_mode IS 'sequential = must complete in order, freeform = can jump around';
COMMENT ON COLUMN courses.badge_id IS 'Badge awarded upon course completion';

COMMENT ON TABLE course_quests IS 'Quests assigned to courses with specific sequence order';
COMMENT ON COLUMN course_quests.sequence_order IS 'Order in which quests appear (1, 2, 3, ...)';
COMMENT ON COLUMN course_quests.custom_title IS 'Optional override for quest title within this course';
COMMENT ON COLUMN course_quests.intro_content IS 'Optional intro content specific to this quest in this course';

COMMENT ON TABLE course_enrollments IS 'Student enrollments in courses';
COMMENT ON COLUMN course_enrollments.current_quest_id IS 'The quest the student is currently working on';
COMMENT ON COLUMN course_enrollments.status IS 'active = in progress, completed = finished all required quests, dropped = student withdrew';

COMMIT;
