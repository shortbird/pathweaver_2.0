-- Migration: Create device_tokens table
-- Purpose: Store Firebase Cloud Messaging registration tokens for push notifications
-- Date: March 2026

-- ============================================
-- Part 1: device_tokens table
-- ============================================

CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    device_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_token UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_is_active ON device_tokens(is_active) WHERE is_active = true;

COMMENT ON TABLE device_tokens IS 'FCM registration tokens for push notifications. Users can have multiple tokens (multiple devices).';
COMMENT ON COLUMN device_tokens.token IS 'Firebase Cloud Messaging registration token. Rotated periodically by FCM.';
COMMENT ON COLUMN device_tokens.is_active IS 'Set to false when token is invalidated (logout, FCM rotation). Cleaned up periodically.';

-- ============================================
-- Part 2: RLS Policies
-- ============================================

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on device_tokens"
    ON device_tokens FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Users can manage their own device tokens
CREATE POLICY "Users can view own tokens"
    ON device_tokens FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can register tokens"
    ON device_tokens FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own tokens"
    ON device_tokens FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own tokens"
    ON device_tokens FOR DELETE
    USING (user_id = auth.uid());
