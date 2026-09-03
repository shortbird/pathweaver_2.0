-- Migration: H7 — Per-account lockout backoff + per-email password reset throttle
-- Date: 2026-04-13
-- Purpose:
--   1. Add `lockout_count` to `login_attempts` so exponential backoff persists across
--      successful logins (`reset_login_attempts` only clears attempt_count + locked_until).
--   2. Create `password_reset_attempts` to apply the same lockout pattern to
--      /api/auth/forgot-password, which previously had only per-IP rate limiting.

-- ── 1. login_attempts: add lockout_count ─────────────────────────────────────
ALTER TABLE login_attempts
    ADD COLUMN IF NOT EXISTS lockout_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN login_attempts.lockout_count IS
    'Total times this account has been locked out. Drives exponential backoff: '
    'lockout duration = base * 2^(lockout_count - 1), capped at 24h. '
    'Persists across reset_login_attempts so backoff cannot be reset by guessing correctly.';

-- ── 2. password_reset_attempts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    lockout_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_attempts_email
    ON password_reset_attempts(email);

COMMENT ON TABLE password_reset_attempts IS
    'Per-email rate limiting + lockout for /api/auth/forgot-password to prevent '
    'targeted reset-email flooding (separate from per-IP @rate_limit on the route).';
COMMENT ON COLUMN password_reset_attempts.lockout_count IS
    'Same exponential-backoff semantics as login_attempts.lockout_count.';

-- RLS: service role only (mirrors login_attempts policy)
ALTER TABLE password_reset_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "password_reset_attempts_service_role_only"
    ON password_reset_attempts
    FOR ALL
    USING (auth.role() = 'service_role');
