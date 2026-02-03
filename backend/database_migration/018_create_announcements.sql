-- Migration 018: Create announcements table
-- Created: 2025-12-27
-- Purpose: Enable advisors and admins to post announcements to their organization

-- Create announcements table
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

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_announcements_organization_id ON public.announcements(organization_id);
CREATE INDEX IF NOT EXISTS idx_announcements_author_id ON public.announcements(author_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON public.announcements(pinned) WHERE pinned = true;

-- Composite index for common query pattern (org + not expired + ordered)
CREATE INDEX IF NOT EXISTS idx_announcements_org_active ON public.announcements(organization_id, created_at DESC)
WHERE expires_at IS NULL OR expires_at > NOW();

-- Enable Row Level Security
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view announcements from their organization
CREATE POLICY "Users can view announcements from their organization"
ON public.announcements
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = announcements.organization_id
    )
);

-- RLS Policy: Advisors and admins can create announcements for their organization
CREATE POLICY "Advisors and admins can create announcements"
ON public.announcements
FOR INSERT
WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = announcements.organization_id
        AND role IN ('advisor', 'educator', 'admin')
    )
);

-- RLS Policy: Authors can update their own announcements
CREATE POLICY "Authors can update their announcements"
ON public.announcements
FOR UPDATE
USING (
    auth.uid() = author_id
)
WITH CHECK (
    auth.uid() = author_id
);

-- RLS Policy: Authors and org admins can delete announcements
CREATE POLICY "Authors and admins can delete announcements"
ON public.announcements
FOR DELETE
USING (
    auth.uid() = author_id
    OR EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND organization_id = announcements.organization_id
        AND (role = 'admin' OR is_org_admin = true)
    )
);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_announcements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS announcements_updated_at ON public.announcements;
CREATE TRIGGER announcements_updated_at
    BEFORE UPDATE ON public.announcements
    FOR EACH ROW
    EXECUTE FUNCTION update_announcements_updated_at();

-- Add comment to table
COMMENT ON TABLE public.announcements IS 'Organization announcements from advisors and admins. Supports markdown content, pinning, and expiration.';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 018 completed: announcements table created with RLS policies and indexes';
END $$;
