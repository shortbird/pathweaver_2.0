-- Migration: Sync auth.users deletion when public.users is deleted
-- This ensures auth.users and public.users stay in sync automatically
-- Created: 2025-01-17

-- Create function to delete from auth.users when public.users row is deleted
CREATE OR REPLACE FUNCTION sync_auth_user_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete the corresponding auth.users record
    -- Using DELETE instead of auth.admin API since triggers run with elevated privileges
    DELETE FROM auth.users WHERE id = OLD.id;

    RAISE LOG 'Synced deletion of user % from auth.users', OLD.id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on public.users table
DROP TRIGGER IF EXISTS trigger_sync_auth_user_deletion ON public.users;

CREATE TRIGGER trigger_sync_auth_user_deletion
    AFTER DELETE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION sync_auth_user_deletion();

-- Add comment for documentation
COMMENT ON FUNCTION sync_auth_user_deletion() IS
    'Automatically deletes corresponding auth.users record when public.users row is deleted. Ensures auth and public tables stay in sync.';
