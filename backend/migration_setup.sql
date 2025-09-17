-- Migration setup script
-- Creates the migration_log table if it doesn't exist
-- This is a prerequisite for other migration scripts

-- Create migration_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS migration_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    migration_name VARCHAR(255) UNIQUE NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment
COMMENT ON TABLE migration_log IS 'Tracks database migrations that have been executed';

-- Insert initial migration record
INSERT INTO migration_log (migration_name, executed_at, description)
VALUES (
    'migration_setup_v1',
    NOW(),
    'Created migration_log table for tracking database migrations'
) ON CONFLICT (migration_name) DO NOTHING;

SELECT 'Migration log table setup complete' as status;