-- Migration: Create spark_auth_codes table for OAuth 2.0 authorization code flow
-- Date: 2025-01-05
-- Purpose: Store one-time authorization codes for Spark LMS SSO integration
--
-- This table supports the OAuth 2.0 authorization code flow used in Spark SSO.
-- Authorization codes are short-lived (60 seconds) and single-use to prevent
-- replay attacks and ensure secure token exchange.

CREATE TABLE IF NOT EXISTS spark_auth_codes (
    -- Primary authorization code (cryptographically secure, 32-byte URL-safe string)
    code TEXT PRIMARY KEY,

    -- User this code is issued to
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Expiration timestamp (60 seconds from creation)
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Whether code has been used (prevents replay attacks)
    used BOOLEAN DEFAULT FALSE NOT NULL,

    -- Timestamp of code creation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Index for efficient lookup by user_id
CREATE INDEX IF NOT EXISTS idx_spark_auth_codes_user_id
ON spark_auth_codes(user_id);

-- Index for efficient cleanup of expired codes
CREATE INDEX IF NOT EXISTS idx_spark_auth_codes_expires
ON spark_auth_codes(expires_at)
WHERE used = FALSE;

-- Index for efficient validation queries
CREATE INDEX IF NOT EXISTS idx_spark_auth_codes_code_used
ON spark_auth_codes(code, used, expires_at);

-- Comment on table
COMMENT ON TABLE spark_auth_codes IS 'OAuth 2.0 authorization codes for Spark LMS SSO integration';
COMMENT ON COLUMN spark_auth_codes.code IS 'One-time authorization code (32-byte URL-safe string)';
COMMENT ON COLUMN spark_auth_codes.user_id IS 'User this code was issued to';
COMMENT ON COLUMN spark_auth_codes.expires_at IS 'Expiration timestamp (60 seconds from creation)';
COMMENT ON COLUMN spark_auth_codes.used IS 'Whether code has been exchanged for tokens (prevents replay)';
COMMENT ON COLUMN spark_auth_codes.created_at IS 'Timestamp when code was created';

-- Optional: Create cleanup function to remove expired codes
-- This can be run periodically via cron job or manually
CREATE OR REPLACE FUNCTION cleanup_expired_spark_auth_codes()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM spark_auth_codes
    WHERE expires_at < NOW() - INTERVAL '1 hour';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_spark_auth_codes() IS 'Cleanup function to remove expired authorization codes older than 1 hour';
