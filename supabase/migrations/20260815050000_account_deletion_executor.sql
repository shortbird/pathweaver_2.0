-- Account deletion executor: make the 30-day scheduled deletion actually run.
--
-- `POST /api/users/delete-account` has been writing users.deletion_status =
-- 'pending' with a deletion_scheduled_for date since it shipped, and nothing
-- ever read those columns again. The executor lives in
-- backend/services/account_deletion_service.py and is dispatched daily by
-- backend/jobs/cron_dispatch.py. This migration gives it the two things it
-- needs from the schema: somewhere to record a failed attempt, and an audit log
-- that can outlive the user it describes.

-- 1. Retry bookkeeping.
--    A failed erasure deliberately STAYS 'pending' (so the next sweep retries
--    it) rather than moving to a terminal status nothing re-reads — which is
--    exactly how this feature came to be dead code in the first place. These
--    columns are how an operator sees a stuck account instead of guessing.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS deletion_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deletion_last_attempt_at timestamptz,
    ADD COLUMN IF NOT EXISTS deletion_last_error text;

COMMENT ON COLUMN public.users.deletion_attempts IS
    'Failed erasure attempts by the deletion sweep. >0 with deletion_status=''pending'' means an account is stuck and needs a look.';
COMMENT ON COLUMN public.users.deletion_last_error IS
    'Last failure from the deletion sweep. Cleared when the user cancels.';

-- 2. The sweep''s only query: pending accounts whose date has passed.
--    Partial index — pending deletions are a vanishing fraction of users.
CREATE INDEX IF NOT EXISTS idx_users_deletion_pending
    ON public.users (deletion_scheduled_for)
    WHERE deletion_status = 'pending';

-- 3. Let the deletion audit log survive the deletion.
--
--    account_deletion_log.user_id was NOT NULL REFERENCES users(id) with ON
--    DELETE NO ACTION, so the very row written to record a deletion request
--    BLOCKED the eventual delete of that user. The old permanent-delete route
--    swallowed the resulting foreign-key error and returned "account
--    permanently deleted" while the users row was still sitting there.
--
--    The compliance record has to outlive the account, so the FK goes and the
--    uuid stays as a historical reference to a user that no longer exists.
ALTER TABLE public.account_deletion_log
    DROP CONSTRAINT IF EXISTS account_deletion_log_user_id_fkey;

COMMENT ON COLUMN public.account_deletion_log.user_id IS
    'ID of the deleted user. Intentionally NOT a foreign key: this audit row outlives the user row it describes.';
