-- Migration: notification_preferences table
-- Purpose: Per-user, per-type notification opt-outs for mobile Settings UI.
-- Date: 2026-04-14

BEGIN;

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_type UNIQUE (user_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id);

COMMENT ON TABLE notification_preferences IS 'Per-user, per-type notification opt-outs. Absence of row means default (enabled).';

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on notification_preferences"
    ON notification_preferences FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Users manage own notification preferences"
    ON notification_preferences FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

COMMIT;
