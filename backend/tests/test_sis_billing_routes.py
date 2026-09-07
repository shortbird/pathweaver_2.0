"""
Unit tests for SIS billing routes (/api/sis discount-rules, invoices, payments).
Pricing math is covered in test_sis_pricing.py; here we cover gating + validation
+ wiring. The billing service is mocked.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import sis_billing_service as billing_module


def _admin_client_for_role(role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


@contextmanager
def staff(role='org_admin', org='org-1'):
    with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role(role)), \
         patch('services.sis_service.resolve_org_id', return_value=org):
        yield


@pytest.mark.unit
class TestDiscountRules:
    def test_list_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/discount-rules', headers=auth_headers)
        assert resp.status_code == 403

    def test_create_requires_valid_type(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post('/api/sis/discount-rules', headers=auth_headers,
                               json={'name': 'X', 'rule_type': 'bogus'})
        assert resp.status_code == 400

    def test_create_requires_name(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post('/api/sis/discount-rules', headers=auth_headers,
                               json={'rule_type': 'sibling'})
        assert resp.status_code == 400

    def test_create_success(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.billing.billing.create_discount_rule',
                            return_value={'id': 'd1', 'name': 'Sibling 10%'}):
            resp = client.post('/api/sis/discount-rules', headers=auth_headers,
                               json={'name': 'Sibling 10%', 'rule_type': 'sibling',
                                     'criteria': {'min_students': 2, 'percent': 10}})
        assert resp.status_code == 201


@pytest.mark.unit
class TestInvoices:
    def test_quote_success(self, client, auth_headers, mock_verify_token):
        q = {'subtotal_cents': 10000, 'discount_cents': 1000, 'total_cents': 9000, 'discount_lines': []}
        with staff(), patch('routes.sis.billing.billing.quote_for_registration', return_value=q):
            resp = client.get('/api/sis/registrations/r1/quote?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['quote']['total_cents'] == 9000

    def test_create_invoice_no_items(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.billing.billing.create_invoice_from_registration',
                            return_value={'error': 'Registration has no classes to invoice'}):
            resp = client.post('/api/sis/registrations/r1/invoice', headers=auth_headers, json={})
        assert resp.status_code == 400

    def test_create_invoice_success(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.billing.billing.create_invoice_from_registration',
                            return_value={'invoice': {'id': 'inv1', 'total_cents': 9000}, 'discount_lines': []}):
            resp = client.post('/api/sis/registrations/r1/invoice', headers=auth_headers, json={})
        assert resp.status_code == 201
        assert json.loads(resp.data)['invoice']['id'] == 'inv1'

    def test_get_invoice_not_found(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.billing.billing.get_invoice', return_value=None):
            resp = client.get('/api/sis/invoices/inv9?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 404


@pytest.mark.unit
class TestPayments:
    def test_plan_rejects_bad_cadence(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post('/api/sis/invoices/inv1/payment-plan', headers=auth_headers,
                               json={'cadence': 'weekly'})
        assert resp.status_code == 400

    def test_plan_success(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.billing.billing.create_payment_plan',
                            return_value={'plan': {'id': 'pp1', 'installments': []}}):
            resp = client.post('/api/sis/invoices/inv1/payment-plan', headers=auth_headers,
                               json={'cadence': 'monthly', 'installment_count': 3, 'start_date': '2026-09-01'})
        assert resp.status_code == 201

    def test_payment_rejects_nonpositive(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post('/api/sis/invoices/inv1/payments', headers=auth_headers,
                               json={'amount_cents': 0})
        assert resp.status_code == 400

    def test_payment_success_stamps_recorder(self, client, auth_headers, mock_verify_token):
        captured = {}

        def fake_record(org_id, invoice_id, amount_cents, **kw):
            captured.update(amount=amount_cents, by=kw.get('recorded_by'))
            return {'payment': {'id': 'pay1'}, 'invoice': {'id': invoice_id, 'status': 'partial'}}

        with staff(), patch('routes.sis.billing.billing.record_payment', side_effect=fake_record):
            resp = client.post('/api/sis/invoices/inv1/payments', headers=auth_headers,
                               json={'amount_cents': 5000, 'method': 'sbs'})
        assert resp.status_code == 201
        assert captured['amount'] == 5000
        assert captured['by'] == 'test-user-123'

    def test_refund_rejects_nonpositive(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post('/api/sis/invoices/inv1/refunds', headers=auth_headers,
                               json={'amount_cents': 0})
        assert resp.status_code == 400

    def test_refund_success_stamps_recorder(self, client, auth_headers, mock_verify_token):
        captured = {}

        def fake_refund(org_id, invoice_id, amount_cents, **kw):
            captured.update(amount=amount_cents, by=kw.get('recorded_by'))
            return {'refund': {'id': 'rf1'}, 'invoice': {'id': invoice_id, 'status': 'partial'}}

        with staff(), patch('routes.sis.billing.billing.record_refund', side_effect=fake_refund):
            resp = client.post('/api/sis/invoices/inv1/refunds', headers=auth_headers,
                               json={'amount_cents': 5000, 'method': 'zelle', 'note': 'class cancelled'})
        assert resp.status_code == 201
        assert captured['amount'] == 5000
        assert captured['by'] == 'test-user-123'

    def test_refund_exceeds_paid_returns_400(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.billing.billing.record_refund',
                            return_value={'error': 'Refund exceeds the $100.00 recorded as paid on this invoice'}):
            resp = client.post('/api/sis/invoices/inv1/refunds', headers=auth_headers,
                               json={'amount_cents': 15000})
        assert resp.status_code == 400

    def test_late_fees_validation(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post('/api/sis/billing/apply-late-fees', headers=auth_headers,
                               json={'late_fee_cents': -1})
        assert resp.status_code == 400

    def test_household_billing(self, client, auth_headers, mock_verify_token):
        out = {'invoices': [], 'upcoming_installments': [], 'sbs_pay_url': 'https://sbs/pay'}
        with staff(), patch('routes.sis.billing.billing.household_billing', return_value=out):
            resp = client.get('/api/sis/households/h1/billing?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['sbs_pay_url'] == 'https://sbs/pay'


@pytest.mark.unit
class TestInvoiceCorrections:
    """Editing and voicing a sent invoice — the alternative was a second
    invoice, leaving the family with two bills for one term."""

    def test_edit_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('student')):
            resp = client.patch('/api/sis/invoices/inv1', headers=auth_headers,
                                json={'discount_cents': 100})
        assert resp.status_code == 403

    def test_edit_forbidden_for_campus_coordinator(self, client, auth_headers, mock_verify_token):
        """Invoices are money, and the coordinator tier stops at the money."""
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('campus_coordinator')):
            resp = client.patch('/api/sis/invoices/inv1', headers=auth_headers,
                                json={'discount_cents': 100})
        assert resp.status_code == 403

    def test_edit_rejects_empty_line_items(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.patch('/api/sis/invoices/inv1', headers=auth_headers,
                                json={'line_items': []})
        assert resp.status_code == 400

    def test_edit_rejects_negative_discount(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.patch('/api/sis/invoices/inv1', headers=auth_headers,
                                json={'discount_cents': -1})
        assert resp.status_code == 400

    def test_edit_success(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.billing.billing.update_invoice',
                            return_value={'invoice': {'id': 'inv1', 'total_cents': 5000}}) as upd:
            resp = client.patch('/api/sis/invoices/inv1', headers=auth_headers,
                                json={'line_items': [{'description': 'Piano', 'amount_cents': 5000}],
                                      'discount_cents': 0})
        assert resp.status_code == 200
        assert upd.call_args.kwargs['line_items'][0]['description'] == 'Piano'

    def test_omitting_due_date_leaves_it_alone(self, client, auth_headers, mock_verify_token):
        """None means "clear the due date", so an absent key must not be None."""
        with staff(), patch('routes.sis.billing.billing.update_invoice',
                            return_value={'invoice': {}}) as upd:
            client.patch('/api/sis/invoices/inv1', headers=auth_headers,
                         json={'discount_cents': 0})
        assert upd.call_args.kwargs['due_date'] is billing_module._UNSET

    def test_sending_a_null_due_date_clears_it(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.billing.billing.update_invoice',
                            return_value={'invoice': {}}) as upd:
            client.patch('/api/sis/invoices/inv1', headers=auth_headers,
                         json={'due_date': None})
        assert upd.call_args.kwargs['due_date'] is None

    def test_edit_missing_invoice_is_404(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.billing.billing.update_invoice',
                            return_value={'error': 'Invoice not found'}):
            resp = client.patch('/api/sis/invoices/inv1', headers=auth_headers, json={})
        assert resp.status_code == 404

    def test_void_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('student')):
            resp = client.post('/api/sis/invoices/inv1/void', headers=auth_headers, json={})
        assert resp.status_code == 403

    def test_void_success(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.billing.billing.void_invoice',
                            return_value={'invoice': {'id': 'inv1', 'status': 'void'}}):
            resp = client.post('/api/sis/invoices/inv1/void', headers=auth_headers, json={})
        assert resp.status_code == 200
        assert json.loads(resp.data)['invoice']['status'] == 'void'

    def test_void_with_a_payment_is_400(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.billing.billing.void_invoice',
                            return_value={'error': 'A payment has been recorded on this invoice. '
                                                   'Edit it instead of voiding it.'}):
            resp = client.post('/api/sis/invoices/inv1/void', headers=auth_headers, json={})
        assert resp.status_code == 400


@pytest.mark.unit
class TestBillingDetail:
    """The reconciliation report: UFA remits an amount with no statement of
    what it covers, so the office needs the charges listed line by line."""

    REPORT = {
        'rows': [{
            'invoice_id': 'inv1', 'invoice_number': 'INV-2026-AAA111', 'status': 'sent',
            'family_name': 'Smith', 'student_name': 'Ana', 'issued_at': '2026-08-01T00:00:00Z',
            'due_date': '2026-09-01', 'description': 'Piano — supplies', 'kind': 'supply',
            'amount_cents': 5000, 'invoice_total_cents': 15000,
            'invoice_paid_cents': 0, 'invoice_balance_cents': 15000,
        }],
        'payments': [], 'totals': {'charged_cents': 5000, 'paid_cents': 0,
                                   'balance_cents': 15000, 'by_kind': {'supply': 5000}},
    }

    def test_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/billing/detail', headers=auth_headers)
        assert resp.status_code == 403

    def test_filters_are_passed_through(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.billing.billing.billing_detail',
                            return_value=self.REPORT) as detail:
            resp = client.get('/api/sis/billing/detail?household_id=h1&kind=supply',
                              headers=auth_headers)
        assert resp.status_code == 200
        assert detail.call_args.kwargs == {'household_id': 'h1', 'kind': 'supply'}

    def test_csv_carries_the_charge_type(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.billing.billing.billing_detail',
                            return_value=self.REPORT):
            resp = client.get('/api/sis/billing/detail?format=csv', headers=auth_headers)
        assert resp.status_code == 200
        assert resp.mimetype == 'text/csv'
        body = resp.data.decode()
        assert 'Piano — supplies' in body
        assert 'supply' in body
        assert '50.00' in body
