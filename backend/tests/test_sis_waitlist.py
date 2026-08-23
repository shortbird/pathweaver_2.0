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

    def test_add_warns_when_still_on_the_enrollment_waitlist(
            self, client, auth_headers, mock_verify_token):
        """iCreate, 2026-08-13: "I should not be able to put someone onto a class
        waitlist if they are on the enrollment waitlist." They have no place at
        the school yet, so they can't hold a place in its classes."""
        with staff(), patch('routes.sis.waitlist._class_in_org', return_value=True), \
             patch('services.sis_enrollment_waitlist_service.waiting_entry',
                   return_value={'id': 'e1', 'position': 4}), \
             patch('routes.sis.waitlist.waitlist.add_to_waitlist') as add:
            resp = client.post('/api/sis/classes/c1/waitlist', headers=auth_headers,
                               json={'student_user_id': 's1', 'organization_id': 'org-1'})
        assert resp.status_code == 409
        assert json.loads(resp.data)['enrollment_waitlisted'] is True
        add.assert_not_called()

    def test_add_honours_force_past_the_warning(self, client, auth_headers, mock_verify_token):
        """A warning, not a wall — the office can queue a class ahead of an
        admission it knows is coming."""
        with staff(), patch('routes.sis.waitlist._class_in_org', return_value=True), \
             patch('services.sis_enrollment_waitlist_service.waiting_entry',
                   return_value={'id': 'e1', 'position': 4}), \
             patch('routes.sis.waitlist.waitlist.add_to_waitlist',
                   return_value={'id': 'w1', 'position': 1}) as add:
            resp = client.post('/api/sis/classes/c1/waitlist', headers=auth_headers,
                               json={'student_user_id': 's1', 'organization_id': 'org-1',
                                     'force': True})
        assert resp.status_code == 201
        add.assert_called_once()

    def test_add_is_unaffected_for_an_enrolled_student(
            self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.waitlist._class_in_org', return_value=True), \
             patch('services.sis_enrollment_waitlist_service.waiting_entry', return_value=None), \
             patch('routes.sis.waitlist.waitlist.add_to_waitlist',
                   return_value={'id': 'w1', 'position': 1}):
            resp = client.post('/api/sis/classes/c1/waitlist', headers=auth_headers,
                               json={'student_user_id': 's1', 'organization_id': 'org-1'})
        assert resp.status_code == 201

    def test_direct_enrollment_warns_when_still_on_the_enrollment_waitlist(
            self, client, auth_headers, mock_verify_token):
        """The class waitlist is not the only door. Enrolling an
        enrollment-waitlisted student outright is the stronger version of the
        same mistake, so /classes/<id>/enrollments asks too."""
        # catalog.py binds get_supabase_admin_client at import, so the staff()
        # fixture's patch of database.* never reaches it — patch it by name here.
        cat_client = Mock()
        cat_table = Mock()
        cat_client.table.return_value = cat_table
        for chained in ('select', 'eq', 'limit'):
            getattr(cat_table, chained).return_value = cat_table
        cat_table.execute.return_value = Mock(data=[{'id': 's1', 'organization_id': 'org-1'}])
        with staff(), patch('routes.sis.catalog.get_supabase_admin_client', return_value=cat_client), \
             patch('routes.sis.catalog._org_or_error', return_value=('org-1', None)), \
             patch('routes.sis.catalog._load_class', return_value={'id': 'c1'}), \
             patch('services.sis_enrollment_waitlist_service.waiting_entry',
                   return_value={'id': 'e1', 'position': 2}):
            resp = client.post('/api/sis/classes/c1/enrollments', headers=auth_headers,
                               json={'student_user_id': 's1', 'organization_id': 'org-1'})
        assert resp.status_code == 409
        assert json.loads(resp.data)['enrollment_waitlisted'] is True

    def test_offer_next_when_empty(self, client, auth_headers, mock_verify_token):
        # The response also explains WHY nobody could be offered (see
        # TestNobodyWaitingReason in test_sis_waitlist_staff_actions.py).
        with staff(), patch('routes.sis.waitlist._class_in_org', return_value=True), \
             patch('routes.sis.waitlist.waitlist.offer_next', return_value=None), \
             patch('routes.sis.waitlist.waitlist.nobody_waiting_reason',
                   return_value='No one is on this waitlist.'):
            resp = client.post('/api/sis/classes/c1/waitlist/offer-next',
                               headers=auth_headers, json={'organization_id': 'org-1'})
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body['entry'] is None
        assert body['message'] == 'No one is on this waitlist.'

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

        def fake_respond(org_id, entry_id, accept, enrolled_by, force=False):
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


@pytest.mark.unit
class TestOfferSweepRoute:
    """The cron entrypoint that expires stale offers (X-Cron-Secret or superadmin)."""

    def test_sweep_forbidden_for_non_super_without_secret(self, client, auth_headers, mock_verify_token):
        with patch('utils.session_manager.session_manager.get_effective_user_id',
                   return_value='test-user-123'), \
             patch('routes.sis.waitlist.get_supabase_admin_client',
                   return_value=_admin_client_for_role('student')):
            resp = client.post('/api/sis/internal/waitlist-offer-sweep', headers=auth_headers, json={})
        assert resp.status_code == 401

    def test_sweep_runs_for_superadmin(self, client, auth_headers, mock_verify_token):
        with patch('utils.session_manager.session_manager.get_effective_user_id',
                   return_value='super-1'), \
             patch('routes.sis.waitlist.get_supabase_admin_client',
                   return_value=_admin_client_for_role('superadmin')), \
             patch('routes.sis.waitlist.waitlist.expire_stale_offers',
                   return_value={'expired': 2, 'reAlerted': 1}) as sweep:
            resp = client.post('/api/sis/internal/waitlist-offer-sweep', headers=auth_headers, json={})
        assert resp.status_code == 200
        assert json.loads(resp.data)['expired'] == 2
        sweep.assert_called_once()


@pytest.mark.unit
class TestParentClaimRoute:
    """The guardian-facing claim-spot route (family-relationship auth in the service)."""

    def test_claim_success(self, client, auth_headers, mock_verify_token):
        with patch('routes.sis.parent.parent.claim_offered_spot',
                   return_value={'enrolled': True, 'class_name': 'Art'}):
            resp = client.post('/api/sis/parent/students/s1/classes/c1/claim',
                               headers=auth_headers, json={'organization_id': 'org-1'})
        assert resp.status_code == 200
        assert json.loads(resp.data)['enrolled'] is True

    def test_claim_no_live_offer(self, client, auth_headers, mock_verify_token):
        with patch('routes.sis.parent.parent.claim_offered_spot',
                   return_value={'error': 'There is no spot being offered for this class right now.'}):
            resp = client.post('/api/sis/parent/students/s1/classes/c1/claim',
                               headers=auth_headers, json={'organization_id': 'org-1'})
        assert resp.status_code == 400

    def test_claim_not_authorized(self, client, auth_headers, mock_verify_token):
        with patch('routes.sis.parent.parent.claim_offered_spot',
                   return_value={'error': 'Not authorized for this student'}):
            resp = client.post('/api/sis/parent/students/s1/classes/c1/claim',
                               headers=auth_headers, json={'organization_id': 'org-1'})
        assert resp.status_code == 403


@pytest.mark.unit
class TestSeatHolds:
    """A live offer HOLDS its seat: no other family-facing enrollment path may
    hand it out (iCreate, 2026-08-22 — three families could not claim offered
    seats because direct enrolls filled the class under the offer)."""

    def _offer_rows(self, rows):
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=rows)
        return client

    def test_live_offers_count(self):
        from datetime import datetime, timedelta, timezone
        future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        rows = [
            {'id': 'w1', 'student_user_id': 's1', 'offer_expires_at': future},
            {'id': 'w2', 'student_user_id': 's2', 'offer_expires_at': future},
        ]
        with patch.object(wl, '_admin', return_value=self._offer_rows(rows)):
            assert wl.live_offer_count('c1') == 2

    def test_expired_offers_do_not_hold_seats(self):
        from datetime import datetime, timedelta, timezone
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        rows = [
            {'id': 'w1', 'student_user_id': 's1', 'offer_expires_at': past},
            {'id': 'w2', 'student_user_id': 's2', 'offer_expires_at': future},
        ]
        with patch.object(wl, '_admin', return_value=self._offer_rows(rows)):
            assert wl.live_offer_count('c1') == 1

    def test_the_claimants_own_offer_is_excluded(self):
        from datetime import datetime, timedelta, timezone
        future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        rows = [{'id': 'w1', 'student_user_id': 's1', 'offer_expires_at': future}]
        with patch.object(wl, '_admin', return_value=self._offer_rows(rows)):
            assert wl.live_offer_count('c1', exclude_student_id='s1') == 0

    def test_a_lookup_failure_holds_nothing(self):
        boom = Mock()
        boom.table.side_effect = RuntimeError('supabase down')
        with patch.object(wl, '_admin', return_value=boom):
            assert wl.live_offer_count('c1') == 0

    def test_catalog_counts_held_seats_as_taken(self):
        from services import sis_catalog_service as cat
        assert cat.spots_left(10, 8, held=2) == 0
        assert cat.spots_left(10, 8, held=1) == 1
        assert cat.is_full(10, 9, held=1) is True
        assert cat.is_full(10, 9, held=0) is False
        assert cat.is_full(None, 9, held=5) is False  # unlimited stays unlimited
