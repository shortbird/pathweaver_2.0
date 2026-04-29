-- Migration: 007_create_lti_tables.sql
-- Description: Tables backing the Canvas LTI 1.3 integration.
--   * lti_registrations  — one row per Canvas install (issuer + client_id +
--                          deployment_id) mapped to an Optio organization.
--                          Created manually by a superadmin before the
--                          institution can launch.
--   * lti_auth_codes     — one-time codes used to deliver Optio Bearer tokens
--                          to the iframe after a verified launch (clone of
--                          the proven spark_auth_codes pattern).
--   * lti_nonces         — replay-protection cache for Canvas-issued nonces.
--   * quests.lti_ags_*   — per-quest AGS line item bookkeeping.
-- Status: Required for the LTI integration. Apply via Supabase MCP after
--         superadmin review.

-- ============================================
-- Table: lti_registrations
-- ============================================
CREATE TABLE IF NOT EXISTS lti_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issuer TEXT NOT NULL,                       -- e.g. https://canvas.instructure.com
    client_id TEXT NOT NULL,                    -- Canvas Developer Key client_id
    deployment_id TEXT NOT NULL,                -- Canvas deployment_id
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    -- Platform endpoints. Canvas migrated its OIDC auth endpoint to
    -- sso.canvaslms.com, so we store it per-registration rather than hard-
    -- coding a domain.
    auth_login_url TEXT NOT NULL,               -- e.g. https://sso.canvaslms.com/api/lti/authorize_redirect
    auth_token_url TEXT NOT NULL,               -- e.g. https://sso.canvaslms.com/login/oauth2/token
    public_jwks_url TEXT NOT NULL,              -- e.g. https://sso.canvaslms.com/api/lti/security/jwks
    notes TEXT,                                 -- free-form admin notes (e.g. school name)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT lti_registrations_unique UNIQUE (issuer, client_id, deployment_id)
);

CREATE INDEX IF NOT EXISTS idx_lti_registrations_org ON lti_registrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_lti_registrations_active ON lti_registrations(is_active);

-- RLS: only superadmin reads/writes (enforced via routes; admin client used
-- in handlers).
ALTER TABLE lti_registrations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Table: lti_auth_codes
-- One-time codes issued after a verified LTI launch. The iframe redirects to
-- the frontend with the code; the frontend exchanges it via POST /lti/token
-- for Optio Bearer tokens. 60-second expiry, single use.
-- ============================================
CREATE TABLE IF NOT EXISTS lti_auth_codes (
    code TEXT PRIMARY KEY,                      -- secrets.token_urlsafe(32)
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id UUID REFERENCES quests(id) ON DELETE SET NULL,  -- target quest (deep-link launches)
    target_path TEXT,                           -- frontend route to load after token exchange
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lti_auth_codes_user ON lti_auth_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_lti_auth_codes_expires ON lti_auth_codes(expires_at);

-- ============================================
-- Table: lti_nonces
-- Cache of Canvas-issued nonces from launch JWTs, kept long enough to detect
-- replay attempts (id_tokens are valid for ~5 min in Canvas).
-- ============================================
CREATE TABLE IF NOT EXISTS lti_nonces (
    nonce TEXT PRIMARY KEY,
    issuer TEXT NOT NULL,
    seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lti_nonces_expires ON lti_nonces(expires_at);

-- ============================================
-- Quest columns for AGS line item tracking
-- ============================================
ALTER TABLE quests
    ADD COLUMN IF NOT EXISTS lti_ags_lineitem_url TEXT,
    ADD COLUMN IF NOT EXISTS lti_ags_lineitem_id TEXT,
    ADD COLUMN IF NOT EXISTS lti_registration_id UUID REFERENCES lti_registrations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quests_lti_registration ON quests(lti_registration_id);

-- ============================================
-- Cleanup function for expired one-time codes and nonces.
-- Call from a cron / scheduled task (out of scope for this migration).
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_expired_lti_artifacts()
RETURNS TABLE(codes_deleted INTEGER, nonces_deleted INTEGER) AS $$
DECLARE
    c INTEGER;
    n INTEGER;
BEGIN
    DELETE FROM lti_auth_codes WHERE expires_at < NOW() OR used = TRUE;
    GET DIAGNOSTICS c = ROW_COUNT;

    DELETE FROM lti_nonces WHERE expires_at < NOW();
    GET DIAGNOSTICS n = ROW_COUNT;

    RETURN QUERY SELECT c, n;
END;
$$ LANGUAGE plpgsql;
