-- Migration 017: Create quest_invitations table
-- Created: 2025-12-27
-- Purpose: Enable advisors to invite students to specific quests

-- Create quest_invitations table
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

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_quest_invitations_advisor_id ON public.quest_invitations(advisor_id);
CREATE INDEX IF NOT EXISTS idx_quest_invitations_student_id ON public.quest_invitations(student_id);
CREATE INDEX IF NOT EXISTS idx_quest_invitations_quest_id ON public.quest_invitations(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_invitations_organization_id ON public.quest_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_quest_invitations_status ON public.quest_invitations(status);
CREATE INDEX IF NOT EXISTS idx_quest_invitations_student_status ON public.quest_invitations(student_id, status);

-- Composite index for common query pattern (advisor viewing their invitations)
CREATE INDEX IF NOT EXISTS idx_quest_invitations_advisor_org ON public.quest_invitations(advisor_id, organization_id);

-- Unique constraint to prevent duplicate pending invitations
CREATE UNIQUE INDEX IF NOT EXISTS idx_quest_invitations_unique_pending
ON public.quest_invitations(student_id, quest_id, advisor_id)
WHERE status = 'pending';

-- Enable Row Level Security
ALTER TABLE public.quest_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Advisors can view invitations they created in their organization
CREATE POLICY "Advisors can view their own quest invitations"
ON public.quest_invitations
FOR SELECT
USING (
    auth.uid() = advisor_id
    AND EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = quest_invitations.organization_id
        AND role IN ('advisor', 'school_admin', 'superadmin')
    )
);

-- RLS Policy: Students can view invitations sent to them
CREATE POLICY "Students can view their own quest invitations"
ON public.quest_invitations
FOR SELECT
USING (
    auth.uid() = student_id
);

-- RLS Policy: Advisors can create invitations for students in their organization
CREATE POLICY "Advisors can create quest invitations"
ON public.quest_invitations
FOR INSERT
WITH CHECK (
    auth.uid() = advisor_id
    AND EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = quest_invitations.organization_id
        AND role IN ('advisor', 'school_admin', 'superadmin')
    )
    AND EXISTS (
        SELECT 1 FROM public.users
        WHERE id = student_id
        AND organization_id = quest_invitations.organization_id
    )
);

-- RLS Policy: Students can update their own invitations (accept/decline)
CREATE POLICY "Students can update their quest invitations"
ON public.quest_invitations
FOR UPDATE
USING (
    auth.uid() = student_id
)
WITH CHECK (
    auth.uid() = student_id
    AND status IN ('accepted', 'declined')
);

-- RLS Policy: Advisors can update their own invitations (withdraw)
CREATE POLICY "Advisors can update their quest invitations"
ON public.quest_invitations
FOR UPDATE
USING (
    auth.uid() = advisor_id
)
WITH CHECK (
    auth.uid() = advisor_id
);

-- RLS Policy: Advisors can delete their own invitations
CREATE POLICY "Advisors can delete their quest invitations"
ON public.quest_invitations
FOR DELETE
USING (
    auth.uid() = advisor_id
);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_quest_invitations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER quest_invitations_updated_at
    BEFORE UPDATE ON public.quest_invitations
    FOR EACH ROW
    EXECUTE FUNCTION update_quest_invitations_updated_at();

-- Function to set responded_at when status changes from pending
CREATE OR REPLACE FUNCTION set_quest_invitation_responded_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status != OLD.status AND OLD.status = 'pending' THEN
        NEW.responded_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to set responded_at
CREATE TRIGGER quest_invitations_responded_at
    BEFORE UPDATE ON public.quest_invitations
    FOR EACH ROW
    EXECUTE FUNCTION set_quest_invitation_responded_at();

-- Add comment to table
COMMENT ON TABLE public.quest_invitations IS 'Stores quest invitations from advisors to students. Students can accept or decline invitations to start quests.';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quest_invitations TO authenticated;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 017 completed: quest_invitations table created with RLS policies and indexes';
END $$;
