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
from utils.db_fetch import fetch_all_rows


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

    def _active_monthly_query(self, org_id: str):
        """Active monthly plans for one org. sis_payment_plans has no
        organization_id; the org lives on the invoice, so the read embeds it
        (one FK, sis_payment_plans_invoice_id_fkey, so the embed is unambiguous)."""
        return (self.client.table(self.table_name)
                .select('id, invoice_id, cadence, installment_count, status, auto_charge, '
                        'saved_payment_method_id, '
                        'sis_invoices!inner(id, organization_id, household_id, '
                        'student_user_id, total_cents)')
                .eq('status', 'active').eq('cadence', 'monthly')
                .eq('sis_invoices.organization_id', org_id))

    def active_monthly_for_org(self, org_id: str) -> List[Dict[str, Any]]:
        """Every active monthly plan in the org, paged past the 1,000-row cap."""
        return fetch_all_rows(lambda: self._active_monthly_query(org_id))

    def active_monthly_for_student(self, org_id: str, student_id: str) -> List[Dict[str, Any]]:
        """Plans whose invoice is this student's own. Bounded by one student."""
        return (self._active_monthly_query(org_id)
                .eq('sis_invoices.student_user_id', student_id)
                .limit(1).execute()).data or []

    def active_monthly_for_household(self, org_id: str, household_id: str) -> List[Dict[str, Any]]:
        """Plans on the family's invoices. Bounded by one household."""
        return (self._active_monthly_query(org_id)
                .eq('sis_invoices.household_id', household_id)
                .execute()).data or []


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

    def for_plan_ids(self, plan_ids: List[str]) -> List[Dict[str, Any]]:
        """Every installment of the given plans, any status, paged (an org's
        plans together can pass the 1,000-row cap)."""
        if not plan_ids:
            return []
        return fetch_all_rows(lambda: (
            self.client.table(self.table_name)
            .select('id, payment_plan_id, due_date, amount_cents, status')
            .in_('payment_plan_id', plan_ids)))

    def set_amount(self, installment_id: str, amount_cents: int, now: str) -> Dict[str, Any]:
        return self.update(installment_id, {'amount_cents': amount_cents, 'updated_at': now})
