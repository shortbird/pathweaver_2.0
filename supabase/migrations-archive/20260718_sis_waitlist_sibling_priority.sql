-- Enrollment waitlist: sibling priority + pay-upfront/refundable fee
-- (iCreate; "younger kids waitlisted while older siblings are accepted" —
-- 2026-07-18).
--
-- Three changes, all on top of 20260715_sis_enrollment_waitlist.sql:
--
-- 1. A 'rejected' terminal state. Until now a waiting student could only be
--    'released' (accepted). When the school decides a waitlisted child will
--    NOT be offered a spot, staff reject them, which refunds that child's
--    share of the family's registration fee.
--
-- 2. Refund bookkeeping. The registration fee is now paid UP FRONT even for
--    waitlisted kids (it holds their place and is refunded if they aren't
--    accepted). Refunds are per-child but the Stripe charge is per-family, so
--    we track cumulative cents refunded on the registration and the per-entry
--    refund on the waitlist row.
--
-- 3. A priority cutoff. Sibling priority reorders the waitlist for FUTURE
--    registrations only — everyone already waiting keeps their exact spot
--    ("freeze the live waitlist"). The cutoff is the instant this ships; the
--    ordering code treats rows created before it as a frozen prefix.

-- 1. Reject state ------------------------------------------------------------
ALTER TABLE sis_enrollment_waitlist
  DROP CONSTRAINT IF EXISTS sis_enrollment_waitlist_status_check;
ALTER TABLE sis_enrollment_waitlist
  ADD CONSTRAINT sis_enrollment_waitlist_status_check
  CHECK (status IN ('waiting', 'released', 'rejected'));

-- 2. Refund bookkeeping ------------------------------------------------------
ALTER TABLE sis_enrollment_waitlist
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_cents integer,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text;

ALTER TABLE icreate_registrations
  -- Cumulative cents refunded against this family's single Stripe charge, so
  -- rejecting several kids over time can never refund more than was paid.
  ADD COLUMN IF NOT EXISTS refunded_cents integer NOT NULL DEFAULT 0,
  -- When the family acknowledged the hold-your-place / fully-refundable terms
  -- for a fee that includes waitlisted kids.
  ADD COLUMN IF NOT EXISTS waitlist_refund_ack_at timestamptz;

-- 3. Priority cutoff ---------------------------------------------------------
-- Stamp every org that gates an age band with the moment sibling priority
-- turns on. Rows already waiting (created before this) are the frozen prefix;
-- only registrations after it are reordered by sibling priority. Idempotent —
-- never overwrites an existing stamp.
UPDATE organizations
SET feature_flags = jsonb_set(
      feature_flags,
      '{sis_settings,enrollment_waitlist_priority_since}',
      to_jsonb(now())
    )
WHERE feature_flags -> 'sis_settings' -> 'enrollment_age_gates' IS NOT NULL
  AND (feature_flags -> 'sis_settings' ->> 'enrollment_waitlist_priority_since') IS NULL;
