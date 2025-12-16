-- Migration: Add last_logout_at timestamp for session invalidation
-- This allows us to invalidate all tokens issued before logout

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS last_logout_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add index for performance when checking logout timestamps
CREATE INDEX IF NOT EXISTS idx_users_last_logout_at ON public.users(last_logout_at);

COMMENT ON COLUMN public.users.last_logout_at IS 'Timestamp of last logout - used to invalidate tokens issued before this time';
