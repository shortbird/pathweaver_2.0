"""
Staff-side waitlist actions (iCreate feedback, 2026-07-30):

  "We can't add people into a class from the waitlist that got offered a seat.
   They also can't accept the offer. And, we have waitlisted people that get
   offered a seat and it has expired before we can get them into the class."

Three defects behind that, each covered here: an offered entry could only be
resolved by the family; an expired entry was unreachable forever (offer_next
looks at 'waiting' only); and the 48h window was too short. Plus the stale-entry
bug that made counts look wrong — a student enrolled by staff stayed queued.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import sis_waitlist_service as wl


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
class TestOfferWindow:
    def test_default_window_is_a_week_not_two_days(self):
        """48h kept lapsing over a weekend before the office could act."""
        assert wl.DEFAULT_OFFER_TTL_HOURS == 168

    def test_org_can_override_the_window(self):
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[
            {'feature_flags': {'sis_settings': {'waitlist_offer_ttl_hours': 72}}}])
        with patch('services.sis_waitlist_service._admin', return_value=client):
            assert wl.offer_ttl_hours('org-1') == 72

    def test_absurd_override_falls_back_to_default(self):
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[
            {'feature_flags': {'sis_settings': {'waitlist_offer_ttl_hours': 0}}}])
        with patch('services.sis_waitlist_service._admin', return_value=client):
            assert wl.offer_ttl_hours('org-1') == wl.DEFAULT_OFFER_TTL_HOURS

    def test_missing_settings_fall_back_to_default(self):
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[{'feature_flags': {}}])
        with patch('services.sis_waitlist_service._admin', return_value=client):
            assert wl.offer_ttl_hours('org-1') == wl.DEFAULT_OFFER_TTL_HOURS


@pytest.mark.unit
class TestOfferEntry:
    """Offering a NAMED entry — the way back from an expired offer."""

    def test_expired_entry_can_be_offered_again(self):
        entry = {'id': 'w1', 'class_id': 'c1', 'status': 'expired'}
        with patch('services.sis_waitlist_service._entry', return_value=entry), \
             patch('services.sis_waitlist_service._mark_offered',
                   return_value={'id': 'w1', 'status': 'offered'}) as mark:
            result = wl.offer_entry('org-1', 'w1')
        assert result['entry']['status'] == 'offered'
        mark.assert_called_once_with('org-1', 'c1', 'w1')

    def test_declined_entry_can_be_offered_again(self):
        entry = {'id': 'w1', 'class_id': 'c1', 'status': 'declined'}
        with patch('services.sis_waitlist_service._entry', return_value=entry), \
             patch('services.sis_waitlist_service._mark_offered',
                   return_value={'id': 'w1', 'status': 'offered'}):
            assert 'error' not in wl.offer_entry('org-1', 'w1')

    def test_already_enrolled_entry_is_refused(self):
        entry = {'id': 'w1', 'class_id': 'c1', 'status': 'promoted'}
        with patch('services.sis_waitlist_service._entry', return_value=entry):
            assert 'error' in wl.offer_entry('org-1', 'w1')

    def test_unknown_entry_is_not_found(self):
        with patch('services.sis_waitlist_service._entry', return_value=None):
            assert wl.offer_entry('org-1', 'nope')['error'] == 'Waitlist entry not found'


@pytest.mark.unit
class TestEnrollEntry:
    """Staff admitting someone directly, without waiting for a family click."""

    def test_offered_entry_enrolls(self):
        entry = {'id': 'w1', 'class_id': 'c1', 'status': 'offered'}
        with patch('services.sis_waitlist_service._entry', return_value=entry), \
             patch('services.sis_waitlist_service.respond_to_offer',
                   return_value={'entry': {'id': 'w1', 'status': 'promoted'}, 'enrolled': True}) as respond:
            result = wl.enroll_entry('org-1', 'w1', enrolled_by='admin-1')
        assert result['enrolled'] is True
        respond.assert_called_once_with('org-1', 'w1', True, 'admin-1')

    def test_expired_entry_still_enrolls(self):
        """The whole point: the offer lapsing must not strand the admission."""
        entry = {'id': 'w1', 'class_id': 'c1', 'status': 'expired'}
        with patch('services.sis_waitlist_service._entry', return_value=entry), \
             patch('services.sis_waitlist_service.respond_to_offer',
                   return_value={'entry': {'id': 'w1'}, 'enrolled': True}):
            assert wl.enroll_entry('org-1', 'w1', enrolled_by='admin-1')['enrolled'] is True

    def test_already_promoted_is_idempotent(self):
        entry = {'id': 'w1', 'class_id': 'c1', 'status': 'promoted'}
        with patch('services.sis_waitlist_service._entry', return_value=entry), \
             patch('services.sis_waitlist_service.respond_to_offer') as respond:
            result = wl.enroll_entry('org-1', 'w1', enrolled_by='admin-1')
        assert result['already_enrolled'] is True
        respond.assert_not_called()


@pytest.mark.unit
class TestStaleEntryCleanup:
    """A student enrolled some other way must not stay queued for the class."""

    def _client_with_entries(self, entries):
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'in_', 'update', 'delete'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=entries)
        return client, table

    def test_live_entries_are_marked_promoted(self):
        client, table = self._client_with_entries([
            {'id': 'w1', 'status': 'waiting'}, {'id': 'w2', 'status': 'offered'},
        ])
        with patch('services.sis_waitlist_service._admin', return_value=client):
            wl.clear_entry_for_enrollment('org-1', 'c1', 's1')
        payload = table.update.call_args[0][0]
        assert payload['status'] == 'promoted'
        assert sorted(table.in_.call_args[0][1]) == ['w1', 'w2']

    def test_nothing_live_is_a_no_op(self):
        client, table = self._client_with_entries([{'id': 'w1', 'status': 'expired'}])
        with patch('services.sis_waitlist_service._admin', return_value=client):
            wl.clear_entry_for_enrollment('org-1', 'c1', 's1')
        table.update.assert_not_called()

    def test_a_failure_never_propagates(self):
        """Clearing the queue is bookkeeping — it must not break an enrollment."""
        client = Mock()
        client.table.side_effect = RuntimeError('boom')
        with patch('services.sis_waitlist_service._admin', return_value=client):
            wl.clear_entry_for_enrollment('org-1', 'c1', 's1')  # does not raise

    def test_enrolled_student_is_never_queued(self):
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'limit', 'in_', 'update'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[{'id': 'enr-1'}])
        with patch('services.sis_waitlist_service._admin', return_value=client), \
             patch('services.sis_waitlist_service.clear_entry_for_enrollment') as clear:
            result = wl.add_to_waitlist('org-1', 'c1', 's1')
        assert result == {'already_enrolled': True}
        clear.assert_called_once()


@pytest.mark.unit
class TestNobodyWaitingReason:
    """iCreate, 2026-07-31: "It says 'offer next seat' on brain games thurs for 1
    on the waitlist, but when I click on it it says no one is waiting."

    The class row's waitlist count is the whole live queue (waiting + offered),
    but only a `waiting` entry can be offered — so the answer has to name the
    state, not deny the queue exists."""

    def _reason(self, entries):
        with patch('services.sis_waitlist_service.list_for_class', return_value=entries):
            return wl.nobody_waiting_reason('org-1', 'c1')

    def test_an_outstanding_offer_is_named(self):
        reason = self._reason([{'status': 'offered'}])
        assert 'already' in reason and 'offer' in reason
        assert 'Waitlist tab' in reason

    def test_several_outstanding_offers_are_counted(self):
        assert '2 students' in self._reason([{'status': 'offered'}, {'status': 'offered'}])

    def test_only_lapsed_entries_say_so(self):
        reason = self._reason([{'status': 'expired'}, {'status': 'declined'}])
        assert 'lapsed' in reason

    def test_a_genuinely_empty_waitlist_says_that(self):
        assert self._reason([]) == 'No one is on this waitlist.'

    def test_route_returns_the_reason_instead_of_no_one_waiting(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.waitlist._class_in_org', return_value=True), \
             patch('routes.sis.waitlist.waitlist.offer_next', return_value=None), \
             patch('routes.sis.waitlist.waitlist.nobody_waiting_reason',
                   return_value='1 student on this waitlist already has an offer out.'):
            resp = client.post('/api/sis/classes/c1/waitlist/offer-next',
                               headers=auth_headers, json={'organization_id': 'org-1'})
        body = json.loads(resp.data)
        assert resp.status_code == 200
        assert body['entry'] is None
        assert body['message'] == '1 student on this waitlist already has an offer out.'


@pytest.mark.unit
class TestWaitlistBreakdown:
    """The class list must be able to tell 'waiting' from 'offered', or the count
    and the Offer-next-seat button disagree."""

    def _repo(self, rows):
        from repositories.sis_class_repository import SisClassRepository
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'in_', 'eq', 'order', 'range', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=rows)
        return SisClassRepository(client=client)

    def test_splits_waiting_from_offered(self):
        repo = self._repo([
            {'id': '1', 'class_id': 'c1', 'status': 'waiting'},
            {'id': '2', 'class_id': 'c1', 'status': 'offered'},
            {'id': '3', 'class_id': 'c2', 'status': 'offered'},
        ])
        out = repo.waitlist_breakdown_for_classes(['c1', 'c2'])
        assert out['c1'] == {'waiting': 1, 'offered': 1}
        assert out['c2'] == {'waiting': 0, 'offered': 1}

    def test_total_still_matches_the_old_count(self):
        repo = self._repo([
            {'id': '1', 'class_id': 'c1', 'status': 'waiting'},
            {'id': '2', 'class_id': 'c1', 'status': 'offered'},
        ])
        assert repo.waitlist_counts_for_classes(['c1']) == {'c1': 2}

    def test_no_classes_is_empty(self):
        repo = self._repo([])
        assert repo.waitlist_breakdown_for_classes([]) == {}


@pytest.mark.unit
class TestStaffRoutes:
    def test_offer_entry_route(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.waitlist.waitlist.offer_entry',
                            return_value={'entry': {'id': 'w1', 'status': 'offered'}}):
            resp = client.post('/api/sis/waitlist/w1/offer', headers=auth_headers,
                               json={'organization_id': 'org-1'})
        assert resp.status_code == 200
        assert json.loads(resp.data)['entry']['status'] == 'offered'

    def test_offer_entry_conflict_is_409(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.waitlist.waitlist.offer_entry',
                            return_value={'error': 'That student is already promoted'}):
            resp = client.post('/api/sis/waitlist/w1/offer', headers=auth_headers,
                               json={'organization_id': 'org-1'})
        assert resp.status_code == 409

    def test_enroll_entry_route(self, client, auth_headers, mock_verify_token):
        captured = {}

        def fake_enroll(org_id, entry_id, enrolled_by):
            captured.update(entry=entry_id, by=enrolled_by)
            return {'entry': {'id': entry_id}, 'enrolled': True}

        with staff(), patch('routes.sis.waitlist.waitlist.enroll_entry', side_effect=fake_enroll):
            resp = client.post('/api/sis/waitlist/w1/enroll', headers=auth_headers,
                               json={'organization_id': 'org-1'})
        assert resp.status_code == 200
        assert captured == {'entry': 'w1', 'by': 'test-user-123'}

    def test_enroll_entry_is_staff_only(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('student')):
            resp = client.post('/api/sis/waitlist/w1/enroll', headers=auth_headers,
                               json={'organization_id': 'org-1'})
        assert resp.status_code == 403
