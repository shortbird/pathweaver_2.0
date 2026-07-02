-- Verified registration-fee payments via the school's OWN Stripe account.
-- The backend creates a Checkout Session with the org's restricted API key
-- (feature_flags.icreate_registration.stripe_secret_key) and, on return,
-- verifies payment server-side by retrieving the session from Stripe
-- (payment_status=paid + amount + registration metadata). Optio never holds
-- funds — the merchant is the school. Per-org keys scale to future schools;
-- Stripe Connect is the upgrade path if that outgrows itself.

alter table public.icreate_registrations
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_ref text,
  add column if not exists fee_paid_at timestamptz;
