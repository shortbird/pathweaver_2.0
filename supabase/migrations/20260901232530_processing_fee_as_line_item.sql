-- The card processing fee becomes a LINE ITEM on the invoice.
--
-- It lived only in sis_invoices.processing_fee_cents, OUTSIDE total_cents, and
-- every surface that showed a balance had to remember to add it. They kept not
-- remembering. On 2026-08-19 the office read "Paid" on three invoices while the
-- family portal billed those families the whole tuition a second time. On
-- 2026-09-01 it went the other way: five iCreate families who had just paid
-- tuition plus the card fee were shown a CREDIT of exactly that fee, because
-- the household balance summed total_cents and the fee was not in it.
--
-- Susan Miller's two invoices are the example: $3,185.00 + $92.66 and
-- $3,035.00 + $88.32, both paid in full by card, portal balance -$180.98.
--
-- After this migration total_cents is the whole bill. amount_due_cents() is
-- total - paid, and nothing adds processing_fee_cents to a total again; the
-- column stays as the record of how much of the total is fee.
--
-- No money moves. These invoices were charged, and paid, the amount they end up
-- reading here.
--
-- Applied to production 2026-09-01 (11 invoices, 7 families): each got one
-- 'Card processing fee' line, subtotal and total rebuilt from the lines, and
-- every one of them now reads a $0.00 balance.

BEGIN;

-- 1. Write the fee as a line item, for every invoice carrying one that has not
--    got the line already (re-runnable).
INSERT INTO sis_invoice_line_items (invoice_id, description, amount_cents, kind, quantity)
SELECT i.id, 'Card processing fee', i.processing_fee_cents, 'fee', 1
FROM sis_invoices i
WHERE COALESCE(i.processing_fee_cents, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM sis_invoice_line_items li
    WHERE li.invoice_id = i.id
      AND li.kind = 'fee'
      AND li.description = 'Card processing fee'
  );

-- 2. Rebuild subtotal and total from the lines, for exactly those invoices.
--    total = subtotal - discount, the same sum create_invoice/update_invoice use.
WITH sums AS (
  SELECT li.invoice_id, SUM(li.amount_cents)::int AS subtotal
  FROM sis_invoice_line_items li
  GROUP BY li.invoice_id
)
UPDATE sis_invoices i
SET subtotal_cents = sums.subtotal,
    total_cents = sums.subtotal - LEAST(COALESCE(i.discount_cents, 0), sums.subtotal),
    updated_at = NOW()
FROM sums
WHERE sums.invoice_id = i.id
  AND COALESCE(i.processing_fee_cents, 0) > 0
  AND i.total_cents <> sums.subtotal - LEAST(COALESCE(i.discount_cents, 0), sums.subtotal);

COMMIT;
