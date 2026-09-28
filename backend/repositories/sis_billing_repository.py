"""
SIS Billing Repositories - data access for the invoice ledger tables
(sis_invoice_line_items, sis_payment_records, sis_payment_plans,
sis_installments).

services/sis_billing_service.py still reads these tables directly in its
older paths; that is fenced by the direct-call ratchet rather than migrated.
New reads go here. Both tables are org-scoped through their invoice, so the
service passes the admin client and does its own authorization first.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository


class SisInvoiceLineItemRepository(BaseRepository):
    table_name = 'sis_invoice_line_items'

    def for_invoice(self, invoice_id: str) -> List[Dict[str, Any]]:
        return self.find_all(filters={'invoice_id': invoice_id})


class SisPaymentRecordRepository(BaseRepository):
    table_name = 'sis_payment_records'

    def by_external_ref(self, invoice_id: str, external_ref: str) -> Optional[Dict[str, Any]]:
        """The payment already recorded for a processor id (a Stripe
        PaymentIntent), or None. Used to keep a replayed charge off the
        ledger a second time."""
        rows = self.find_all(filters={'invoice_id': invoice_id, 'external_ref': external_ref},
                             limit=1)
        return rows[0] if rows else None


class SisPaymentPlanRepository(BaseRepository):
    table_name = 'sis_payment_plans'

    def active_for_invoice(self, invoice_id: str) -> List[Dict[str, Any]]:
        return self.find_all(filters={'invoice_id': invoice_id, 'status': 'active'})


class SisInstallmentRepository(BaseRepository):
    table_name = 'sis_installments'

    def for_plans(self, plan_ids: List[str], statuses: List[str]) -> List[Dict[str, Any]]:
        """The plans' installments in the given statuses, earliest due first.
        Bounded by the few plans on one invoice, so one page is all of them."""
        if not plan_ids:
            return []
        return (self.client.table(self.table_name).select('*')
                .in_('payment_plan_id', plan_ids).in_('status', statuses)
                .order('due_date').execute()).data or []

    def set_amount(self, installment_id: str, amount_cents: int, now: str) -> Dict[str, Any]:
        return self.update(installment_id, {'amount_cents': amount_cents, 'updated_at': now})
