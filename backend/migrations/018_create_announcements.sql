-- Migration: Create Announcements System for Multi-Organization Platform
-- Purpose: Organization-wide or quest-specific announcements from advisors/admins
-- Date: December 27, 2025
-- Author: Multi-Agent System

-- Create announcements table
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL, -- Markdown support for rich content
    target_audience VARCHAR(50) NOT NULL DEFAULT 'all_students', -- 'all_students', 'specific_quest', 'specific_users'
    quest_id UUID REFERENCES quests(id) ON DELETE CASCADE, -- Nullable, used when target_audience = 'specific_quest'
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE, -- Nullable, announcement expires and stops showing after this time

    -- Constraints
    CONSTRAINT valid_target_audience CHECK (target_audience IN ('all_students', 'specific_quest', 'specific_users')),
    CONSTRAINT quest_id_required_for_quest_target CHECK (
        (target_audience = 'specific_quest' AND quest_id IS NOT NULL) OR
        (target_audience != 'specific_quest')
    )
);

-- Create announcement_recipients table for specific user targeting
CREATE TABLE IF NOT EXISTS announcement_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure unique recipient per announcement
    UNIQUE(announcement_id, user_id)
);

-- Create indexes for efficient querying
CREATE INDEX idx_announcements_organization_id ON announcements(organization_id);
CREATE INDEX idx_announcements_author_id ON announcements(author_id);
CREATE INDEX idx_announcements_quest_id ON announcements(quest_id);
CREATE INDEX idx_announcements_created_at ON announcements(created_at DESC);
CREATE INDEX idx_announcements_expires_at ON announcements(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_announcements_pinned ON announcements(is_pinned) WHERE is_pinned = true;
CREATE INDEX idx_announcements_active ON announcements(organization_id, created_at DESC) WHERE (expires_at IS NULL OR expires_at > NOW());

CREATE INDEX idx_announcement_recipients_announcement_id ON announcement_recipients(announcement_id);
CREATE INDEX idx_announcement_recipients_user_id ON announcement_recipients(user_id);
CREATE INDEX idx_announcement_recipients_unread ON announcement_recipients(user_id, is_read) WHERE is_read = false;

-- Enable RLS
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_recipients ENABLE ROW LEVEL SECURITY;

-- RLS Policies for announcements table

-- Policy: Admins and superadmins can view all announcements in their organization
CREATE POLICY admin_view_org_announcements ON announcements
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.organization_id = announcements.organization_id
            AND users.role IN ('admin', 'superadmin', 'advisor')
        )
    );

-- Policy: Students can view announcements in their organization that target them
CREATE POLICY student_view_announcements ON announcements
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.organization_id = announcements.organization_id
            AND users.role = 'student'
        )
        AND (
            -- Announcement targets all students
            target_audience = 'all_students'
            OR
            -- Announcement targets specific quest that student is enrolled in
            (
                target_audience = 'specific_quest'
                AND EXISTS (
                    SELECT 1 FROM user_quest_tasks
                    WHERE user_quest_tasks.user_id = auth.uid()
                    AND user_quest_tasks.quest_id = announcements.quest_id
                )
            )
            OR
            -- Announcement targets specific users and this student is one of them
            (
                target_audience = 'specific_users'
                AND EXISTS (
                    SELECT 1 FROM announcement_recipients
                    WHERE announcement_recipients.announcement_id = announcements.id
                    AND announcement_recipients.user_id = auth.uid()
                )
            )
        )
        AND (expires_at IS NULL OR expires_at > NOW())
    );

-- Policy: Advisors and admins can create announcements in their organization
CREATE POLICY advisor_create_announcements ON announcements
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.organization_id = announcements.organization_id
            AND users.role IN ('admin', 'superadmin', 'advisor')
        )
        AND author_id = auth.uid()
    );

-- Policy: Advisors and admins can update their own announcements
CREATE POLICY advisor_update_own_announcements ON announcements
    FOR UPDATE
    USING (
        author_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'superadmin', 'advisor')
        )
    )
    WITH CHECK (
        author_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'superadmin', 'advisor')
        )
    );

-- Policy: Admins and superadmins can update any announcement in their org
CREATE POLICY admin_update_org_announcements ON announcements
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.organization_id = announcements.organization_id
            AND users.role IN ('admin', 'superadmin')
        )
    );

-- Policy: Advisors and admins can delete their own announcements
CREATE POLICY advisor_delete_own_announcements ON announcements
    FOR DELETE
    USING (
        author_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'superadmin', 'advisor')
        )
    );

-- Policy: Admins and superadmins can delete any announcement in their org
CREATE POLICY admin_delete_org_announcements ON announcements
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.organization_id = announcements.organization_id
            AND users.role IN ('admin', 'superadmin')
        )
    );

-- RLS Policies for announcement_recipients table

-- Policy: Users can view their own recipient records
CREATE POLICY user_view_own_recipients ON announcement_recipients
    FOR SELECT
    USING (user_id = auth.uid());

-- Policy: Advisors/admins can view recipients for announcements in their org
CREATE POLICY advisor_view_recipients ON announcement_recipients
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM announcements
            JOIN users ON users.id = auth.uid()
            WHERE announcements.id = announcement_recipients.announcement_id
            AND users.organization_id = announcements.organization_id
            AND users.role IN ('admin', 'superadmin', 'advisor')
        )
    );

-- Policy: Advisors/admins can insert recipients when creating announcements
CREATE POLICY advisor_insert_recipients ON announcement_recipients
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM announcements
            JOIN users ON users.id = auth.uid()
            WHERE announcements.id = announcement_recipients.announcement_id
            AND announcements.author_id = auth.uid()
            AND users.role IN ('admin', 'superadmin', 'advisor')
        )
    );

-- Policy: Users can update their own recipient records (mark as read)
CREATE POLICY user_update_own_recipients ON announcement_recipients
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Policy: Advisors/admins can delete recipients for their announcements
CREATE POLICY advisor_delete_recipients ON announcement_recipients
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM announcements
            WHERE announcements.id = announcement_recipients.announcement_id
            AND announcements.author_id = auth.uid()
        )
    );

-- Trigger to update updated_at on announcements
CREATE OR REPLACE FUNCTION update_announcement_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER announcements_updated_at_trigger
    BEFORE UPDATE ON announcements
    FOR EACH ROW
    EXECUTE FUNCTION update_announcement_updated_at();

-- Trigger to update read_at when announcement is marked as read
CREATE OR REPLACE FUNCTION update_announcement_read_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_read = true AND (OLD.is_read = false OR OLD.is_read IS NULL) THEN
        NEW.read_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER announcement_recipients_read_at_trigger
    BEFORE UPDATE ON announcement_recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_announcement_read_at();

-- Comments for documentation
COMMENT ON TABLE announcements IS 'Organization-wide or quest-specific announcements from advisors and admins. Supports markdown content.';
COMMENT ON TABLE announcement_recipients IS 'Specific user targeting for announcements with target_audience = specific_users. Tracks read status.';
COMMENT ON COLUMN announcements.target_audience IS 'all_students (org-wide), specific_quest (quest enrollees), or specific_users (specific individuals)';
COMMENT ON COLUMN announcements.content IS 'Markdown-formatted rich text content';
COMMENT ON COLUMN announcements.is_pinned IS 'Pinned announcements appear at the top of the list';
COMMENT ON COLUMN announcements.expires_at IS 'Optional expiration date - announcement stops showing after this time';
