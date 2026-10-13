-- What an approved prior-learning record costs, recorded when it is approved
-- (Tanner, 2026-10-13). The price comes from shared/data/pricing.json:
--   source_accredited  the reviewer's call: credit from an accredited school's
--                      official transcript is free.
--   fee_price_list     'private' (a family paying Optio Academy itself) or
--                      'licensed' (a student at a school with an Optio license,
--                      or an OpenEd family), which sets the credit price.
--   fee_cents          credits awarded x that price, 0 when accredited.
-- Stored, not derived, so a later price change does not rewrite what a family
-- was told when their credit was approved.

ALTER TABLE public.prior_learning_records
  ADD COLUMN IF NOT EXISTS source_accredited boolean,
  ADD COLUMN IF NOT EXISTS fee_price_list text CHECK (fee_price_list IN ('private', 'licensed')),
  ADD COLUMN IF NOT EXISTS fee_cents integer CHECK (fee_cents >= 0);
