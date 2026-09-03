-- Account deletion has never completed. Two blockers, both reported by GoTrue
-- as the same opaque "Database error deleting user".
--
-- 2026-08-27, Sentry OPTIO-BACKEND-75 / -76. The nightly sweep has been
-- retrying one iCreate parent since 2026-08-24. 20260825175157 removed the
-- first blocker (class_enrollments.enrolled_by) and the sweep moved on to the
-- next one, which is where this migration starts. Both were found by running
-- the real DELETE inside a rolled-back transaction on production and reading
-- the error the API layer never sees.
--
-- ---------------------------------------------------------------------------
-- Blocker 1: student_access_logs.accessor_id is NOT NULL with ON DELETE SET NULL
-- ---------------------------------------------------------------------------
--   ERROR 23502: null value in column "accessor_id" of relation
--                "student_access_logs" violates not-null constraint
--   CONTEXT: UPDATE ONLY "public"."student_access_logs"
--            SET "accessor_id" = NULL WHERE $1 = "accessor_id"
--
-- The FK already says SET NULL -- someone decided the FERPA disclosure row must
-- outlive the accessor's account, which is right: the row's subject is
-- `student_id` (that FK cascades), and `accessor_id` is metadata about who
-- looked. But SET NULL cannot fire into a NOT NULL column, so the constraint
-- and the FK have been contradicting each other, and the FK loses at runtime.
-- This is the only such contradiction in the database (every FK with
-- confdeltype='n' checked against attnotnull, 2026-08-27).
--
-- It blocks the erasure of ANY account that ever viewed a student's records --
-- every parent, advisor, observer and admin on the platform.
--
-- Second bug, same cause: AccessLogger passes accessor_id=None for public and
-- system access (utils/access_logger.py, which sets accessor_role='public' /
-- 'system' for exactly that case). Those inserts have always failed the NOT
-- NULL and been swallowed by the handler, so unauthenticated disclosures were
-- never recorded at all. The readers already expect null -- get_access_summary_
-- by_accessor buckets it as 'public', ferpa_compliance leaves accessor_info
-- None -- so nothing downstream needs to change.

ALTER TABLE public.student_access_logs
  ALTER COLUMN accessor_id DROP NOT NULL;

COMMENT ON COLUMN public.student_access_logs.accessor_id IS
  'Who read the student record. NULL means either an unauthenticated/system '
  'read (accessor_role says which) or an accessor whose account has since been '
  'erased -- the FK is ON DELETE SET NULL because the disclosure record belongs '
  'to the student and must outlive the reader''s account. Never re-add NOT NULL: '
  'it makes every accessor undeletable (Sentry OPTIO-BACKEND-75/76).';

-- ---------------------------------------------------------------------------
-- Blocker 2: two triggers delete each other's rows
-- ---------------------------------------------------------------------------
--   ERROR 27000: tuple to be deleted was already modified by an operation
--                triggered by the current command
--
-- The loop, both halves predating the baseline:
--
--   DELETE FROM auth.users
--     -> on_auth_user_delete            BEFORE DELETE ON auth.users
--        -> cleanup_user_data()         DELETE FROM public.users WHERE id = OLD.id
--           -> trigger_sync_auth_user_deletion  AFTER DELETE ON public.users
--              -> sync_auth_user_deletion()     DELETE FROM auth.users WHERE id = OLD.id
--                                               ^ re-enters the tuple the outer
--                                                 command is already deleting
--
-- So this fired on EVERY account deletion, for every user who still had a
-- public.users row -- which is every user. It is not specific to the accounts
-- in the Sentry issue; verified against a second, unrelated pending account.
--
-- The guard, not removal: the two directions are not symmetrical. Deleting the
-- public.users row directly (an admin in the SQL editor, a stray service call)
-- SHOULD still take the auth account with it, or the person keeps a working
-- login with no profile behind it. pg_trigger_depth() > 1 means this delete was
-- itself triggered -- by cleanup_user_data or by the FK cascade off
-- auth.users -- and in that case the auth row is already on its way out.

CREATE OR REPLACE FUNCTION public.sync_auth_user_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Depth > 1: the public.users row is being removed BY the auth.users
    -- delete (cleanup_user_data, or the ON DELETE CASCADE off auth.users).
    -- Deleting auth.users again from in here re-enters a tuple the current
    -- command already has open, which Postgres refuses with 27000 -- and the
    -- whole deletion fails. The auth row is already going; nothing to sync.
    IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;

    -- Reached only when something deleted public.users on its own.
    DELETE FROM auth.users WHERE id = OLD.id;

    RAISE LOG 'Synced deletion of user % from auth.users', OLD.id;

    RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION public.sync_auth_user_deletion() IS
  'Deletes the auth.users row when a public.users row is deleted on its own. '
  'The pg_trigger_depth() guard is load-bearing: without it this re-enters the '
  'auth.users delete that triggered it and every account deletion fails with '
  'SQLSTATE 27000 (Sentry OPTIO-BACKEND-75/76).';
