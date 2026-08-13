-- Create a table to log AI cycle executions (optional but useful for monitoring)
CREATE TABLE IF NOT EXISTS ai_cycle_logs (
    id SERIAL PRIMARY KEY,
    status TEXT NOT NULL,
    result JSONB,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ai_cycle_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view logs
CREATE POLICY "Admins can view AI cycle logs" ON ai_cycle_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Add an index for faster queries
CREATE INDEX idx_ai_cycle_logs_executed_at ON ai_cycle_logs(executed_at DESC);