-- Migration: Create xp_award_failures table
-- Purpose: Track failed XP awards for later reconciliation
-- Date: February 2026

-- Create the xp_award_failures table to track when XP awards fail
-- This allows admins to retry failed awards and ensures no XP is lost
CREATE TABLE IF NOT EXISTS xp_award_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES user_quest_tasks(id) ON DELETE SET NULL,
    pillar TEXT NOT NULL,
    xp_amount INTEGER NOT NULL CHECK (xp_amount > 0),
    reason TEXT,
    processed_at TIMESTAMPTZ,  -- NULL until the award is retried successfully
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_xp_award_failures_user_id
    ON xp_award_failures(user_id);

CREATE INDEX IF NOT EXISTS idx_xp_award_failures_unprocessed
    ON xp_award_failures(processed_at)
    WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_xp_award_failures_created_at
    ON xp_award_failures(created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE xp_award_failures IS
    'Tracks XP award failures for later reconciliation. Records are created when xp_service.award_xp() fails during task completion.';

COMMENT ON COLUMN xp_award_failures.processed_at IS
    'Set when the failed award is successfully retried. NULL indicates pending retry.';

-- Grant appropriate permissions (adjust as needed for your RLS setup)
-- Using service role for admin operations
ALTER TABLE xp_award_failures ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read/write xp_award_failures
-- (Access is through admin endpoints that use service role key)
CREATE POLICY "Service role full access on xp_award_failures"
    ON xp_award_failures
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
