"""
Unit tests for the SIS waitlist: pure ordering logic + route gating/flow.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import sis_waitlist_service as wl


class TestOrderingLogic:
    def test_next_position_empty(self):
        assert wl.next_position([]) == 1

    def test_next_position_appends(self):
        assert wl.next_position([{'position': 1}, {'position': 2}]) == 3

    def test_next_position_handles_gaps(self):
        assert wl.next_position([{'position': 1}, {'position': 5}]) == 6

    def test_pick_next_lowest_waiting(self):
        entries = [
            {'id': 'a', 'position': 1, 'status': 'declined'},
            {'id': 'b', 'position': 2, 'status': 'waiting'},
            {'id': 'c', 'position': 3, 'status': 'waiting'},
        ]
        assert wl.pick_next_to_offer(entries)['id'] == 'b'

    def test_pick_next_none_waiting(self):
        entries = [{'id': 'a', 'position': 1, 'status': 'offered'}]
        assert wl.pick_next_to_offer(entries) is None

    def test_pick_next_empty(self):
        assert wl.pick_next_to_offer([]) is None


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
class TestWaitlistRoutes:

    def test_list_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/classes/c1/waitlist', headers=auth_headers)
        assert resp.status_code == 403

    def test_list_class_not_found(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.waitlist._class_in_org', return_value=False):
            resp = client.get('/api/sis/classes/c1/waitlist?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 404

    def test_list_success(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.waitlist._class_in_org', return_value=True), \
             patch('routes.sis.waitlist.waitlist.list_for_class',
                   return_value=[{'id': 'w1', 'position': 1, 'student_name': 'Bo', 'status': 'waiting'}]):
            resp = client.get('/api/sis/classes/c1/waitlist?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['waitlist'][0]['student_name'] == 'Bo'

    def test_add_requires_student(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.waitlist._class_in_org', return_value=True):
            resp = client.post('/api/sis/classes/c1/waitlist', headers=auth_headers, json={})
        assert resp.status_code == 400

    def test_offer_next_when_empty(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.waitlist._class_in_org', return_value=True), \
             patch('routes.sis.waitlist.waitlist.offer_next', return_value=None):
            resp = client.post('/api/sis/classes/c1/waitlist/offer-next',
                               headers=auth_headers, json={'organization_id': 'org-1'})
        assert resp.status_code == 200
        assert json.loads(resp.data)['entry'] is None

    def test_offer_next_success(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.waitlist._class_in_org', return_value=True), \
             patch('routes.sis.waitlist.waitlist.offer_next',
                   return_value={'id': 'w1', 'status': 'offered'}):
            resp = client.post('/api/sis/classes/c1/waitlist/offer-next',
                               headers=auth_headers, json={'organization_id': 'org-1'})
        assert resp.status_code == 200
        assert json.loads(resp.data)['entry']['status'] == 'offered'

    def test_respond_accept_enrolls(self, client, auth_headers, mock_verify_token):
        captured = {}

        def fake_respond(org_id, entry_id, accept, enrolled_by):
            captured.update(accept=accept, by=enrolled_by)
            return {'entry': {'id': entry_id, 'status': 'promoted'}, 'enrolled': True}

        with staff(), patch('routes.sis.waitlist.waitlist.respond_to_offer', side_effect=fake_respond):
            resp = client.post('/api/sis/waitlist/w1/respond', headers=auth_headers,
                               json={'accept': True, 'organization_id': 'org-1'})
        assert resp.status_code == 200
        assert captured['accept'] is True
        assert captured['by'] == 'test-user-123'
        assert json.loads(resp.data)['enrolled'] is True

    def test_respond_not_found(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.waitlist.waitlist.respond_to_offer',
                            return_value={'error': 'Waitlist entry not found'}):
            resp = client.post('/api/sis/waitlist/wX/respond', headers=auth_headers,
                               json={'accept': False, 'organization_id': 'org-1'})
        assert resp.status_code == 404
