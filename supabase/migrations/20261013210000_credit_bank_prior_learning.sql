-- Credit bank: prior learning purchases (Tanner, 2026-10-13).
--
-- OpenEd sells prior learning credits as well as accelerated ones, and Eliza
-- enters both on the family group dashboard. They share the one balance:
-- prior learning credit awarded through prior learning review (non-accredited
-- transfer credit) draws on it the same as credit review does
-- (services/credit_bank_service.py).

ALTER TABLE public.credit_bank_entries DROP CONSTRAINT IF EXISTS credit_bank_entries_kind_check;
ALTER TABLE public.credit_bank_entries ADD CONSTRAINT credit_bank_entries_kind_check
    CHECK (kind = ANY (ARRAY['included', 'monthly', 'accelerated', 'prior_learning', 'adjustment']));
