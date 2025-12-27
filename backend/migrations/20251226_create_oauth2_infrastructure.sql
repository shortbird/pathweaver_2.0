-- Migration: Create OAuth 2.0 infrastructure for LMS integrations
-- Date: 2025-12-26
-- Purpose: Enable OAuth 2.0 authorization code flow for external systems (Canvas, Moodle, etc.)

-- Create oauth_clients table
CREATE TABLE IF NOT EXISTS oauth_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id TEXT NOT NULL UNIQUE,
    client_secret TEXT NOT NULL, -- SHOULD BE HASHED in production
    name TEXT NOT NULL,
    redirect_uris TEXT[] NOT NULL, -- Array of allowed redirect URIs
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_client_id CHECK (length(client_id) >= 16),
    CONSTRAINT valid_client_secret CHECK (length(client_secret) >= 32),
    CONSTRAINT at_least_one_redirect_uri CHECK (array_length(redirect_uris, 1) > 0)
);

-- Create oauth_authorization_codes table (short-lived codes for exchange)
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redirect_uri TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'read',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_authorization_code CHECK (length(code) >= 32)
);

-- Create oauth_tokens table (access and refresh tokens)
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    access_token TEXT NOT NULL, -- SHA-256 hash of actual token
    refresh_token TEXT NOT NULL, -- SHA-256 hash of actual token
    client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL DEFAULT 'read',
    access_token_expires_at TIMESTAMPTZ NOT NULL,
    refresh_token_expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT valid_access_token CHECK (length(access_token) >= 32),
    CONSTRAINT valid_refresh_token CHECK (length(refresh_token) >= 32)
);

-- Create indexes for oauth_clients
CREATE INDEX idx_oauth_clients_client_id ON oauth_clients(client_id) WHERE is_active = TRUE;
CREATE INDEX idx_oauth_clients_created_by ON oauth_clients(created_by);

-- Create indexes for oauth_authorization_codes
CREATE INDEX idx_oauth_authz_codes_code ON oauth_authorization_codes(code);
CREATE INDEX idx_oauth_authz_codes_client ON oauth_authorization_codes(client_id, expires_at);
CREATE INDEX idx_oauth_authz_codes_user ON oauth_authorization_codes(user_id);
CREATE INDEX idx_oauth_authz_codes_expires ON oauth_authorization_codes(expires_at);

-- Create indexes for oauth_tokens
CREATE INDEX idx_oauth_tokens_access ON oauth_tokens(access_token) WHERE NOT revoked;
CREATE INDEX idx_oauth_tokens_refresh ON oauth_tokens(refresh_token) WHERE NOT revoked;
CREATE INDEX idx_oauth_tokens_client ON oauth_tokens(client_id, revoked);
CREATE INDEX idx_oauth_tokens_user ON oauth_tokens(user_id, revoked);
CREATE INDEX idx_oauth_tokens_expires ON oauth_tokens(access_token_expires_at, revoked);

-- Create function to clean up expired authorization codes
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_codes()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM oauth_authorization_codes
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM oauth_tokens
    WHERE refresh_token_expires_at < NOW()
    OR revoked = TRUE;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_oauth_client_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER oauth_client_updated_at
    BEFORE UPDATE ON oauth_clients
    FOR EACH ROW
    EXECUTE FUNCTION update_oauth_client_updated_at();

-- Add RLS policies for oauth_clients
ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;

-- Admins can view all OAuth clients
CREATE POLICY oauth_clients_admin_select ON oauth_clients
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM users
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Admins can insert OAuth clients
CREATE POLICY oauth_clients_admin_insert ON oauth_clients
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM users
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Admins can update OAuth clients
CREATE POLICY oauth_clients_admin_update ON oauth_clients
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM users
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Admins can delete OAuth clients
CREATE POLICY oauth_clients_admin_delete ON oauth_clients
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM users
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Add RLS policies for oauth_authorization_codes (system use only)
ALTER TABLE oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

-- System operations only (no user access)
CREATE POLICY oauth_authz_codes_system_only ON oauth_authorization_codes
    FOR ALL
    USING (FALSE);

-- Add RLS policies for oauth_tokens
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Users can view their own tokens
CREATE POLICY oauth_tokens_user_select ON oauth_tokens
    FOR SELECT
    USING (user_id = auth.uid());

-- Admins can view all tokens
CREATE POLICY oauth_tokens_admin_select ON oauth_tokens
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM users
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Users can revoke their own tokens
CREATE POLICY oauth_tokens_user_revoke ON oauth_tokens
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (revoked = TRUE);

-- Add comments for documentation
COMMENT ON TABLE oauth_clients IS 'OAuth 2.0 client applications registered for API access (LMS integrations, etc.)';
COMMENT ON TABLE oauth_authorization_codes IS 'Short-lived authorization codes for OAuth 2.0 code exchange flow';
COMMENT ON TABLE oauth_tokens IS 'OAuth 2.0 access and refresh tokens for authenticated API access';

COMMENT ON COLUMN oauth_clients.client_secret IS 'SECURITY: Should be hashed with bcrypt in production, NOT stored in plain text';
COMMENT ON COLUMN oauth_clients.redirect_uris IS 'Allowed redirect URIs for this client (CSRF protection)';
COMMENT ON COLUMN oauth_authorization_codes.code IS 'One-time use authorization code, expires in 10 minutes';
COMMENT ON COLUMN oauth_tokens.access_token IS 'SHA-256 hash of JWT access token (not the actual token)';
COMMENT ON COLUMN oauth_tokens.refresh_token IS 'SHA-256 hash of refresh token (not the actual token)';
COMMENT ON COLUMN oauth_tokens.scope IS 'Permissions granted to this token (e.g., "read", "write", "read write")';

-- Create cleanup job documentation
COMMENT ON FUNCTION cleanup_expired_oauth_codes IS 'Should be run via cron job every 15 minutes to remove expired authorization codes';
COMMENT ON FUNCTION cleanup_expired_oauth_tokens IS 'Should be run via cron job daily to remove expired/revoked tokens';
