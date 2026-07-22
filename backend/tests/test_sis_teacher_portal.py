"""
Tests for the SIS teacher portal (iCreate teacher features, 2026-07-22):

- Role tiers: advisors are locked out of admin-only endpoints (households,
  billing, class management) but keep the teacher portal.
- Class scoping: an advisor only sees/reaches their own classes.
- Time clock service rules: no double clock-in, clock-out closes the entry,
  payroll rows only include approved entries.
- Forms service: submit validates, admins are notified.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest


def _admin_client_for_role(role, org_role=None, org_roles=None):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'in_', 'is_', 'neq', 'order', 'gte', 'lte'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{
        'role': role, 'org_role': org_role, 'org_roles': org_roles,
    }])
    return client


@contextmanager
def as_role(role, org_role=None, org_roles=None, scope=None):
    with patch('database.get_supabase_admin_client',
               return_value=_admin_client_for_role(role, org_role, org_roles)), \
         patch('services.sis_service.resolve_org_id', return_value='org-1'), \
         patch('services.sis_service.class_scope', return_value=scope):
        yield


@pytest.mark.unit
class TestRoleTiers:
    """Advisors must not reach org-management endpoints."""

    def test_advisor_blocked_from_households(self, client, auth_headers, mock_verify_token):
        with as_role('org_managed', org_role='advisor', org_roles=['advisor']):
            resp = client.get('/api/sis/households?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 403

    def test_advisor_blocked_from_billing(self, client, auth_headers, mock_verify_token):
        with as_role('org_managed', org_role='advisor', org_roles=['advisor']):
            resp = client.get('/api/sis/billing/overview?organization_id=org-1', headers=auth_headers)
        assert resp.status_code in (403, 404)  # 403 from the gate (404 only if path differs)

    def test_advisor_blocked_from_class_create(self, client, auth_headers, mock_verify_token):
        with as_role('org_managed', org_role='advisor', org_roles=['advisor']):
            resp = client.post('/api/sis/classes', headers=auth_headers,
                               json={'organization_id': 'org-1', 'name': 'Art'})
        assert resp.status_code == 403

    def test_advisor_blocked_from_timesheets_admin(self, client, auth_headers, mock_verify_token):
        with as_role('org_managed', org_role='advisor', org_roles=['advisor']):
            resp = client.get('/api/sis/staff-admin/timesheets?organization_id=org-1&start=2026-07-01&end=2026-07-15',
                              headers=auth_headers)
        assert resp.status_code == 403

    def test_parent_who_teaches_keeps_teacher_access(self, client, auth_headers, mock_verify_token):
        with as_role('org_managed', org_role='advisor', org_roles=['advisor', 'parent'], scope=[]), \
             patch('services.sis_staff_service.teacher_classes', return_value=[]):
            resp = client.get('/api/sis/teacher/classes?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200

    def test_org_admin_reaches_admin_endpoints(self, client, auth_headers, mock_verify_token):
        with as_role('org_managed', org_role='org_admin', org_roles=['org_admin']), \
             patch('services.sis_service.households_with_members', return_value=[]):
            resp = client.get('/api/sis/households?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200


@pytest.mark.unit
class TestClassScoping:
    def test_advisor_class_list_is_filtered(self, client, auth_headers, mock_verify_token):
        classes = [{'id': 'c1', 'name': 'Art'}, {'id': 'c2', 'name': 'Robotics'}]
        with as_role('org_managed', org_role='advisor', org_roles=['advisor'], scope=['c1']), \
             patch('routes.sis.catalog.catalog.list_classes', return_value=classes):
            resp = client.get('/api/sis/classes?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200
        ids = [c['id'] for c in json.loads(resp.data)['classes']]
        assert ids == ['c1']

    def test_advisor_denied_other_class_detail(self, client, auth_headers, mock_verify_token):
        with as_role('org_managed', org_role='advisor', org_roles=['advisor'], scope=['c1']):
            resp = client.get('/api/sis/classes/c2?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 404

    def test_advisor_denied_other_class_attendance(self, client, auth_headers, mock_verify_token):
        with as_role('org_managed', org_role='advisor', org_roles=['advisor'], scope=['c1']):
            resp = client.get('/api/sis/classes/c2/attendance?date=2026-09-01&organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 404

    def test_advisor_denied_other_class_roster(self, client, auth_headers, mock_verify_token):
        with as_role('org_managed', org_role='advisor', org_roles=['advisor'], scope=['c1']):
            resp = client.get('/api/sis/teacher/classes/c2/roster?organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 404


@pytest.mark.unit
class TestTeacherPreview:
    """Admins may view another teacher's portal via ?teacher_id=; teachers can't."""

    def _org_user_lookup(self):
        client = Mock()
        t = Mock()
        client.table.return_value = t
        for chained in ('select', 'eq', 'limit'):
            getattr(t, chained).return_value = t
        t.execute.return_value = Mock(data=[{'id': 'teach-1', 'organization_id': 'org-1'}])
        return client

    def test_admin_preview_returns_targets_data(self, client, auth_headers, mock_verify_token):
        with as_role('org_managed', org_role='org_admin', org_roles=['org_admin']), \
             patch('routes.sis.staff_portal.get_supabase_admin_client',
                   return_value=self._org_user_lookup()), \
             patch('services.sis_service.caller_is_admin', return_value=True), \
             patch('services.sis_staff_service.teacher_classes', return_value=[]) as tc:
            resp = client.get('/api/sis/teacher/classes?organization_id=org-1&teacher_id=teach-1',
                              headers=auth_headers)
        assert resp.status_code == 200
        tc.assert_called_once_with('teach-1', 'org-1')

    def test_advisor_cannot_spoof_teacher_id(self, client, auth_headers, mock_verify_token):
        with as_role('org_managed', org_role='advisor', org_roles=['advisor']), \
             patch('services.sis_service.caller_is_admin', return_value=False), \
             patch('services.sis_staff_service.teacher_classes', return_value=[]) as tc:
            resp = client.get('/api/sis/teacher/classes?organization_id=org-1&teacher_id=someone-else',
                              headers=auth_headers)
        assert resp.status_code == 200
        assert tc.call_args.args[0] != 'someone-else'  # falls back to the caller

    def test_preview_denied_for_other_org_target(self, client, auth_headers, mock_verify_token):
        lookup = self._org_user_lookup()
        lookup.table.return_value.execute.return_value = Mock(
            data=[{'id': 'teach-1', 'organization_id': 'org-OTHER'}])
        with as_role('org_managed', org_role='org_admin', org_roles=['org_admin']), \
             patch('routes.sis.staff_portal.get_supabase_admin_client', return_value=lookup), \
             patch('services.sis_service.caller_is_admin', return_value=True), \
             patch('services.sis_staff_service.teacher_classes', return_value=[]) as tc:
            client.get('/api/sis/teacher/classes?organization_id=org-1&teacher_id=teach-1',
                       headers=auth_headers)
        assert tc.call_args.args[0] != 'teach-1'  # falls back to the caller


@pytest.mark.unit
class TestTimeClockService:
    def _client_with(self, execute_data_sequence):
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'limit', 'in_', 'is_', 'neq', 'order',
                        'gte', 'lte', 'insert', 'update', 'upsert'):
            getattr(table, chained).return_value = table
        table.execute.side_effect = [Mock(data=d) for d in execute_data_sequence] \
            + [Mock(data=[])] * 10
        return client

    def test_clock_in_refused_without_time_clock(self):
        from services import sis_staff_service as staff
        client = self._client_with([[{'user_id': 'u1', 'uses_time_clock': False}]])
        with patch('services.sis_staff_service.get_supabase_admin_client', return_value=client):
            result = staff.clock_in('org-1', 'u1')
        assert 'error' in result

    def test_clock_in_refused_when_already_open(self):
        from services import sis_staff_service as staff
        client = self._client_with([
            [{'user_id': 'u1', 'uses_time_clock': True}],   # profile
            [{'id': 'e1', 'clock_in': '2026-07-22T15:00:00+00:00'}],  # open entry
        ])
        with patch('services.sis_staff_service.get_supabase_admin_client', return_value=client):
            result = staff.clock_in('org-1', 'u1')
        assert 'already clocked in' in result['error']

    def test_clock_out_submits_entry(self):
        from services import sis_staff_service as staff
        client = self._client_with([
            [{'id': 'e1', 'clock_in': '2026-07-22T15:00:00+00:00'}],  # open entry
            [{'id': 'e1', 'status': 'submitted'}],                    # update result
        ])
        with patch('services.sis_staff_service.get_supabase_admin_client', return_value=client):
            result = staff.clock_out('org-1', 'u1')
        assert result['entry']['status'] == 'submitted'

    def test_entry_hours_math(self):
        from services.sis_staff_service import _entry_hours
        e = {'clock_in': '2026-07-22T15:00:00+00:00', 'clock_out': '2026-07-22T18:30:00+00:00'}
        assert _entry_hours(e) == 3.5
        assert _entry_hours({'clock_in': '2026-07-22T15:00:00+00:00', 'clock_out': None}) == 0.0

    def test_payroll_rows_only_approved_with_amounts(self):
        from services import sis_staff_service as staff
        summary = [{
            'user_id': 'u1', 'name': 'Liz Teacher', 'payroll_id': 'P42',
            'pay_type': 'hourly', 'hourly_rate_cents': 2000,
            'entries': [
                {'work_date': '2026-07-20', 'hours': 3.0, 'status': 'approved',
                 'job_label': 'Art', 'notes': None},
                {'work_date': '2026-07-21', 'hours': 2.0, 'status': 'submitted',
                 'job_label': 'Art', 'notes': None},
            ],
        }]
        with patch('services.sis_staff_service.timesheet_summary', return_value=summary):
            rows = staff.payroll_rows('org-1', '2026-07-16', '2026-07-31')
        assert len(rows) == 1  # submitted entry excluded
        assert rows[0][0] == 'Liz Teacher'
        assert rows[0][5] == 3.0     # hours
        assert rows[0][6] == 20.0    # rate in dollars
        assert rows[0][7] == 60.0    # amount

    def test_edit_requires_reason_for_time_changes(self):
        from services import sis_staff_service as staff
        client = self._client_with([[{'id': 'e1', 'organization_id': 'org-1', 'user_id': 'u1'}]])
        with patch('services.sis_staff_service.get_supabase_admin_client', return_value=client):
            result = staff.update_time_entry('org-1', 'e1', {'clock_out': '2026-07-22T18:00:00Z'},
                                            edited_by='admin-1')
        assert 'reason' in result['error']


@pytest.mark.unit
class TestFormsService:
    def test_submit_requires_body(self):
        from services import sis_forms_service as forms
        assert 'error' in forms.submit('org-1', 'u1', {'form_type': 'incident', 'body': ''})

    def test_submit_rejects_unknown_type(self):
        from services import sis_forms_service as forms
        assert 'error' in forms.submit('org-1', 'u1', {'form_type': 'nope', 'body': 'x'})

    def test_submit_notifies_admins(self):
        from services import sis_forms_service as forms
        client = Mock()
        table = Mock()
        client.table.return_value = table
        table.insert.return_value = table
        table.execute.return_value = Mock(data=[{'id': 'f1', 'title': 'Broken sink'}])
        with patch('services.sis_forms_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service.org_admin_ids', return_value=['a1', 'a2']), \
             patch('services.sis_forms_service.sis_notifications.notify') as notify:
            result = forms.submit('org-1', 'u1', {'form_type': 'maintenance', 'body': 'Sink is broken',
                                                  'title': 'Broken sink'})
        assert result['submission']['id'] == 'f1'
        assert notify.call_count == 2
