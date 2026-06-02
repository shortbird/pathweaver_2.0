-- Allows admin code to set a user's password without going through Supabase Auth's
-- HIBP / leaked-password check. Used by the admin password reset flow so the
-- default "changeme!" temporary password can be applied.
--
-- Writes directly to auth.users.encrypted_password using pgcrypto's bcrypt
-- (matches the format Supabase Auth issues) and clears refresh tokens so
-- existing sessions can't keep using the old credentials.

CREATE OR REPLACE FUNCTION public.admin_set_user_password(
  target_user_id uuid,
  new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found in auth.users', target_user_id;
  END IF;

  DELETE FROM auth.refresh_tokens WHERE user_id = target_user_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_password(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_password(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(uuid, text) TO service_role;
