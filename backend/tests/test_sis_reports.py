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


CLASSES = [
    {
        'id': 'c1', 'name': 'Pottery', 'description': 'Hand building and the wheel',
        'location': 'Studio A', 'price_cents': 24000, 'supply_fee': 35,
        'supply_budget_per_student': 12.5, 'min_age': 8, 'max_age': 12,
        'billing_type': 'flat', 'billing_cadence': 'semester',
        'capacity': 12, 'enrolled_count': 9, 'spots_left': 3, 'waitlist_count': 2,
        'status': 'active', 'registration_status': 'open', 'internal_notes': 'Kiln shared',
        'primary_instructor': {'id': 't1', 'name': 'Ruth Stewart'},
        'assistant_instructors': [{'id': 't2', 'name': 'Sam Aide'}],
        'meetings': [{'day_of_week': 3, 'start_time': '13:00:00', 'end_time': '14:30:00'},
                     {'day_of_week': 1, 'start_time': '09:00:00', 'end_time': '10:00:00'}],
    },
    {
        'id': 'c2', 'name': 'Choir', 'capacity': None, 'enrolled_count': 0,
        'status': 'active', 'registration_status': 'closed', 'meetings': [],
    },
]


class TestClassReportRows:
    def rows(self, curriculum=None, materials=None):
        return reports.build_class_rows(CLASSES, curriculum or {}, materials or {})

    def test_every_field_key_is_present(self):
        row = self.rows()[0]
        assert set(row) == set(reports.CLASS_REPORT_KEYS)

    def test_formats_schedule_money_and_people(self):
        # Sorted by name, so Choir comes first.
        choir, pottery = self.rows()
        assert choir['name'] == 'Choir'
        assert pottery['teacher'] == 'Ruth Stewart'
        assert pottery['assistants'] == 'Sam Aide'
        assert pottery['days'] == 'Mon Wed'            # day order, not entry order
        assert pottery['time'] == '9:00am-10:00am'
        assert pottery['ages'] == '8-12'
        assert pottery['tuition'] == '$240.00'         # cents
        assert pottery['supply_fee'] == '$35.00'       # dollars
        assert pottery['materials_allowance'] == '$12.50'
        assert pottery['billing'] == 'flat semester'
        assert pottery['registration'] == 'Open'
        assert pottery['room'] == 'Studio A'

    def test_missing_values_render_blank_not_none(self):
        choir = self.rows()[0]
        assert choir['teacher'] == ''
        assert choir['time'] == ''
        assert choir['tuition'] == ''
        assert choir['capacity'] == ''       # unlimited, not 0
        assert choir['enrolled'] == 0
        assert choir['registration'] == 'Closed'

    def test_curriculum_and_extra_materials(self):
        pottery = self.rows(curriculum={'c1': ['Clay 101']},
                            materials={'c1': ['Glaze guide', 'Supply list']})[1]
        assert pottery['curriculum_attached'] == 'Yes'
        assert pottery['curriculum'] == 'Clay 101'
        assert pottery['extra_materials'] == 'Glaze guide; Supply list'
        assert self.rows()[1]['curriculum_attached'] == 'No'

    def test_archived_class_reports_as_archived(self):
        row = reports.build_class_rows(
            [{'id': 'c3', 'name': 'Old', 'status': 'archived', 'registration_status': 'open'}], {}, {})[0]
        assert row['registration'] == 'Archived'


@pytest.mark.unit
class TestClassReportRoute:
    REPORT = {
        'fields': reports.CLASS_REPORT_FIELDS,
        'rows': reports.build_class_rows(CLASSES, {'c1': ['Clay 101']}, {}),
    }

    def test_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/reports/classes', headers=auth_headers)
        assert resp.status_code == 403

    def test_defaults_when_no_fields_asked_for(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.reports.reports.class_report', return_value=self.REPORT):
            resp = client.get('/api/sis/reports/classes?organization_id=org-1', headers=auth_headers)
        body = json.loads(resp.data)
        assert resp.status_code == 200
        assert body['report']['selected'] == reports.CLASS_REPORT_DEFAULTS
        # Every field comes back whatever the selection, so the UI can re-shape
        # the table without another round trip.
        assert set(body['report']['rows'][0]) == set(reports.CLASS_REPORT_KEYS)

    def test_selection_keeps_canonical_order_and_drops_unknown_keys(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.reports.reports.class_report', return_value=self.REPORT):
            resp = client.get('/api/sis/reports/classes?organization_id=org-1'
                              '&fields=tuition,nonsense,name', headers=auth_headers)
        assert json.loads(resp.data)['report']['selected'] == ['name', 'tuition']

    def test_csv_writes_the_selected_columns(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.reports.reports.class_report', return_value=self.REPORT):
            resp = client.get('/api/sis/reports/classes?organization_id=org-1'
                              '&fields=name,curriculum_attached&format=csv', headers=auth_headers)
        assert resp.status_code == 200
        assert resp.headers['Content-Disposition'] == 'attachment; filename=classes.csv'
        lines = resp.data.decode().strip().splitlines()
        assert lines[0] == 'Class,Curriculum attached?'
        assert lines[1] == 'Choir,No'
        assert lines[2] == 'Pottery,Yes'

    def test_include_archived_is_passed_through(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.reports.reports.class_report',
                            return_value=self.REPORT) as spy:
            client.get('/api/sis/reports/classes?organization_id=org-1&include_archived=true',
                       headers=auth_headers)
        spy.assert_called_once_with('org-1', include_archived=True)
