-- Billing: processing fees, human-friendly invoice numbers, online-payment
-- session tracking, and a billing audit log (iCreate billing PRD, 2026-07-27).
--
-- The SIS billing engine (sis_invoices/line_items/payments/plans/discount_rules)
-- already covers invoicing, discounts, payment plans, manual mark-as-paid, and
-- guardian receipts. This migration adds the pieces the iCreate billing PRD
-- named that were missing:
--   * processing_fee_cents — a fee (e.g. card processing) added to the amount due.
--   * invoice_number — a human-friendly, collision-free number for invoices/receipts.
--   * stripe_session_ids — Checkout Sessions opened for online payment (poll-verified,
--     same pattern as the registration fee), so a paid session is never missed.
--   * sis_billing_audit — who marked paid / overrode a fee / edited an invoice.

ALTER TABLE sis_invoices ADD COLUMN IF NOT EXISTS processing_fee_cents integer NOT NULL DEFAULT 0;
ALTER TABLE sis_invoices ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE sis_invoices ADD COLUMN IF NOT EXISTS stripe_session_ids text[] NOT NULL DEFAULT '{}';

UPDATE sis_invoices
   SET invoice_number = 'INV-' || to_char(COALESCE(created_at, now()), 'YYYY') || '-' || upper(substr(id::text, 1, 6))
 WHERE invoice_number IS NULL;

CREATE TABLE IF NOT EXISTS sis_billing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  invoice_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sis_billing_audit_org_idx ON sis_billing_audit (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sis_billing_audit_invoice_idx ON sis_billing_audit (invoice_id);

-- An audit trail that the public can rewrite is worse than no audit trail, since
-- it will still be relied on in a billing dispute. Without these statements this
-- table is anon INSERT/UPDATE/DELETE/TRUNCATE-able, because
-- 20260527_restore_default_data_api_grants.sql grants anon ALL on every new
-- public table and RLS is the only backstop -- AUDIT.md H3.
-- Written only by the backend's service-role client, which bypasses RLS.
ALTER TABLE sis_billing_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE sis_billing_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sis_billing_audit FROM anon, authenticated, PUBLIC;
GRANT  ALL ON sis_billing_audit TO service_role;
