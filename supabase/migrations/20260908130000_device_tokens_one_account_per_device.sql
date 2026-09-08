-- One device, one account: an Expo push token may be active for exactly one user.
--
-- The bug (found 2026-09-08, reported as "I'm getting mobile app notifications
-- about messages sent for iCreate on my superadmin account"):
--
-- routes/push_subscriptions.register_expo_token upserted on (user_id, token)
-- and never touched the same token's rows for OTHER users. Logout deactivates
-- only the leaving user's row, and logout does not always run — the app is
-- killed, the session expires, the account is switched from the login screen.
--
-- So every account ever signed in on a phone accumulated an active row for that
-- phone's token. Tanner signs into members' accounts on his own device to
-- reproduce their bugs; his phone had five active accounts on one token,
-- including an iCreate campus coordinator and an iCreate parent. expo_push_
-- service fans a notification out to every active token for the target user, so
-- his phone was buzzing for other people's messages.
--
-- That is worse than noise. The push body carries a 50-character preview of the
-- message, so a coordinator's and a parent's messages were being delivered to a
-- device neither of them was using. Same shape in reverse for anyone who ever
-- signed in on a shared or borrowed phone.
--
-- Two parts, and the index is the point: the application fix alone would have
-- been re-breakable by the next writer of this table.

-- Measured before writing this (2026-09-08): 177 active rows over 156 distinct
-- tokens, so 29 rows lose their claim. The people whose rows are cleared here
-- each still hold an active token for their OWN phone — the row being cleared
-- is the one created when somebody else signed in as them on a borrowed
-- device, which was never delivering to them in the first place.
--
-- 1. Historical cleanup. Latest registration wins: nothing writes
--    device_tokens.last_used_at (it is equal to created_at on every row in
--    production), so it reads as "when this account last registered this
--    device", which is exactly the right tiebreak. COALESCE anyway, because
--    the column is nullable and a future writer may start updating it.
--
--    The survivor can still be the wrong account on a device that was used for
--    support sign-ins — it is whoever signed in last, not whoever owns the
--    phone. That corrects itself the first time the real owner opens the app:
--    registration now claims the token for them (routes/push_subscriptions).
WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY token
               ORDER BY COALESCE(last_used_at, created_at) DESC NULLS LAST, id DESC
           ) AS rn
    FROM public.device_tokens
    WHERE is_active
)
UPDATE public.device_tokens
   SET is_active = false
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Make it unrepeatable. Registration must deactivate the other holders of a
--    token before it upserts its own row, or it gets a unique violation.
CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_one_active_account_per_token
    ON public.device_tokens (token)
    WHERE is_active;

COMMENT ON INDEX public.device_tokens_one_active_account_per_token IS
  'A push token addresses a physical device, and a device has one signed-in account. Two active rows for one token means one person receives another person message previews.';
