-- Whether a family plans to pay tuition in full or monthly (iCreate, 2026-08-21).
--
-- The office needs this BEFORE an invoice goes out, not after: it changes what
-- they send and when. Today the only place a plan exists is
-- `sis_payment_plans`, which is created after invoicing when a family sets up
-- instalments on their billing page — too late to be useful to the person
-- deciding what to send.
--
-- Two ways in, one column: the family answers a `payment_plan` question in the
-- registration funnel, or staff record what a family told them. Staff wins,
-- because it is the later conversation.
--
-- Informational only. Nothing prices off this column — how monthly payment
-- changes the amount (the 6% convenience fee, and whether it applies beyond
-- block pricing) is still an open question with iCreate.

ALTER TABLE public.households ADD COLUMN IF NOT EXISTS payment_plan_preference text
  CHECK (payment_plan_preference IS NULL OR payment_plan_preference IN ('in_full', 'monthly'));

COMMENT ON COLUMN public.households.payment_plan_preference IS
  'Family''s stated tuition payment plan: in_full or monthly. Set by staff, or '
  'derived from the registration funnel''s payment_plan question. Informational '
  '— billing does not price off it.';
