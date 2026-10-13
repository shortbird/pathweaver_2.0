-- OpenEd families buy credit from OpenEd's marketplace and OpenEd pays Optio,
-- so the platform never shows them a price (Tanner, 2026-10-13). Their
-- approved prior learning records fee_price_list 'opened' and fee_cents 0.

ALTER TABLE public.prior_learning_records DROP CONSTRAINT IF EXISTS prior_learning_records_fee_price_list_check;
ALTER TABLE public.prior_learning_records ADD CONSTRAINT prior_learning_records_fee_price_list_check
  CHECK (fee_price_list IN ('private', 'licensed', 'opened'));
