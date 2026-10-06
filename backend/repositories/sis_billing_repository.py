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


class SisInvoiceRepository(BaseRepository):
    """sis_invoices, for the writes that must be conditional. Every method
    takes the org, so an id from another school matches nothing."""
    table_name = 'sis_invoices'

    def for_org(self, org_id: str, invoice_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select('*')
                .eq('id', invoice_id).eq('organization_id', org_id)
                .limit(1).execute()).data
        return rows[0] if rows else None

    def update_if_unchanged(self, org_id: str, invoice_id: str, expect: Dict[str, Any],
                            patch: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Update only while every column in `expect` still holds its value.
        Returns the updated rows: [] means somebody else changed the invoice
        first (a payment, an edit) and nothing was written."""
        query = (self.client.table(self.table_name).update(patch)
                 .eq('id', invoice_id).eq('organization_id', org_id))
        for col, val in expect.items():
            query = query.eq(col, val)
        return query.execute().data or []

    def restore(self, org_id: str, invoice_id: str, fields: Dict[str, Any]) -> None:
        """Unconditional write-back, for undoing a half-finished operation."""
        (self.client.table(self.table_name).update(fields)
         .eq('id', invoice_id).eq('organization_id', org_id).execute())

    def delete_for_org(self, org_id: str, invoice_id: str) -> None:
        (self.client.table(self.table_name).delete()
         .eq('id', invoice_id).eq('organization_id', org_id).execute())


class SisInvoiceLineItemRepository(BaseRepository):
    table_name = 'sis_invoice_line_items'

    def for_invoice(self, invoice_id: str) -> List[Dict[str, Any]]:
        return self.find_all(filters={'invoice_id': invoice_id})

    def insert_many(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not rows:
            return []
        return self.client.table(self.table_name).insert(rows).execute().data or []

    def delete_ids(self, ids: List[str]) -> None:
        if ids:
            self.client.table(self.table_name).delete().in_('id', ids).execute()

    def delete_for_invoice(self, invoice_id: str) -> None:
        self.client.table(self.table_name).delete().eq('invoice_id', invoice_id).execute()


class SisPaymentRecordRepository(BaseRepository):
    table_name = 'sis_payment_records'

    def by_external_ref(self, invoice_id: str, external_ref: str) -> Optional[Dict[str, Any]]:
        """The payment already recorded for a processor id (a Stripe
        PaymentIntent), or None. Used to keep a replayed charge off the
        ledger a second time."""
        rows = self.find_all(filters={'invoice_id': invoice_id, 'external_ref': external_ref},
                             limit=1)
        return rows[0] if rows else None

    def any_for_invoice(self, invoice_id: str) -> bool:
        """True when any payment or refund was ever recorded on the invoice."""
        return bool(self.find_all(filters={'invoice_id': invoice_id}, limit=1))


class SisPaymentPlanRepository(BaseRepository):
    table_name = 'sis_payment_plans'

    def active_for_invoice(self, invoice_id: str) -> List[Dict[str, Any]]:
        return self.find_all(filters={'invoice_id': invoice_id, 'status': 'active'})

    def for_invoice(self, invoice_id: str) -> List[Dict[str, Any]]:
        """Every plan on the invoice, whatever its status."""
        return self.find_all(filters={'invoice_id': invoice_id})

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


class SisSavedPaymentMethodRepository(BaseRepository):
    table_name = 'sis_saved_payment_methods'

    def org_ids_with_method(self, method_type: str,
                            org_id: Optional[str] = None) -> List[str]:
        """The orgs with at least one saved method of this type (a bank
        account, for the bank-payment settle). Grows with families, so every
        row is read."""
        def q():
            query = (self.client.table(self.table_name).select('organization_id')
                     .eq('method_type', method_type))
            return query.eq('organization_id', org_id) if org_id else query
        return sorted({r['organization_id'] for r in fetch_all_rows(q)})


class SisBillingAuditRepository(BaseRepository):
    table_name = 'sis_billing_audit'

    def has_action(self, org_id: str, invoice_id: str, action: str) -> bool:
        """True when this invoice already has an audit row for `action` (the
        "once" for a notice the settle must not repeat)."""
        rows = (self.client.table(self.table_name).select('id')
                .eq('organization_id', org_id).eq('invoice_id', invoice_id)
                .eq('action', action).limit(1).execute()).data
        return bool(rows)
