-- Organization Classes Feature
-- Migration: 20260209_create_organization_classes.sql
-- Description: Creates tables for organization class management system

-- 1. org_classes - Main class entity
CREATE TABLE IF NOT EXISTS org_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    xp_threshold INTEGER NOT NULL DEFAULT 100,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for org lookup
CREATE INDEX IF NOT EXISTS idx_org_classes_organization_id ON org_classes(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_classes_status ON org_classes(status);
CREATE INDEX IF NOT EXISTS idx_org_classes_created_by ON org_classes(created_by);

-- 2. class_advisors - Multiple advisors per class
CREATE TABLE IF NOT EXISTS class_advisors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES org_classes(id) ON DELETE CASCADE,
    advisor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(class_id, advisor_id)
);

-- Indexes for advisor lookups
CREATE INDEX IF NOT EXISTS idx_class_advisors_class_id ON class_advisors(class_id);
CREATE INDEX IF NOT EXISTS idx_class_advisors_advisor_id ON class_advisors(advisor_id);
CREATE INDEX IF NOT EXISTS idx_class_advisors_is_active ON class_advisors(is_active);

-- 3. class_enrollments - Students in class
CREATE TABLE IF NOT EXISTS class_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES org_classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'withdrawn')),
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    enrolled_by UUID NOT NULL REFERENCES users(id),
    completed_at TIMESTAMPTZ,
    UNIQUE(class_id, student_id)
);

-- Indexes for enrollment lookups
CREATE INDEX IF NOT EXISTS idx_class_enrollments_class_id ON class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_student_id ON class_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_status ON class_enrollments(status);

-- 4. class_quests - Quests assigned to class
CREATE TABLE IF NOT EXISTS class_quests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES org_classes(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    added_by UUID NOT NULL REFERENCES users(id),
    added_at TIMESTAMPTZ DEFAULT NOW(),
    sequence_order INTEGER DEFAULT 0,
    UNIQUE(class_id, quest_id)
);

-- Indexes for quest lookups
CREATE INDEX IF NOT EXISTS idx_class_quests_class_id ON class_quests(class_id);
CREATE INDEX IF NOT EXISTS idx_class_quests_quest_id ON class_quests(quest_id);
CREATE INDEX IF NOT EXISTS idx_class_quests_sequence_order ON class_quests(sequence_order);

-- Enable RLS on all tables
ALTER TABLE org_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_advisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_quests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for org_classes
-- Org admins and superadmins can manage all classes in their org
CREATE POLICY org_classes_org_admin_policy ON org_classes
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
            AND (
                u.role = 'superadmin'
                OR (u.organization_id = org_classes.organization_id AND u.org_role = 'org_admin')
            )
        )
    );

-- Class advisors can view and update their assigned classes
CREATE POLICY org_classes_advisor_policy ON org_classes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM class_advisors ca
            WHERE ca.class_id = org_classes.id
            AND ca.advisor_id = auth.uid()
            AND ca.is_active = TRUE
        )
    );

-- RLS Policies for class_advisors
CREATE POLICY class_advisors_admin_policy ON class_advisors
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM org_classes oc
            JOIN users u ON u.id = auth.uid()
            WHERE oc.id = class_advisors.class_id
            AND (
                u.role = 'superadmin'
                OR (u.organization_id = oc.organization_id AND u.org_role = 'org_admin')
            )
        )
    );

-- Advisors can view their own assignments
CREATE POLICY class_advisors_self_policy ON class_advisors
    FOR SELECT
    USING (advisor_id = auth.uid());

-- RLS Policies for class_enrollments
CREATE POLICY class_enrollments_admin_policy ON class_enrollments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM org_classes oc
            JOIN users u ON u.id = auth.uid()
            WHERE oc.id = class_enrollments.class_id
            AND (
                u.role = 'superadmin'
                OR (u.organization_id = oc.organization_id AND u.org_role = 'org_admin')
            )
        )
    );

-- Advisors can manage enrollments for their classes
CREATE POLICY class_enrollments_advisor_policy ON class_enrollments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM class_advisors ca
            WHERE ca.class_id = class_enrollments.class_id
            AND ca.advisor_id = auth.uid()
            AND ca.is_active = TRUE
        )
    );

-- Students can view their own enrollments
CREATE POLICY class_enrollments_student_policy ON class_enrollments
    FOR SELECT
    USING (student_id = auth.uid());

-- RLS Policies for class_quests
CREATE POLICY class_quests_admin_policy ON class_quests
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM org_classes oc
            JOIN users u ON u.id = auth.uid()
            WHERE oc.id = class_quests.class_id
            AND (
                u.role = 'superadmin'
                OR (u.organization_id = oc.organization_id AND u.org_role = 'org_admin')
            )
        )
    );

-- Advisors can manage quests for their classes
CREATE POLICY class_quests_advisor_policy ON class_quests
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM class_advisors ca
            WHERE ca.class_id = class_quests.class_id
            AND ca.advisor_id = auth.uid()
            AND ca.is_active = TRUE
        )
    );

-- Students can view quests for classes they're enrolled in
CREATE POLICY class_quests_student_policy ON class_quests
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM class_enrollments ce
            WHERE ce.class_id = class_quests.class_id
            AND ce.student_id = auth.uid()
            AND ce.status = 'active'
        )
    );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_org_classes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS org_classes_updated_at_trigger ON org_classes;
CREATE TRIGGER org_classes_updated_at_trigger
    BEFORE UPDATE ON org_classes
    FOR EACH ROW
    EXECUTE FUNCTION update_org_classes_updated_at();

-- Comments for documentation
COMMENT ON TABLE org_classes IS 'Organization classes for grouping students around quests with XP-based completion tracking';
COMMENT ON TABLE class_advisors IS 'Junction table for advisors assigned to manage a class';
COMMENT ON TABLE class_enrollments IS 'Student enrollments in classes with status tracking';
COMMENT ON TABLE class_quests IS 'Quests assigned to a class for students to complete';

COMMENT ON COLUMN org_classes.xp_threshold IS 'Total XP required from class quests to complete the class';
COMMENT ON COLUMN org_classes.status IS 'active = currently running, archived = no longer in use';
COMMENT ON COLUMN class_enrollments.status IS 'active = enrolled, completed = met xp_threshold, withdrawn = removed from class';
COMMENT ON COLUMN class_quests.sequence_order IS 'Display order for quests within the class';
