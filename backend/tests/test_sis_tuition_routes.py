"""
Unit tests for the SIS tuition-approver routes (/api/sis/tuition/*).

Covers the FINANCE-role gate + request validation + wiring. The tuition service
is mocked (its logic is covered in test_sis_tuition.py).
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
def staff(role='org_admin', org='org-1', same_org_as_student=True):
    """`same_org_as_student` grants the SEC-10 relationship gate, which asks
    caller_can_access_user before the view runs. The org resolution these tests
    already stub is the in-view gate, not the only one."""
    with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role(role)), \
         patch('utils.auth.org_scope.caller_can_access_user', return_value=same_org_as_student), \
         patch('services.sis_service.resolve_org_id', return_value=org):
        yield


@pytest.mark.unit
class TestTuitionQueue:
    def test_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/tuition/queue?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 403

    def test_forbidden_for_advisor_finance_gate(self, client, auth_headers, mock_verify_token):
        # Advisor passes the general staff/admin tiers but tuition is FINANCE-only.
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('advisor')):
            resp = client.get('/api/sis/tuition/queue?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 403

    def test_queue_success(self, client, auth_headers, mock_verify_token):
        out = {'students': [{'student_id': 's1', 'name': 'Kid One'}], 'count': 1}
        with staff(), patch('routes.sis.tuition.tuition.tuition_queue', return_value=out):
            resp = client.get('/api/sis/tuition/queue?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['count'] == 1


@pytest.mark.unit
class TestTuitionPreview:
    def test_preview_not_found(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.tuition.tuition.tuition_preview',
                            return_value={'error': 'Student not found'}):
            resp = client.get('/api/sis/tuition/students/s9/preview?organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 404

    def test_preview_success(self, client, auth_headers, mock_verify_token):
        prev = {'student': {'id': 's1', 'name': 'Kid'}, 'line_items': [],
                'subtotal_cents': 0, 'total_cents': 0, 'pay_through_ufa': False}
        with staff(), patch('routes.sis.tuition.tuition.tuition_preview', return_value=prev):
            resp = client.get('/api/sis/tuition/students/s1/preview?organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['student']['id'] == 's1'


@pytest.mark.unit
class TestSendInvoice:
    def test_requires_line_items(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post('/api/sis/tuition/students/s1/invoice', headers=auth_headers,
                               json={'line_items': []})
        assert resp.status_code == 400

    def test_rejects_negative_discount(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post('/api/sis/tuition/students/s1/invoice', headers=auth_headers,
                               json={'line_items': [{'description': 'X', 'amount_cents': 100}],
                                     'discount_cents': -5})
        assert resp.status_code == 400

    def test_send_success(self, client, auth_headers, mock_verify_token):
        out = {'invoice': {'id': 'inv1', 'invoice_number': 'INV-2026-ABC123', 'total_cents': 100},
               'emailed': 2}
        with staff(), patch('routes.sis.tuition.tuition.send_tuition_invoice', return_value=out):
            resp = client.post('/api/sis/tuition/students/s1/invoice', headers=auth_headers,
                               json={'line_items': [{'description': 'Piano', 'amount_cents': 100}]})
        assert resp.status_code == 201
        body = json.loads(resp.data)
        assert body['invoice']['id'] == 'inv1'
        assert body['emailed'] == 2

    def test_send_student_not_found(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.tuition.tuition.send_tuition_invoice',
                            return_value={'error': 'Student not found'}):
            resp = client.post('/api/sis/tuition/students/s9/invoice', headers=auth_headers,
                               json={'line_items': [{'description': 'X', 'amount_cents': 100}]})
        assert resp.status_code == 404
