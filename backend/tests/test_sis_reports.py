"""
Unit tests for SIS reports: pure aggregators + route gating.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import sis_reports_service as reports


class TestAggregators:
    def test_revenue(self):
        invoices = [
            {'status': 'paid', 'total_cents': 10000, 'amount_paid_cents': 10000},
            {'status': 'partial', 'total_cents': 8000, 'amount_paid_cents': 3000},
            {'status': 'sent', 'total_cents': 5000, 'amount_paid_cents': 0},
        ]
        out = reports.aggregate_revenue(invoices)
        assert out['invoice_count'] == 3
        assert out['billed_cents'] == 23000
        assert out['collected_cents'] == 13000
        assert out['outstanding_cents'] == 10000
        assert out['by_status'] == {'paid': 1, 'partial': 1, 'sent': 1}

    def test_revenue_empty(self):
        out = reports.aggregate_revenue([])
        assert out['billed_cents'] == 0
        assert out['outstanding_cents'] == 0

    def test_enrollment(self):
        rows = [{'status': 'enrolled'}, {'status': 'enrolled'}, {'status': 'applicant'}]
        out = reports.aggregate_enrollment(rows)
        assert out['total'] == 3
        assert out['by_status'] == {'enrolled': 2, 'applicant': 1}


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
class TestReportRoutes:
    def test_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/reports/revenue', headers=auth_headers)
        assert resp.status_code == 403

    def test_revenue_success(self, client, auth_headers, mock_verify_token):
        rpt = {'invoice_count': 1, 'billed_cents': 9000, 'collected_cents': 0, 'outstanding_cents': 9000, 'by_status': {'sent': 1}}
        with staff(), patch('routes.sis.reports.reports.revenue_report', return_value=rpt):
            resp = client.get('/api/sis/reports/revenue?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['report']['outstanding_cents'] == 9000

    def test_enrollment_success(self, client, auth_headers, mock_verify_token):
        rpt = {'total': 3, 'by_status': {'enrolled': 3}, 'active_classes': 2}
        with staff(), patch('routes.sis.reports.reports.enrollment_report', return_value=rpt):
            resp = client.get('/api/sis/reports/enrollment?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['report']['total'] == 3

    def test_attendance_success(self, client, auth_headers, mock_verify_token):
        rpt = {'overall': {'attendance_rate': 0.9, 'counts': {}, 'total': 10}, 'per_class': []}
        with staff(), patch('routes.sis.reports.reports.attendance_report', return_value=rpt):
            resp = client.get('/api/sis/reports/attendance?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['report']['overall']['attendance_rate'] == 0.9
