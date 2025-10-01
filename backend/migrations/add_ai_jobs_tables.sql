-- Migration: Add AI Jobs and Quality Monitoring Tables
-- Date: 2025-09-30
-- Description: Creates tables for automated content generation jobs and quality monitoring

-- Scheduled Jobs Table
CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,
    job_data JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 5,
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    result_data JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    CONSTRAINT valid_priority CHECK (priority BETWEEN 1 AND 10)
);

-- Create indexes for scheduled_jobs
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status ON public.scheduled_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_scheduled_for ON public.scheduled_jobs(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_job_type ON public.scheduled_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_created_at ON public.scheduled_jobs(created_at DESC);

-- Quality Action Logs Table
CREATE TABLE IF NOT EXISTS public.quality_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type TEXT NOT NULL,
    content_id UUID NOT NULL,
    action_type TEXT NOT NULL,
    reason TEXT,
    automated BOOLEAN DEFAULT false,
    performed_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_content_type CHECK (content_type IN ('quest', 'badge', 'task')),
    CONSTRAINT valid_action_type CHECK (action_type IN ('archive', 'deactivate', 'approve', 'reject', 'flag'))
);

-- Create indexes for quality_action_logs
CREATE INDEX IF NOT EXISTS idx_quality_action_logs_content ON public.quality_action_logs(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_quality_action_logs_created_at ON public.quality_action_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_action_logs_action_type ON public.quality_action_logs(action_type);

-- Update quests table to add archiving/deactivation fields if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='quests' AND column_name='archived_at') THEN
        ALTER TABLE public.quests ADD COLUMN archived_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='quests' AND column_name='archive_reason') THEN
        ALTER TABLE public.quests ADD COLUMN archive_reason TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='quests' AND column_name='deactivated_at') THEN
        ALTER TABLE public.quests ADD COLUMN deactivated_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='quests' AND column_name='deactivation_reason') THEN
        ALTER TABLE public.quests ADD COLUMN deactivation_reason TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='quests' AND column_name='requires_review') THEN
        ALTER TABLE public.quests ADD COLUMN requires_review BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='quests' AND column_name='created_by') THEN
        ALTER TABLE public.quests ADD COLUMN created_by UUID REFERENCES public.users(id);
    END IF;
END $$;

-- Enable RLS on new tables
ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_action_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scheduled_jobs (admin only)
DROP POLICY IF EXISTS "Admin can view all scheduled jobs" ON public.scheduled_jobs;
CREATE POLICY "Admin can view all scheduled jobs"
    ON public.scheduled_jobs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'educator')
        )
    );

DROP POLICY IF EXISTS "Admin can insert scheduled jobs" ON public.scheduled_jobs;
CREATE POLICY "Admin can insert scheduled jobs"
    ON public.scheduled_jobs
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'educator')
        )
    );

DROP POLICY IF EXISTS "Admin can update scheduled jobs" ON public.scheduled_jobs;
CREATE POLICY "Admin can update scheduled jobs"
    ON public.scheduled_jobs
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'educator')
        )
    );

DROP POLICY IF EXISTS "Admin can delete scheduled jobs" ON public.scheduled_jobs;
CREATE POLICY "Admin can delete scheduled jobs"
    ON public.scheduled_jobs
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'educator')
        )
    );

-- RLS Policies for quality_action_logs (admin only)
DROP POLICY IF EXISTS "Admin can view quality action logs" ON public.quality_action_logs;
CREATE POLICY "Admin can view quality action logs"
    ON public.quality_action_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'educator')
        )
    );

DROP POLICY IF EXISTS "Admin can insert quality action logs" ON public.quality_action_logs;
CREATE POLICY "Admin can insert quality action logs"
    ON public.quality_action_logs
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'educator')
        )
    );

-- Grant permissions to authenticated users (RLS will enforce admin-only access)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_jobs TO authenticated;
GRANT SELECT, INSERT ON public.quality_action_logs TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE public.scheduled_jobs IS 'Stores scheduled background jobs for AI content generation and quality monitoring';
COMMENT ON TABLE public.quality_action_logs IS 'Logs all automated and manual quality actions taken on content';
COMMENT ON COLUMN public.scheduled_jobs.job_type IS 'Type: content_generation, quality_monitor, metrics_update, monthly_report';
COMMENT ON COLUMN public.scheduled_jobs.priority IS 'Job priority from 1 (lowest) to 10 (highest)';
COMMENT ON COLUMN public.quality_action_logs.automated IS 'Whether the action was performed automatically by the quality monitor';
