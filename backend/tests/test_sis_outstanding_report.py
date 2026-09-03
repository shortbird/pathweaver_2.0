"""
The outstanding-balance report names the invoice it is chasing.

Found on 2026-08-06 while verifying the tuition flow end to end against iCreate's
real data: the invoice read back as INV-2026-3B3796 everywhere a FAMILY sees it —
the branded invoice document, the receipt, the family portal — and as nothing at
all in the staff report the office works from. outstanding_invoices() rebuilt
each row field by field and never copied invoice_number across.

That is not cosmetic. The number is the only identifier a parent recognises, so
without it a payment chase is the office and the family naming the same invoice
two different ways.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_billing_service as billing


ORG = 'org-1'

INVOICE = {
    'id': 'inv-1', 'invoice_number': 'INV-2026-3B3796',
    'organization_id': ORG, 'status': 'sent',
    'total_cents': 150000, 'amount_paid_cents': 0,
    'household_id': 'hh-1', 'student_user_id': 'stu-1',
    'due_date': '2026-09-01',
}


def _table_for(name, rows):
    t = Mock()
    for chained in ('select', 'eq', 'in_', 'order', 'limit', 'range'):
        getattr(t, chained).return_value = t
    t.execute.return_value = Mock(data=rows.get(name, []))
    return t


def _report(invoice=None):
    rows = {
        'sis_invoices': [invoice or INVOICE],
        'households': [{'id': 'hh-1', 'name': 'Sadler Family'}],
        'users': [{'id': 'stu-1', 'display_name': 'Abigail Sadler',
                   'first_name': 'Abigail', 'last_name': 'Sadler'}],
    }
    client = Mock()
    client.table.side_effect = lambda name: _table_for(name, rows)
    with patch.object(billing, '_admin', return_value=client), \
         patch.object(billing, '_hydrate_invoices', side_effect=lambda invs: None), \
         patch.object(billing, '_days_overdue', return_value=0):
        return billing.outstanding_invoices(ORG)


@pytest.mark.unit
class TestTheOutstandingReport:
    def test_it_names_the_invoice(self):
        rows = _report()
        assert rows[0]['invoice_number'] == 'INV-2026-3B3796'

    def test_it_still_carries_everything_else(self):
        row = _report()[0]
        assert row['family_name'] == 'Sadler Family'
        assert row['student_name'] == 'Abigail Sadler'
        assert row['amount_due_cents'] == 150000

    def test_an_unnumbered_invoice_does_not_crash_the_report(self):
        """Invoices created before numbering have none. A report that 500s on one
        old row is worse than a row with a blank number."""
        rows = _report({**INVOICE, 'invoice_number': None})
        assert rows[0]['invoice_number'] is None

    def test_a_fully_paid_invoice_is_not_outstanding(self):
        assert _report({**INVOICE, 'amount_paid_cents': 150000}) == []
