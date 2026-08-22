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
        respond.assert_called_once_with('org-1', 'w1', True, 'admin-1', force=False)

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

    def test_clears_sibling_sections_waitlist(self):
        """When enrolled in section A, waitlist entries for sibling section B are also promoted."""
        with patch('services.sis_waitlist_service._sibling_class_ids', return_value=['c1', 'c2']), \
             patch('services.sis_waitlist_service._admin') as admin_mock:
            client = Mock()
            table = Mock()
            admin_mock.return_value = client
            client.table.return_value = table
            for chained in ('select', 'eq', 'in_', 'update'):
                getattr(table, chained).return_value = table
            table.execute.return_value = Mock(data=[
                {'id': 'w1', 'class_id': 'c1', 'status': 'waiting'},
                {'id': 'w2', 'class_id': 'c2', 'status': 'waiting'},
            ])
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
class TestSiblingSections:
    """iCreate, 2026-07-31: "Could we offer other sections of classes to people
    on a waitlist? ... there are 8 on the waitlist on tuesday at 10:30am, but we
    have spots in the other ukelele classes." Sections are matched on the name
    before the "(" — the school's own convention."""

    CLASSES = [
        {'id': 'c1', 'name': 'Ukelele Jam (Tue 10:30)', 'capacity': 8, 'enrolled_count': 8},
        {'id': 'c2', 'name': 'Ukelele Jam (Thu 1:00)', 'capacity': 8, 'enrolled_count': 3},
        {'id': 'c3', 'name': 'Ukelele Jam (Fri 9:00)', 'capacity': 8, 'enrolled_count': 8},
        {'id': 'c4', 'name': 'Ukelele Jam (Mon 2:00)', 'capacity': None, 'enrolled_count': 40},
        {'id': 'c5', 'name': 'Lego Lab (Tue 10:30)', 'capacity': 12, 'enrolled_count': 1},
        {'id': 'c6', 'name': 'Ukelele Jam (Old)', 'capacity': 8, 'enrolled_count': 0,
         'status': 'archived'},
    ]

    def test_base_name_strips_the_section(self):
        assert wl.section_base_name('Ukelele Jam (Tue 10:30)') == 'ukelele jam'
        assert wl.section_base_name('  Reading Workshop  ') == 'reading workshop'
        assert wl.section_base_name(None) == ''

    def _sections(self, class_id='c1'):
        with patch('services.sis_catalog_service.list_classes', return_value=self.CLASSES):
            return wl.sibling_sections('org-1', class_id)

    def test_only_same_class_sections_with_room(self):
        ids = [s['class_id'] for s in self._sections()]
        assert ids == ['c4', 'c2']  # sorted by name: (Mon 2:00) then (Thu 1:00)

    def test_a_full_section_is_not_offered(self):
        assert 'c3' not in [s['class_id'] for s in self._sections()]

    def test_a_different_class_is_never_a_section(self):
        assert 'c5' not in [s['class_id'] for s in self._sections()]

    def test_archived_sections_are_skipped(self):
        assert 'c6' not in [s['class_id'] for s in self._sections()]

    def test_unknown_class_has_no_siblings(self):
        assert self._sections('nope') == []


@pytest.mark.unit
class TestEnrollInAnotherSection:
    def test_enrolls_there_and_closes_the_original_place(self):
        entry = {'id': 'w1', 'class_id': 'c1', 'status': 'waiting', 'student_user_id': 's1'}
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'in_', 'limit', 'update', 'upsert', 'delete'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[{'id': 'w1', 'status': 'promoted'}])
        with patch('services.sis_waitlist_service._entry', return_value=entry), \
             patch('services.sis_waitlist_service.sibling_sections',
                   return_value=[{'class_id': 'c2', 'name': 'Ukelele Jam (Thu 1:00)'}]), \
             patch('services.sis_waitlist_service._admin', return_value=client), \
             patch('services.class_group_sync_service.sync_class_group'), \
             patch('services.sis_waitlist_service.clear_entry_for_enrollment') as clear:
            result = wl.enroll_entry('org-1', 'w1', enrolled_by='admin-1', class_id='c2')
        assert result['enrolled'] is True
        assert result['moved_to']['name'] == 'Ukelele Jam (Thu 1:00)'
        # They must not end up enrolled in c2 AND queued for it.
        clear.assert_called_once_with('org-1', 'c2', 's1')

    def test_a_class_that_is_not_a_sibling_is_refused(self):
        entry = {'id': 'w1', 'class_id': 'c1', 'status': 'waiting', 'student_user_id': 's1'}
        with patch('services.sis_waitlist_service._entry', return_value=entry), \
             patch('services.sis_waitlist_service.sibling_sections', return_value=[]):
            result = wl.enroll_entry('org-1', 'w1', enrolled_by='admin-1', class_id='elsewhere')
        assert 'error' in result

    def test_no_class_id_still_enrolls_in_the_original(self):
        entry = {'id': 'w1', 'class_id': 'c1', 'status': 'offered', 'student_user_id': 's1'}
        with patch('services.sis_waitlist_service._entry', return_value=entry), \
             patch('services.sis_waitlist_service.respond_to_offer',
                   return_value={'enrolled': True}) as respond:
            assert wl.enroll_entry('org-1', 'w1', enrolled_by='admin-1')['enrolled'] is True
        respond.assert_called_once()


@pytest.mark.unit
class TestAdmitIntoTheOriginalClassChecksTheClock:
    """iCreate, 2026-08-14: "We shouldn't be able to allow students to double
    book for classes... I think it's because I added her to one from a
    waitlist." Charlotte Myers held two Elementary Microschool sections that
    both met Wednesday 09:30-15:00. The sibling-section move and the age
    exception both checked for a clash; admitting into the class the student
    actually queued for did not, so it was the one way left to do it."""

    ENTRY = {'id': 'w1', 'class_id': 'c1', 'status': 'offered', 'student_user_id': 's1'}
    CLASH = [{'class_id': 'c9', 'class_name': 'Elementary Microschool (Wednesday)'}]

    def test_clash_refuses_and_names_the_class(self):
        with patch('services.sis_waitlist_service._admin') as admin, \
             patch('services.sis_waitlist_service.schedule_conflicts', return_value=self.CLASH):
            admin.return_value.table.return_value.select.return_value.eq.return_value \
                .eq.return_value.limit.return_value.execute.return_value = Mock(data=[self.ENTRY])
            result = wl.respond_to_offer('org-1', 'w1', True, 'admin-1')
        assert result['conflicts'] == self.CLASH
        assert not result.get('enrolled')
        # Nothing was written: the upsert would be a second call on the client.
        assert not admin.return_value.table.return_value.upsert.called

    def test_force_admits_anyway(self):
        """The office overrides — they can see the family's week; we can't."""
        with patch('services.sis_waitlist_service._admin') as admin, \
             patch('services.sis_waitlist_service.schedule_conflicts', return_value=self.CLASH), \
             patch('services.sis_waitlist_service.sync_class_group', create=True), \
             patch('services.class_group_sync_service.sync_class_group'):
            admin.return_value.table.return_value.select.return_value.eq.return_value \
                .eq.return_value.limit.return_value.execute.return_value = Mock(data=[self.ENTRY])
            result = wl.respond_to_offer('org-1', 'w1', True, 'admin-1', force=True)
        assert result['enrolled'] is True

    def test_a_clear_week_enrolls_without_a_prompt(self):
        with patch('services.sis_waitlist_service._admin') as admin, \
             patch('services.sis_waitlist_service.schedule_conflicts', return_value=[]), \
             patch('services.class_group_sync_service.sync_class_group'):
            admin.return_value.table.return_value.select.return_value.eq.return_value \
                .eq.return_value.limit.return_value.execute.return_value = Mock(data=[self.ENTRY])
            result = wl.respond_to_offer('org-1', 'w1', True, 'admin-1')
        assert result['enrolled'] is True
        assert 'conflicts' not in result


@pytest.mark.unit
class TestOfferOtherSection:
    """iCreate, 2026-08-01, on the first cut of cross-section placement: "can we
    OFFER them the seat since we don't know what their schedule is? If we enroll
    them, then they'll be enrolled in two sections at the same time."

    So the family gets a claimable offer for the section that has room, and a
    direct enroll refuses once when it would double-book them."""

    ENTRY = {'id': 'w1', 'class_id': 'c1', 'status': 'waiting', 'student_user_id': 's1'}
    SECTION = {'class_id': 'c2', 'name': 'Ukelele Jam (Thu 1:00)'}

    def _client(self, by_table=None):
        """Answers per table name — the enrollment probe and the waitlist probe
        hit the same builder shape, so one flat mock conflates them."""
        by_table = by_table or {}
        client = Mock()

        def _table(name):
            t = Mock()
            for chained in ('select', 'eq', 'limit', 'in_', 'update', 'upsert', 'delete'):
                getattr(t, chained).return_value = t
            t.execute.side_effect = lambda: Mock(data=list(by_table.get(name, [])))
            return t

        client.table.side_effect = _table
        return client

    def test_offers_the_other_section_to_the_family(self):
        with patch('services.sis_waitlist_service._entry', return_value=self.ENTRY), \
             patch('services.sis_waitlist_service.sibling_sections', return_value=[self.SECTION]), \
             patch('services.sis_waitlist_service._admin', return_value=self._client()), \
             patch('services.sis_waitlist_service.add_to_waitlist',
                   return_value={'id': 'w9', 'status': 'waiting'}), \
             patch('services.sis_waitlist_service._mark_offered',
                   return_value={'id': 'w9', 'status': 'offered'}) as mark:
            out = wl.offer_other_section('org-1', 'w1', 'c2')
        assert out['offered_section']['name'] == 'Ukelele Jam (Thu 1:00)'
        mark.assert_called_once_with('org-1', 'c2', 'w9')

    def test_reuses_an_existing_entry_on_the_target_section(self):
        with patch('services.sis_waitlist_service._entry', return_value=self.ENTRY), \
             patch('services.sis_waitlist_service.sibling_sections', return_value=[self.SECTION]), \
             patch('services.sis_waitlist_service._admin', return_value=self._client(
                   {'sis_waitlist_entries': [{'id': 'w5', 'status': 'expired'}]})), \
             patch('services.sis_waitlist_service.add_to_waitlist') as add, \
             patch('services.sis_waitlist_service._mark_offered',
                   return_value={'id': 'w5', 'status': 'offered'}):
            out = wl.offer_other_section('org-1', 'w1', 'c2')
        assert 'error' not in out
        add.assert_not_called()   # no second row for the same student+class

    def test_a_class_that_is_not_a_sibling_is_refused(self):
        with patch('services.sis_waitlist_service._entry', return_value=self.ENTRY), \
             patch('services.sis_waitlist_service.sibling_sections', return_value=[]):
            assert 'error' in wl.offer_other_section('org-1', 'w1', 'elsewhere')

    def test_someone_already_in_that_section_is_not_offered_it(self):
        with patch('services.sis_waitlist_service._entry', return_value=self.ENTRY), \
             patch('services.sis_waitlist_service.sibling_sections', return_value=[self.SECTION]), \
             patch('services.sis_waitlist_service._admin', return_value=self._client(
                   {'class_enrollments': [{'id': 'enr-1'}]})):
            out = wl.offer_other_section('org-1', 'w1', 'c2')
        assert 'already enrolled' in out['error']


@pytest.mark.unit
class TestCrossSectionClashGuard:
    """Another section means another time, and the family's week isn't visible
    from the office."""

    ENTRY = {'id': 'w1', 'class_id': 'c1', 'status': 'waiting', 'student_user_id': 's1'}

    def test_a_clash_is_reported_instead_of_double_booking(self):
        with patch('services.sis_waitlist_service._entry', return_value=self.ENTRY), \
             patch('services.sis_waitlist_service.sibling_sections',
                   return_value=[{'class_id': 'c2', 'name': 'Ukelele Jam (Thu 1:00)'}]), \
             patch('services.sis_waitlist_service.schedule_conflicts',
                   return_value=[{'class_id': 'cX', 'class_name': 'Art Expeditions'}]):
            out = wl.enroll_entry('org-1', 'w1', enrolled_by='admin-1', class_id='c2')
        assert out['conflicts'][0]['class_name'] == 'Art Expeditions'
        assert out['section'] == 'Ukelele Jam (Thu 1:00)'
        assert 'enrolled' not in out

    def test_force_goes_through(self):
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'limit', 'in_', 'update', 'upsert'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[{'id': 'w1', 'status': 'promoted'}])
        with patch('services.sis_waitlist_service._entry', return_value=self.ENTRY), \
             patch('services.sis_waitlist_service.sibling_sections',
                   return_value=[{'class_id': 'c2', 'name': 'Ukelele Jam (Thu 1:00)'}]), \
             patch('services.sis_waitlist_service.schedule_conflicts',
                   return_value=[{'class_id': 'cX', 'class_name': 'Art Expeditions'}]), \
             patch('services.sis_waitlist_service._admin', return_value=client), \
             patch('services.class_group_sync_service.sync_class_group'), \
             patch('services.sis_waitlist_service.clear_entry_for_enrollment'):
            out = wl.enroll_entry('org-1', 'w1', enrolled_by='admin-1', class_id='c2', force=True)
        assert out['enrolled'] is True

    def test_a_failed_conflict_lookup_never_blocks_staff(self):
        with patch('services.sis_exception_service._same_time_conflicts',
                   side_effect=RuntimeError('boom')):
            assert wl.schedule_conflicts('s1', 'c2') == []


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

        def fake_enroll(org_id, entry_id, enrolled_by, class_id=None, force=False):
            captured.update(entry=entry_id, by=enrolled_by, target=class_id)
            return {'entry': {'id': entry_id}, 'enrolled': True}

        with staff(), patch('routes.sis.waitlist.waitlist.enroll_entry', side_effect=fake_enroll):
            resp = client.post('/api/sis/waitlist/w1/enroll', headers=auth_headers,
                               json={'organization_id': 'org-1'})
        assert resp.status_code == 200
        assert captured == {'entry': 'w1', 'by': 'test-user-123', 'target': None}

    def test_enroll_entry_route_passes_another_section(self, client, auth_headers, mock_verify_token):
        """Placing a waitlisted student in a sibling section goes through the
        same action, with the target class named."""
        captured = {}

        def fake_enroll(org_id, entry_id, enrolled_by, class_id=None, force=False):
            captured['target'] = class_id
            return {'enrolled': True, 'moved_to': {'class_id': class_id, 'name': 'Ukelele Jam (Thu 1:00)'}}

        with staff(), patch('routes.sis.waitlist.waitlist.enroll_entry', side_effect=fake_enroll):
            resp = client.post('/api/sis/waitlist/w1/enroll', headers=auth_headers,
                               json={'organization_id': 'org-1', 'class_id': 'c2'})
        assert resp.status_code == 200
        assert captured['target'] == 'c2'
        assert json.loads(resp.data)['moved_to']['name'] == 'Ukelele Jam (Thu 1:00)'

    def test_sibling_sections_route(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.waitlist._class_in_org', return_value=True), \
             patch('routes.sis.waitlist.waitlist.sibling_sections',
                   return_value=[{'class_id': 'c2', 'name': 'Ukelele Jam (Thu 1:00)',
                                  'capacity': 8, 'enrolled_count': 3}]):
            resp = client.get('/api/sis/classes/c1/sibling-sections?organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['sections'][0]['class_id'] == 'c2'

    def test_enroll_entry_is_staff_only(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('student')):
            resp = client.post('/api/sis/waitlist/w1/enroll', headers=auth_headers,
                               json={'organization_id': 'org-1'})
        assert resp.status_code == 403


@pytest.mark.unit
class TestAnOfferSaysWhoGotIt:
    """iCreate, 2026-08-17: "Two kids were offered a spot in reading workshop
    block 2 tuesday, but I have no idea who it was because I can't see their
    names."

    The queue always carried names; the ANSWER to the action did not.
    _mark_offered returns the row an UPDATE hands back — bare columns, no
    join — and every caller passes it straight to the office as "who did we
    just offer this to". Two toasts read "Seat offered to next student".
    """

    def _offered(self, user_row):
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'limit', 'update'):
            getattr(table, chained).return_value = table
        table.execute.side_effect = [
            Mock(data=[{'id': 'w1', 'student_user_id': 's1', 'status': 'offered'}]),  # the UPDATE
            Mock(data=[user_row] if user_row else []),                                # the name lookup
        ]
        with patch('services.sis_waitlist_service._admin', return_value=client), \
                patch('services.sis_waitlist_service._notify_offer'), \
                patch('services.sis_waitlist_service.offer_ttl_hours', return_value=168):
            return wl._mark_offered('org-1', 'c1', 'w1')

    def test_the_offered_entry_carries_the_student_name(self):
        out = self._offered({'first_name': 'Ryder', 'last_name': 'Swenson'})
        assert out['student_name'] == 'Ryder Swenson'

    def test_the_preferred_name_wins_because_the_office_reads_it_aloud(self):
        out = self._offered({'first_name': 'Jenner', 'last_name': 'Roberts',
                             'preferred_name': 'Jay'})
        assert out['student_name'] == 'Jay Roberts'

    def test_an_unreadable_user_does_not_break_the_offer(self):
        """The offer is the point; the name is how it is reported."""
        out = self._offered(None)
        assert out['status'] == 'offered'
        assert out['student_name'] == 'a student'
