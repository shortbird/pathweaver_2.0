-- iCreate wants to distinguish Utah Fits All families using iCreate directly
-- from those enrolling as a "UFA Private School". Family-level flag; staff can
-- set it on existing families and the registration funnel sets it for new ones.
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS ufa_private boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.households.ufa_private IS
  'Family is enrolling as a UFA (Utah Fits All) Private School, vs standard UFA. Set by staff or the iCreate registration funnel.';
