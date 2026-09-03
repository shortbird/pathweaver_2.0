-- Migration: Add apple_user_id column to users for Sign in with Apple linking.
-- Date: 2026-04-14

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_apple_user_id ON users(apple_user_id) WHERE apple_user_id IS NOT NULL;
COMMENT ON COLUMN users.apple_user_id IS 'Apple Sign in user identifier for account linking.';

COMMIT;
