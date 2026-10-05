-- A saved payment method is a card or a US bank account, and a card saved
-- before a school turned on "bank free, card pays the fee" keeps its old terms.
--
-- Optio Academy, 2026-10-05: new monthly-tuition setups offer ACH with no fee,
-- or a card with the processing fee added to each charge. The four families
-- with a card on file already keep paying with no fee until they save a new
-- payment method; any new save (card or bank) clears the exemption.

ALTER TABLE public.sis_saved_payment_methods
  ADD COLUMN IF NOT EXISTS method_type text NOT NULL DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS card_fee_exempt boolean NOT NULL DEFAULT false;

ALTER TABLE public.sis_saved_payment_methods
  DROP CONSTRAINT IF EXISTS sis_saved_payment_methods_method_type_check;
ALTER TABLE public.sis_saved_payment_methods
  ADD CONSTRAINT sis_saved_payment_methods_method_type_check
  CHECK (method_type IN ('card', 'us_bank_account'));

-- Every row saved before this migration was saved under the old terms.
UPDATE public.sis_saved_payment_methods SET card_fee_exempt = true;
