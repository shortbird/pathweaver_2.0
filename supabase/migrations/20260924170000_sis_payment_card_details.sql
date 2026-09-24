-- The card a payment was made with, for the receipt (ticket 03226ede,
-- iCreate, 2026-09-24): families turn receipts in for reimbursement and need
-- the method and the last four digits of the card. Display fields only, the
-- same two sis_saved_payment_methods already keeps; never a full card number.
-- Written best-effort after the payment row (sis_billing_service
-- ._attach_card_details), so code that predates these columns still records
-- payments.

ALTER TABLE public.sis_payment_records
  ADD COLUMN IF NOT EXISTS card_brand text,
  ADD COLUMN IF NOT EXISTS card_last4 text;

COMMENT ON COLUMN public.sis_payment_records.card_brand IS
  'Card network of a card payment (visa, mastercard...), for the receipt.';
COMMENT ON COLUMN public.sis_payment_records.card_last4 IS
  'Last four digits of the card a payment was made with, for the receipt.';

NOTIFY pgrst, 'reload schema';
