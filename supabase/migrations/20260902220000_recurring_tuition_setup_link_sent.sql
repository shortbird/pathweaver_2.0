-- "Did the parent actually get the email?"
--
-- Optio Academy set up monthly tuition on 2026-09-02 and had no way to answer
-- that. Creating a schedule emails nobody by design — billing starts when the
-- family saves a card, and the card-setup link is a separate, deliberate send —
-- but nothing recorded that the send happened, so the only evidence was a toast
-- that had already disappeared. The office was left guessing, and guessing on a
-- money email means sending it again.
--
-- Stamped on every ACTIVE row of the household, because the link is emailed per
-- household (one card, one family) while the schedule is per student. Each of a
-- family's rows therefore carries the same timestamp, which is what lets the
-- monthly-tuition screen show it on the row the office is looking at.

ALTER TABLE public.sis_recurring_tuition
  ADD COLUMN IF NOT EXISTS setup_link_sent_at timestamptz;

COMMENT ON COLUMN public.sis_recurring_tuition.setup_link_sent_at IS
  'When the household was last emailed the card-setup link. NULL means the '
  'family has never been asked to save a card, so an active schedule with no '
  'next_charge_on is waiting on the school, not on the parent.';
