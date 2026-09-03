-- Remember what the client looked like at the last rotation, so a replay can
-- be told from a race.
--
-- Sentry OPTIO-BACKEND-6N: 27 refresh-token families revoked for reuse across
-- 22 distinct users in 10 days. Every one of them signs a real person out of
-- everything, and the event carried nothing that could separate the two causes
-- that produce it:
--
--   * an honest client that never received the rotation's response and retried
--     the only token it holds (same device, same chain, just late), and
--   * a stolen token replayed from somewhere else (different device entirely).
--
-- The distinguishing fact is whether the replay came from the same client as
-- the rotation it is replaying, and nothing was remembering that. The rest of
-- the diagnosis (which jti was presented, how stale it was, how old the family
-- is) is derivable at reuse time and now goes into the Sentry event; only this
-- one needs to be written down in advance.
--
-- What is stored is NOT the user agent or the IP. It is
-- sha256(family_id || user_agent || ip) truncated to 16 hex characters:
--
--   * salted with the family id, so it is comparable only WITHIN one chain --
--     which is the question being asked ("same client as last time?") and
--     nothing more. It deliberately cannot be used to follow a device between
--     users or sessions.
--   * one-way and truncated, so the credential table gains a comparison key
--     rather than a second copy of anyone's network identity.
--
-- Nullable on purpose: it is written on a best-effort basis (there is no
-- request context in some paths), and a family with no fingerprint just reports
-- same_client='unknown' instead of blocking a refresh.

ALTER TABLE public.refresh_token_families
  ADD COLUMN IF NOT EXISTS last_client_fp text;

COMMENT ON COLUMN public.refresh_token_families.last_client_fp IS
  'Per-family salted hash of (user agent + IP) as of the last rotation: '
  'sha256(family_id || ua || ip) truncated to 16 hex chars. Comparable only '
  'within this family, by design. Used to tell a replay from a race when a '
  'reuse is detected (Sentry OPTIO-BACKEND-6N). Not an identifier, not PII to '
  'read back -- never join or report on it across families.';
