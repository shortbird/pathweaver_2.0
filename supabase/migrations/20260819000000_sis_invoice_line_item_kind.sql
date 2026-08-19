-- What an invoice line is FOR, as data rather than as prose in its description.
--
-- iCreate reconciles payments that arrive through UFA against invoices Optio
-- issued, and UFA's remittance says only "$50". Until now the only way to tell
-- a $50 supply fee from a $50 registration fee was to read the description
-- text, which the tuition approver is free to edit before sending. A family
-- paying $10 and $50 in "supply fees" against an invoice that showed a $10
-- supply fee left the office guessing the $50 was a registration fee.
--
-- Nullable and unconstrained-by-default: every line written before today, and
-- every ad-hoc charge, is simply unclassified rather than wrongly labelled.
ALTER TABLE sis_invoice_line_items
  ADD COLUMN IF NOT EXISTS kind text;

ALTER TABLE sis_invoice_line_items
  DROP CONSTRAINT IF EXISTS sis_invoice_line_items_kind_check;

ALTER TABLE sis_invoice_line_items
  ADD CONSTRAINT sis_invoice_line_items_kind_check
  CHECK (kind IS NULL OR kind IN ('tuition', 'supply', 'registration', 'fee', 'other'));

COMMENT ON COLUMN sis_invoice_line_items.kind IS
  'What the line charges for (tuition/supply/registration/fee/other). NULL means '
  'unclassified — lines written before 2026-08-19 and manual charges. Set by the '
  'tuition approver''s seeded line items so payments can be reconciled by category.';
