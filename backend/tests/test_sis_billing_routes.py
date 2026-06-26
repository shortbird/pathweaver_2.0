"""
Unit tests for SIS billing routes (/api/sis discount-rules, invoices, payments).
Pricing math is covered in test_sis_pricing.py; here we cover gating + validation
+ wiring. The billing service is mocked.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest


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
