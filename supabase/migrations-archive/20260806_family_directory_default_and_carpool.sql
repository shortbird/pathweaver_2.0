-- Family directory: a school-wide default of "listed", and carpooling.
--
-- Reported 2026-08-05 by iCreate: "I would really like this to be opt OUT
-- instead of opt in ... (I want this to be harder for them to opt out.)" and
-- "show the city they live in and then have something they could check ... that
-- says if they would be open to carpooling. And then we could filter it so that
-- people wanting carpools could see who wanted to carpool."
--
-- directory_opt_in is left exactly as it is. Flipping its meaning would reread
-- every stored false — some of which are deliberate opt-outs — as consent, so
-- the opt-out is its own column and a family is listed when:
--
--     directory_opt_in OR (org default is "listed" AND NOT directory_opted_out)
--
-- The org default lives in feature_flags.sis_settings.directory_default_in and
-- is off until a school turns it on, because it publishes a family's contact
-- details to other families without them acting.

ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS directory_opted_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carpool_interest boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.households.directory_opted_out IS
  'Family explicitly asked to be left out of the family directory. Beats the org-wide default-in setting.';
COMMENT ON COLUMN public.households.carpool_interest IS
  'Family is open to arranging carpools with other families in the directory.';
