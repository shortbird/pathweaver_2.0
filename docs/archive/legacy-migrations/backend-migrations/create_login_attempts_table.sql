-- Migration: Create login_attempts table for account lockout mechanism
-- Date: 2025-01-22
-- Purpose: Track failed login attempts and implement account lockout after 5 failed attempts

-- Create login_attempts table
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    attempt_count INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups by email
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);

-- Add comments for documentation
COMMENT ON TABLE login_attempts IS 'Tracks failed login attempts for account lockout mechanism';
COMMENT ON COLUMN login_attempts.locked_until IS 'Account is locked until this timestamp';
COMMENT ON COLUMN login_attempts.attempt_count IS 'Number of failed login attempts';

-- Enable Row Level Security
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only service role can manage login attempts
CREATE POLICY "Service role only" ON login_attempts
    FOR ALL
    USING (auth.role() = 'service_role');
