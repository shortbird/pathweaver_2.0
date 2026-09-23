-- A family the school registers for free. fee_prepaid only zeroes the one-time
-- registration fee; Optio Academy charges nothing one-time and bills a monthly
-- plan, so a prepaid family there still paid. no_charge zeroes both: the
-- registration fee, the monthly program fee and every add-on, and the payment
-- step offers no add-ons and asks for no card.
ALTER TABLE public.sis_family_directives
  ADD COLUMN IF NOT EXISTS no_charge boolean NOT NULL DEFAULT false;
