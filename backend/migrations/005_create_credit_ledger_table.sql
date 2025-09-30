-- Migration: Create credit_ledger table
-- Description: Track credits derived from XP (1000 XP = 1 credit)
-- Date: 2025-09-30

CREATE TABLE IF NOT EXISTS credit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES quest_tasks(id) ON DELETE CASCADE,
    credit_type VARCHAR(100) NOT NULL,
    xp_amount INT NOT NULL,
    credits_earned DECIMAL(5,2) NOT NULL,
    date_earned TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    academic_year INT NOT NULL,
    CONSTRAINT credits_earned_valid CHECK (credits_earned >= 0)
);

-- Create indexes for performance
CREATE INDEX idx_credit_ledger_user ON credit_ledger(user_id);
CREATE INDEX idx_credit_ledger_user_year ON credit_ledger(user_id, academic_year);
CREATE INDEX idx_credit_ledger_credit_type ON credit_ledger(user_id, credit_type);
CREATE INDEX idx_credit_ledger_date ON credit_ledger(date_earned DESC);
CREATE INDEX idx_credit_ledger_quest ON credit_ledger(quest_id);
CREATE INDEX idx_credit_ledger_task ON credit_ledger(task_id);

-- Add RLS policies
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own credit ledger
CREATE POLICY credit_ledger_select_policy ON credit_ledger
    FOR SELECT
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('advisor', 'admin')
        )
    );

-- Policy: Only system can insert credits (via service/trigger)
CREATE POLICY credit_ledger_insert_policy ON credit_ledger
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Add comments for documentation
COMMENT ON TABLE credit_ledger IS 'Tracks academic credits derived from XP (1000 XP = 1 credit)';
COMMENT ON COLUMN credit_ledger.credit_type IS 'Subject area: math, science, english, etc.';
COMMENT ON COLUMN credit_ledger.xp_amount IS 'Source XP earned for this task';
COMMENT ON COLUMN credit_ledger.credits_earned IS 'Calculated: xp_amount / 1000';
COMMENT ON COLUMN credit_ledger.academic_year IS 'Year for transcript organization';

-- Create view for easy credit summaries
CREATE OR REPLACE VIEW user_credit_summary AS
SELECT
    user_id,
    credit_type,
    academic_year,
    SUM(credits_earned) as total_credits,
    SUM(xp_amount) as total_xp,
    COUNT(*) as task_count
FROM credit_ledger
GROUP BY user_id, credit_type, academic_year;

-- Grant access to the view
GRANT SELECT ON user_credit_summary TO authenticated;
