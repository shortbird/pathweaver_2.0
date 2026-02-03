-- Migration 027: Create org_invitations table
-- Created: 2025-12-30
-- Purpose: Enable org admins to invite users to join their organization via email

-- Create org_invitations table
CREATE TABLE IF NOT EXISTS public.org_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    invited_name TEXT,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'parent', 'advisor', 'org_admin', 'observer')),
    invitation_code TEXT NOT NULL UNIQUE,
    invited_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    accepted_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_org_invitations_organization_id ON public.org_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON public.org_invitations(email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_status ON public.org_invitations(status);
CREATE INDEX IF NOT EXISTS idx_org_invitations_invited_by ON public.org_invitations(invited_by);
CREATE INDEX IF NOT EXISTS idx_org_invitations_code ON public.org_invitations(invitation_code);
CREATE INDEX IF NOT EXISTS idx_org_invitations_expires_at ON public.org_invitations(expires_at);

-- Composite index for org admin viewing invitations
CREATE INDEX IF NOT EXISTS idx_org_invitations_org_status ON public.org_invitations(organization_id, status);

-- Unique constraint to prevent duplicate pending invitations for same email in org
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invitations_unique_pending
ON public.org_invitations(organization_id, email)
WHERE status = 'pending';

-- Enable Row Level Security
ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Org admins can view invitations for their organization
CREATE POLICY "Org admins can view org invitations"
ON public.org_invitations
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = org_invitations.organization_id
        AND role IN ('org_admin', 'superadmin')
    )
);

-- RLS Policy: Superadmins can view all invitations
CREATE POLICY "Superadmins can view all org invitations"
ON public.org_invitations
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND role = 'superadmin'
    )
);

-- RLS Policy: Org admins can create invitations for their organization
CREATE POLICY "Org admins can create org invitations"
ON public.org_invitations
FOR INSERT
WITH CHECK (
    auth.uid() = invited_by
    AND EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = org_invitations.organization_id
        AND role IN ('org_admin', 'superadmin')
    )
);

-- RLS Policy: Org admins can update invitations for their organization
CREATE POLICY "Org admins can update org invitations"
ON public.org_invitations
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = org_invitations.organization_id
        AND role IN ('org_admin', 'superadmin')
    )
);

-- RLS Policy: Org admins can delete invitations for their organization
CREATE POLICY "Org admins can delete org invitations"
ON public.org_invitations
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = org_invitations.organization_id
        AND role IN ('org_admin', 'superadmin')
    )
);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_org_invitations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS org_invitations_updated_at ON public.org_invitations;
CREATE TRIGGER org_invitations_updated_at
    BEFORE UPDATE ON public.org_invitations
    FOR EACH ROW
    EXECUTE FUNCTION update_org_invitations_updated_at();

-- Add comment to table
COMMENT ON TABLE public.org_invitations IS 'Stores user invitations from org admins. Users receive email with invitation link to join the organization.';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invitations TO authenticated;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 027 completed: org_invitations table created with RLS policies and indexes';
END $$;
