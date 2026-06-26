"""
Unit tests for SIS registration routes (/api/sis/registrations).

Role gating, validation, and the resumable lifecycle (create -> add item with
eligibility warnings -> submit -> complete). The service is mocked; the pure
eligibility logic is covered separately in test_sis_eligibility.py.
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
class TestRegistrationLifecycle:

    def test_list_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/registrations', headers=auth_headers)
        assert resp.status_code == 403

    def test_list_rejects_bad_status(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.get('/api/sis/registrations?status=bogus', headers=auth_headers)
        assert resp.status_code == 400

    def test_create_requires_student(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post('/api/sis/registrations', headers=auth_headers, json={})
        assert resp.status_code == 400

    def test_create_success(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.registration.regs.create_registration',
                            return_value={'id': 'r1', 'status': 'draft'}):
            resp = client.post('/api/sis/registrations', headers=auth_headers,
                               json={'student_user_id': 's1'})
        assert resp.status_code == 201
        assert json.loads(resp.data)['registration']['id'] == 'r1'

    def test_add_item_requires_class(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post('/api/sis/registrations/r1/items', headers=auth_headers, json={})
        assert resp.status_code == 400

    def test_add_item_returns_eligibility_warnings(self, client, auth_headers, mock_verify_token):
        result = {'item': {'id': 'i1', 'status': 'selected'},
                  'evaluation': {'eligible': True, 'is_full': False,
                                 'warnings': ['Student is 6; class minimum age is 8.'], 'conflicts': []}}
        with staff(), patch('routes.sis.registration.regs.add_item', return_value=result):
            resp = client.post('/api/sis/registrations/r1/items', headers=auth_headers,
                               json={'class_id': 'c1'})
        assert resp.status_code == 201
        body = json.loads(resp.data)
        assert body['evaluation']['warnings']

    def test_add_item_class_not_found(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.registration.regs.add_item', return_value={'error': 'Class not found'}):
            resp = client.post('/api/sis/registrations/r1/items', headers=auth_headers,
                               json={'class_id': 'cX'})
        assert resp.status_code == 404

    def test_submit_requires_items(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.registration.regs.get_registration',
                            return_value={'id': 'r1', 'items': []}):
            resp = client.post('/api/sis/registrations/r1/submit', headers=auth_headers, json={})
        assert resp.status_code == 400

    def test_submit_success(self, client, auth_headers, mock_verify_token):
        with staff(), \
             patch('routes.sis.registration.regs.get_registration',
                   return_value={'id': 'r1', 'items': [{'id': 'i1'}]}), \
             patch('routes.sis.registration.regs.submit',
                   return_value={'id': 'r1', 'status': 'submitted'}):
            resp = client.post('/api/sis/registrations/r1/submit', headers=auth_headers, json={})
        assert resp.status_code == 200
        assert json.loads(resp.data)['registration']['status'] == 'submitted'

    def test_complete_success_stamps_completer(self, client, auth_headers, mock_verify_token):
        captured = {}

        def fake_complete(org_id, reg_id, completed_by):
            captured['by'] = completed_by
            return {'registration': {'id': reg_id, 'status': 'completed'},
                    'results': [{'class_id': 'c1', 'status': 'enrolled'}]}

        with staff(), patch('routes.sis.registration.regs.complete', side_effect=fake_complete):
            resp = client.post('/api/sis/registrations/r1/complete', headers=auth_headers, json={})
        assert resp.status_code == 200
        assert captured['by'] == 'test-user-123'
        assert json.loads(resp.data)['results'][0]['status'] == 'enrolled'

    def test_eligibility_requires_student_param(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.get('/api/sis/classes/c1/eligibility', headers=auth_headers)
        assert resp.status_code == 400

    def test_eligibility_success(self, client, auth_headers, mock_verify_token):
        ev = {'eligible': True, 'is_full': False, 'warnings': [], 'conflicts': []}
        with staff(), patch('routes.sis.registration.regs.evaluate_eligibility', return_value=ev):
            resp = client.get('/api/sis/classes/c1/eligibility?student=s1', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['eligibility']['eligible'] is True
