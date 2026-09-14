-- Monthly program pricing on the registration funnel (Optio Academy).
--
-- Optio Academy charges no registration fee. It charges $50 per student each
-- month, capped at $150 per family, and offers an Optio teacher as a $500 per
-- month add-on per student that includes that student's program fee. The
-- funnel's last step is now "set up your monthly payment" for orgs whose
-- registration config carries a `monthly` block (services/registration_pricing).
--
-- fee_cents keeps meaning the one-time registration fee. The month is priced
-- separately so the waitlist refund, the waive-fee button and the prepaid
-- directive -- all of which reason about fee_cents -- are untouched.
--
-- The per-student add-on choice lives inside the existing kids jsonb
-- (kids[i].add_ons), next to the student it was made for. No column for it.

alter table public.registrations
  add column if not exists monthly_cents integer,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_customer_id text;

comment on column public.registrations.monthly_cents is
  'What the family pays each month under the org''s monthly plan (program fee after the family cap, plus chosen add-ons). Null/0 for orgs without one. The one-time fee is fee_cents.';
comment on column public.registrations.stripe_subscription_id is
  'The Stripe Subscription (on the school''s own account) that /confirm-payment verified for a monthly-plan registration. Optio records it and does not manage it.';
comment on column public.registrations.stripe_customer_id is
  'The Stripe Customer the subscription belongs to, on the school''s account.';
