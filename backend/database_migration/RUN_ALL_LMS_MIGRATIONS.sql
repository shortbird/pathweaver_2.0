-- ============================================
-- LMS MIGRATIONS - RUN ALL IN ORDER
-- ============================================
-- Copy this entire file and paste into Supabase SQL Editor
-- Project: vvfgxcykxjybtvpfzwyx
-- Run Date: 2025-12-27
-- ============================================

-- ============================================
-- MIGRATION 017: Quest Invitations
-- ============================================

CREATE TABLE IF NOT EXISTS public.quest_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advisor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    message TEXT,
    invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quest_invitations_advisor_id ON public.quest_invitations(advisor_id);
CREATE INDEX IF NOT EXISTS idx_quest_invitations_student_id ON public.quest_invitations(student_id);
CREATE INDEX IF NOT EXISTS idx_quest_invitations_quest_id ON public.quest_invitations(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_invitations_organization_id ON public.quest_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_quest_invitations_status ON public.quest_invitations(status);
CREATE INDEX IF NOT EXISTS idx_quest_invitations_student_status ON public.quest_invitations(student_id, status);
CREATE INDEX IF NOT EXISTS idx_quest_invitations_advisor_org ON public.quest_invitations(advisor_id, organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quest_invitations_unique_pending
ON public.quest_invitations(student_id, quest_id, advisor_id)
WHERE status = 'pending';

ALTER TABLE public.quest_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Advisors can view their own quest invitations" ON public.quest_invitations;
CREATE POLICY "Advisors can view their own quest invitations"
ON public.quest_invitations FOR SELECT
USING (
    auth.uid() = advisor_id
    AND EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = quest_invitations.organization_id
        AND role IN ('advisor', 'school_admin', 'superadmin', 'admin', 'educator')
    )
);

DROP POLICY IF EXISTS "Students can view their own quest invitations" ON public.quest_invitations;
CREATE POLICY "Students can view their own quest invitations"
ON public.quest_invitations FOR SELECT
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Advisors can create quest invitations" ON public.quest_invitations;
CREATE POLICY "Advisors can create quest invitations"
ON public.quest_invitations FOR INSERT
WITH CHECK (
    auth.uid() = advisor_id
    AND EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = quest_invitations.organization_id
        AND role IN ('advisor', 'school_admin', 'superadmin', 'admin', 'educator')
    )
);

DROP POLICY IF EXISTS "Students can update their quest invitations" ON public.quest_invitations;
CREATE POLICY "Students can update their quest invitations"
ON public.quest_invitations FOR UPDATE
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id AND status IN ('accepted', 'declined'));

DROP POLICY IF EXISTS "Advisors can update their quest invitations" ON public.quest_invitations;
CREATE POLICY "Advisors can update their quest invitations"
ON public.quest_invitations FOR UPDATE
USING (auth.uid() = advisor_id)
WITH CHECK (auth.uid() = advisor_id);

DROP POLICY IF EXISTS "Advisors can delete their quest invitations" ON public.quest_invitations;
CREATE POLICY "Advisors can delete their quest invitations"
ON public.quest_invitations FOR DELETE
USING (auth.uid() = advisor_id);

CREATE OR REPLACE FUNCTION update_quest_invitations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quest_invitations_updated_at ON public.quest_invitations;
CREATE TRIGGER quest_invitations_updated_at
    BEFORE UPDATE ON public.quest_invitations
    FOR EACH ROW
    EXECUTE FUNCTION update_quest_invitations_updated_at();

CREATE OR REPLACE FUNCTION set_quest_invitation_responded_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status != OLD.status AND OLD.status = 'pending' THEN
        NEW.responded_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quest_invitations_responded_at ON public.quest_invitations;
CREATE TRIGGER quest_invitations_responded_at
    BEFORE UPDATE ON public.quest_invitations
    FOR EACH ROW
    EXECUTE FUNCTION set_quest_invitation_responded_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quest_invitations TO authenticated;

-- ============================================
-- MIGRATION 018: Announcements
-- ============================================

CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_audience TEXT[] NOT NULL DEFAULT ARRAY['all']::TEXT[],
    pinned BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_organization_id ON public.announcements(organization_id);
CREATE INDEX IF NOT EXISTS idx_announcements_author_id ON public.announcements(author_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON public.announcements(pinned) WHERE pinned = true;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view announcements from their organization" ON public.announcements;
CREATE POLICY "Users can view announcements from their organization"
ON public.announcements FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = announcements.organization_id
    )
);

DROP POLICY IF EXISTS "Advisors and admins can create announcements" ON public.announcements;
CREATE POLICY "Advisors and admins can create announcements"
ON public.announcements FOR INSERT
WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = announcements.organization_id
        AND role IN ('advisor', 'educator', 'admin')
    )
);

DROP POLICY IF EXISTS "Authors can update their announcements" ON public.announcements;
CREATE POLICY "Authors can update their announcements"
ON public.announcements FOR UPDATE
USING (auth.uid() = author_id)
WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors and admins can delete announcements" ON public.announcements;
CREATE POLICY "Authors and admins can delete announcements"
ON public.announcements FOR DELETE
USING (
    auth.uid() = author_id
    OR EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = announcements.organization_id
        AND (role = 'admin' OR is_org_admin = true)
    )
);

CREATE OR REPLACE FUNCTION update_announcements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS announcements_updated_at ON public.announcements;
CREATE TRIGGER announcements_updated_at
    BEFORE UPDATE ON public.announcements
    FOR EACH ROW
    EXECUTE FUNCTION update_announcements_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;

-- ============================================
-- MIGRATION 019: Curriculum Builder
-- ============================================

ALTER TABLE quests ADD COLUMN IF NOT EXISTS curriculum_content JSONB DEFAULT NULL;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS curriculum_version INTEGER DEFAULT 1;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS curriculum_last_edited_by UUID REFERENCES users(id);
ALTER TABLE quests ADD COLUMN IF NOT EXISTS curriculum_last_edited_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_quests_curriculum_content ON quests USING GIN (curriculum_content);
CREATE INDEX IF NOT EXISTS idx_quests_curriculum_last_edited_by ON quests(curriculum_last_edited_by);

CREATE TABLE IF NOT EXISTS curriculum_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes INTEGER,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  deleted_by UUID REFERENCES users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curriculum_attachments_quest_id ON curriculum_attachments(quest_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_attachments_uploaded_by ON curriculum_attachments(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_curriculum_attachments_organization_id ON curriculum_attachments(organization_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_attachments_is_deleted ON curriculum_attachments(is_deleted);

ALTER TABLE curriculum_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "curriculum_attachments_org_isolation" ON curriculum_attachments;
CREATE POLICY curriculum_attachments_org_isolation ON curriculum_attachments
FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "curriculum_attachments_insert" ON curriculum_attachments;
CREATE POLICY curriculum_attachments_insert ON curriculum_attachments
FOR INSERT WITH CHECK (
  organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "curriculum_attachments_update" ON curriculum_attachments;
CREATE POLICY curriculum_attachments_update ON curriculum_attachments
FOR UPDATE USING (
  uploaded_by = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('advisor', 'educator', 'admin', 'superadmin'))
);

DROP POLICY IF EXISTS "curriculum_attachments_delete" ON curriculum_attachments;
CREATE POLICY curriculum_attachments_delete ON curriculum_attachments
FOR DELETE USING (
  uploaded_by = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('advisor', 'educator', 'admin', 'superadmin'))
);

CREATE OR REPLACE FUNCTION update_curriculum_attachments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_curriculum_attachments_updated_at ON curriculum_attachments;
CREATE TRIGGER trigger_update_curriculum_attachments_updated_at
BEFORE UPDATE ON curriculum_attachments
FOR EACH ROW
EXECUTE FUNCTION update_curriculum_attachments_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON curriculum_attachments TO authenticated;

-- ============================================
-- MIGRATION 020: Admin Audit Logs
-- ============================================

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    changes JSONB DEFAULT '{}'::JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_organization_id ON public.admin_audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_user_id ON public.admin_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action_type ON public.admin_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_resource_type ON public.admin_audit_logs(resource_type);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School admins can view their org audit logs" ON public.admin_audit_logs;
CREATE POLICY "School admins can view their org audit logs"
ON public.admin_audit_logs FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = admin_audit_logs.organization_id
        AND (is_org_admin = true OR role = 'admin')
    )
);

DROP POLICY IF EXISTS "System can insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "System can insert audit logs"
ON public.admin_audit_logs FOR INSERT
WITH CHECK (true);

GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;

-- ============================================
-- MIGRATION 021: Notifications
-- ============================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_organization_id ON public.notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "System can create notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

-- ============================================
-- COMPLETE
-- ============================================
SELECT 'All LMS migrations completed successfully!' as status;
