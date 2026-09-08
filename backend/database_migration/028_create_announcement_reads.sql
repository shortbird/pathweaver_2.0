-- Migration 028: Create announcement_reads table
-- Created: 2025-12-30
-- Purpose: Track which announcements users have read for unread badge counts

-- Create announcement_reads table
CREATE TABLE IF NOT EXISTS public.announcement_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint to prevent duplicate reads
    CONSTRAINT announcement_reads_unique UNIQUE (announcement_id, user_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_id ON public.announcement_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_announcement_id ON public.announcement_reads(announcement_id);

-- Enable Row Level Security
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own read records
CREATE POLICY "Users can view their own announcement reads"
ON public.announcement_reads
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy: Users can mark announcements as read
CREATE POLICY "Users can mark announcements as read"
ON public.announcement_reads
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own read records (for upsert)
CREATE POLICY "Users can update their own read records"
ON public.announcement_reads
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add comment to table
COMMENT ON TABLE public.announcement_reads IS 'Tracks which announcements each user has read for unread badge counts.';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.announcement_reads TO authenticated;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 028 completed: announcement_reads table created with RLS policies';
END $$;
