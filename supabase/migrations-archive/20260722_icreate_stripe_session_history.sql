-- iCreate registration fee: track EVERY Stripe Checkout Session created for a
-- registration, not just the latest. A parent who clicks Pay twice (double
-- tab / impatient re-click) can pay the FIRST session while the second
-- overwrites stripe_session_id — payment verification then checks the unpaid
-- session forever and a completed $125 payment looks missing (Keely Pogue,
-- 2026-07-22). confirm_payment now walks this history (and falls back to a
-- metadata search of the school's recent sessions on Stripe).
ALTER TABLE icreate_registrations
    ADD COLUMN IF NOT EXISTS stripe_session_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN icreate_registrations.stripe_session_ids IS
    'History of Stripe Checkout Session ids created for this registration (latest last, capped at 10 by the app). stripe_session_id remains the most recent.';
