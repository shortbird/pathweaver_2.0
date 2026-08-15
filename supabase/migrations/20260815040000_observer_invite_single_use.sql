-- Observer invitation codes become single-use.
--
-- Until now, accepting an observer invitation deliberately did NOT consume the
-- code. routes/observer/acceptance.py said so in a comment: "codes are
-- reusable ... Multiple observers can use the same invitation link." Every
-- acceptance inserted an observer_student_links row with can_view_evidence =
-- true, and the portfolio gate (routes/observer/portfolio.py) only checks that
-- such a row EXISTS -- there is no status, no approval, and no expiry on the
-- link itself.
--
-- So one leaked link -- forwarded in a family group chat, pasted into a
-- WhatsApp thread, screenshotted, or a QR poster photographed by a passer-by
-- -- was a permanent, evidence-level grant over a minor's education record,
-- for an unbounded number of holders, with no parental re-approval. Contrast
-- parent_student_links, which carries a status and requires 'approved'.
--
-- The decision (2026-08-15): one link, one observer, seven days.
--
-- What this migration adds:
--   consumed_at         when the code was redeemed (NULL = still redeemable)
--   consumed_by_user_id which observer redeemed it
--
-- expires_at already exists and is NOT NULL; every creation path already sets
-- it to now() + 7 days. It gains a matching DEFAULT here so a future insert
-- that forgets it fails closed at 7 days rather than erroring or, worse,
-- acquiring a NULL. Enforcement of both columns lives in acceptance.py, which
-- claims the row with a conditional UPDATE (status='pending' AND consumed_at
-- IS NULL) so two observers racing the same code cannot both win.

BEGIN;

ALTER TABLE public.observer_invitations
    ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
    ADD COLUMN IF NOT EXISTS consumed_by_user_id uuid
        REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.observer_invitations.consumed_at IS
    'When this single-use code was redeemed. NULL means still redeemable. '
    'Set atomically by the accept endpoint together with status = accepted.';
COMMENT ON COLUMN public.observer_invitations.consumed_by_user_id IS
    'The observer who redeemed this code. One code, one observer.';

-- A NULL expiry must never be able to mean "forever". The column is already
-- NOT NULL, so this default is belt-and-braces for any future insert path.
ALTER TABLE public.observer_invitations
    ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');

-- Backfill 1: invitations already marked accepted are, by definition, spent.
-- accepted_at is the redemption time where we recorded one; fall back to
-- created_at so no historical row is left looking redeemable.
UPDATE public.observer_invitations
SET consumed_at = COALESCE(accepted_at, created_at, now())
WHERE status = 'accepted'
  AND consumed_at IS NULL;

-- Backfill 2: outstanding pending invitations must not silently convert into
-- permanent single-holder grants. Every one of them was minted under the old
-- reusable contract and may already be in more than one person's hands, and we
-- cannot tell which -- observer_student_links carries no invitation_id, so
-- there is no way to correlate an existing link back to the code that created
-- it and mark that code spent.
--
-- Two options were available: consume them all immediately (breaks any link a
-- parent mailed this morning, with no warning), or clamp them to a short
-- window. We clamp. 48 hours is long enough for a link sent today to still
-- work while the parent reissues, and short enough that no pre-existing code
-- outlives the week. At the time of writing exactly one pending invitation was
-- still unexpired, so the practical blast radius is one family.
--
-- After this window every outstanding old code is dead and the only way back
-- in is a fresh, single-use link -- which is the parental re-approval step
-- that was missing.
UPDATE public.observer_invitations
SET expires_at = now() + interval '48 hours'
WHERE status = 'pending'
  AND consumed_at IS NULL
  AND expires_at > now() + interval '48 hours';

-- Partial index: the accept path's claiming UPDATE filters on the unique code,
-- but the parent-facing "outstanding invitations" lists filter on
-- (invited_by_user_id, status) among unconsumed rows.
CREATE INDEX IF NOT EXISTS idx_observer_invitations_unconsumed
    ON public.observer_invitations (invited_by_user_id, expires_at)
    WHERE consumed_at IS NULL AND status = 'pending';

COMMIT;
