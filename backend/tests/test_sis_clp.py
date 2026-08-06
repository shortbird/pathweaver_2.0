"""
Unit tests for the SIS CLP (Customized Learning Plan) meeting view service.

Covers the two composed reads the CLP screen relies on:
  - clp_directory: active students grouped by family (withdrawn/graduated hidden,
    students without a household become single-child families).
  - get_clp_student: the catalog annotated with THIS student's enrolled/waitlist
    state + the derived schedule, and org isolation.
"""

from unittest.mock import MagicMock, patch

import pytest

from services import sis_clp_service as clp


def _chain(*datasets):
    """Supabase query-builder stand-in: chained methods return the same mock;
    successive .execute() calls pop the given datasets."""
    m = MagicMock()
    for meth in ('select', 'insert', 'update', 'upsert', 'delete',
                 'eq', 'in_', 'is_', 'limit', 'order'):
        getattr(m, meth).return_value = m
    m.execute.side_effect = [MagicMock(data=d) for d in datasets]
    return m


def _client(tables):
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]
    return client


_ROSTER = [
    {'student_id': 's1', 'name': 'Alice Ant', 'is_student': True, 'first_name': 'Alice',
     'last_name': 'Ant', 'household_id': 'h1', 'household_name': 'Ant Family',
     'date_of_birth': '2014-01-15', 'grade_level': '3', 'enrollment_status': 'enrolled'},
    {'student_id': 's2', 'name': 'Bob Ant', 'is_student': True, 'first_name': 'Bob',
     'last_name': 'Ant', 'household_id': 'h1', 'household_name': 'Ant Family',
     'grade_level': '5', 'enrollment_status': 'applicant'},
    {'student_id': 's3', 'name': 'Cara Solo', 'is_student': True, 'first_name': 'Cara',
     'last_name': 'Solo', 'household_id': None, 'household_name': None,
     'grade_level': None, 'enrollment_status': 'enrolled'},
    {'student_id': 's4', 'name': 'Gone Kid', 'is_student': True, 'household_id': None,
     'household_name': None, 'enrollment_status': 'withdrawn'},
    {'student_id': 'p1', 'name': 'Pat Parent', 'is_student': False, 'household_id': 'h1',
     'household_name': 'Ant Family', 'enrollment_status': None},
]


def _directory(roster, finished=frozenset()):
    with patch('services.sis_clp_service.sis_service.get_roster', return_value=roster), \
         patch('services.sis_clp_service.finished_student_ids', return_value=set(finished)):
        return clp.clp_directory('org1')


@pytest.mark.unit
class TestDirectory:
    def test_groups_students_by_family_and_hides_inactive(self):
        out = _directory(_ROSTER)
        # Parent + withdrawn student excluded from the flat student list.
        ids = {s['student_id'] for s in out['students']}
        assert ids == {'s1', 's2', 's3'}
        # Families: the Ant Family (2 kids) and Cara's solo family.
        fam = {f['name']: f for f in out['families']}
        assert fam['Ant Family']['student_count'] == 2
        assert [s['student_id'] for s in fam['Ant Family']['students']] == ['s1', 's2']
        assert 'Cara Solo' in fam
        assert fam['Cara Solo']['household_id'] is None

    def test_families_sorted_alphabetically(self):
        out = _directory(_ROSTER)
        names = [f['name'] for f in out['families']]
        assert names == sorted(names, key=str.lower)

    def test_students_carry_the_clp_finished_flag(self):
        out = _directory(_ROSTER, finished={'s1'})
        by_id = {s['student_id']: s for s in out['students']}
        assert by_id['s1']['clp_finished'] is True
        assert by_id['s2']['clp_finished'] is False

    def test_solo_students_sort_by_last_name(self):
        """A household-less student must interleave by LAST name among the
        '<Last> Family' households, not by their first name."""
        roster = [
            {'student_id': 'z1', 'name': 'Zed Zebra', 'is_student': True, 'first_name': 'Zed',
             'last_name': 'Zebra', 'household_id': 'h9', 'household_name': 'Zebra Family',
             'enrollment_status': 'enrolled'},
            # First name 'Aaron' would sort first under the old name-based sort;
            # last name 'Middleton' must place him between Ant and Zebra.
            {'student_id': 'm1', 'name': 'Aaron Middleton', 'is_student': True,
             'first_name': 'Aaron', 'last_name': 'Middleton', 'household_id': None,
             'household_name': None, 'enrollment_status': 'enrolled'},
            {'student_id': 'a1', 'name': 'Ann Ant', 'is_student': True, 'first_name': 'Ann',
             'last_name': 'Ant', 'household_id': 'h1', 'household_name': 'Ant Family',
             'enrollment_status': 'enrolled'},
        ]
        out = _directory(roster)
        assert [f['name'] for f in out['families']] == \
            ['Ant Family', 'Aaron Middleton', 'Zebra Family']

    def test_students_carry_age(self):
        out = _directory(_ROSTER)
        by_id = {s['student_id']: s for s in out['students']}
        assert isinstance(by_id['s1']['age'], int) and by_id['s1']['age'] >= 12
        assert by_id['s2']['age'] is None  # no DOB on file


_CATALOG = [
    {'id': 'c1', 'name': 'Art', 'description': None, 'location': 'Room A', 'capacity': 10,
     'enrolled_count': 4, 'waitlist_count': 0, 'spots_left': 6, 'is_full': False,
     'registration_status': 'open', 'waitlist_enabled': True, 'price_cents': 5000,
     'supply_fee': 35, 'min_age': 8, 'max_age': 12,
     'primary_instructor': {'id': 't1', 'name': 'Mr T'},
     'meetings': [{'id': 'm1', 'day_of_week': 1, 'start_time': '09:00:00', 'end_time': '10:00:00', 'location': 'A'}]},
    {'id': 'c2', 'name': 'Band', 'capacity': 8, 'enrolled_count': 8, 'waitlist_count': 3,
     'spots_left': 0, 'is_full': True, 'registration_status': 'open', 'waitlist_enabled': True,
     'meetings': [{'id': 'm2', 'day_of_week': 3, 'start_time': '11:00:00', 'end_time': '12:00:00'}]},
    {'id': 'c3', 'name': 'Chess', 'capacity': None, 'enrolled_count': 2, 'waitlist_count': 0,
     'spots_left': None, 'is_full': False, 'registration_status': 'open', 'meetings': []},
]


@pytest.mark.unit
class TestClpStudent:
    def _run(self, enrolled, waitlist, payment=None, record=None, learning_day=None):
        tables = {
            'class_enrollments': _chain(enrolled),
            'sis_waitlist_entries': _chain(waitlist),
        }
        with patch('services.sis_clp_service.sis_service.student_in_org', return_value=True), \
             patch('services.sis_clp_service._student_profile',
                   return_value={'student_id': 's1', 'name': 'Alice Ant', 'age': 10}), \
             patch('services.sis_clp_service._family_and_siblings',
                   return_value=({'household_id': 'h1', 'name': 'Ant Family'},
                                 [{'student_id': 's2', 'name': 'Bob Ant', 'age': 13}],
                                 ['g1'])), \
             patch('services.sis_clp_service._family_payment_intent', return_value=payment), \
             patch('services.sis_clp_service.get_clp_record',
                   return_value=record or {'finished': False, 'notes': None}), \
             patch('services.sis_learning_day_service.get_selection', return_value=learning_day), \
             patch('services.sis_clp_service.catalog.list_classes', return_value=_CATALOG), \
             patch('services.sis_clp_service._admin', return_value=_client(tables)):
            return clp.get_clp_student('org1', 's1')

    def test_annotates_enrollment_and_waitlist_and_builds_schedule(self):
        out = self._run(
            enrolled=[{'class_id': 'c1'}],
            waitlist=[{'id': 'w9', 'class_id': 'c2', 'status': 'waiting', 'position': 2}],
        )
        by_id = {c['class_id']: c for c in out['classes']}
        assert by_id['c1']['is_enrolled'] is True
        assert by_id['c2']['on_waitlist'] is True
        assert by_id['c2']['waitlist_entry_id'] == 'w9'
        assert by_id['c2']['waitlist_position'] == 2
        assert by_id['c3']['is_enrolled'] is False and by_id['c3']['on_waitlist'] is False
        # Times trimmed to HH:MM for the frontend.
        assert by_id['c1']['meetings'][0]['start_time'] == '09:00'
        # Schedule = the enrolled classes only.
        assert [c['class_id'] for c in out['schedule']] == ['c1']
        assert out['siblings'][0]['student_id'] == 's2'

    def test_no_enrollments_means_empty_schedule(self):
        out = self._run(enrolled=[], waitlist=[])
        assert out['schedule'] == []
        assert all(not c['is_enrolled'] for c in out['classes'])

    def test_classes_carry_supply_fee_and_age_bounds(self):
        out = self._run(enrolled=[], waitlist=[])
        by_id = {c['class_id']: c for c in out['classes']}
        assert by_id['c1']['supply_fee'] == 35
        assert by_id['c1']['min_age'] == 8 and by_id['c1']['max_age'] == 12
        assert by_id['c2']['supply_fee'] is None

    def test_family_payment_intent_surfaces(self):
        out = self._run(enrolled=[], waitlist=[], payment=['Self-Pay', 'Utah Fits All'])
        assert out['family']['payment_intent'] == ['Self-Pay', 'Utah Fits All']
        out = self._run(enrolled=[], waitlist=[])
        assert out['family']['payment_intent'] is None

    def test_clp_record_and_learning_day_surface(self):
        out = self._run(
            enrolled=[], waitlist=[],
            record={'finished': True, 'finished_at': '2026-07-21', 'notes': 'Great meeting'},
            learning_day={'choice': 'elementary_at_home'},
        )
        assert out['clp_record']['finished'] is True
        assert out['clp_record']['notes'] == 'Great meeting'
        assert out['learning_day']['choice'] == 'elementary_at_home'


@pytest.mark.unit
class TestHelpers:
    def test_age_from_iso_date(self):
        from datetime import date
        dob = date.today().replace(year=date.today().year - 9)
        assert clp._age(str(dob)) == 9
        assert clp._age(None) is None
        assert clp._age('not-a-date') is None

    def test_payment_intent_prefers_latest_answered(self):
        rows = [
            {'parent_user_id': 'g1', 'answers': {}, 'created_at': '2026-07-10'},
            {'parent_user_id': 'g1', 'answers': {'payment_intent': ['OpenED']},
             'created_at': '2026-07-01'},
        ]
        tables = {'icreate_registrations': _chain(rows)}
        with patch('services.sis_clp_service._admin', return_value=_client(tables)):
            assert clp._family_payment_intent('org1', ['g1']) == ['OpenED']

    def test_payment_intent_no_guardians(self):
        assert clp._family_payment_intent('org1', []) is None

    def test_out_of_org_student_returns_none(self):
        with patch('services.sis_clp_service.sis_service.student_in_org', return_value=False):
            assert clp.get_clp_student('org1', 'stranger') is None


@pytest.mark.unit
class TestClpRecord:
    def test_default_record_when_none_saved(self):
        tables = {'sis_clp_records': _chain([])}
        with patch('services.sis_clp_service._admin', return_value=_client(tables)):
            rec = clp.get_clp_record('org1', 's1')
        assert rec['finished'] is False and rec['notes'] is None

    def test_finished_derives_from_finished_at(self):
        row = {'finished_at': '2026-07-21T10:00:00Z', 'notes': 'All set',
               'updated_at': '2026-07-21T10:00:00Z'}
        tables = {'sis_clp_records': _chain([row])}
        with patch('services.sis_clp_service._admin', return_value=_client(tables)):
            rec = clp.get_clp_record('org1', 's1')
        assert rec['finished'] is True and rec['notes'] == 'All set'

    def test_mark_finished_upserts_timestamp_and_staff(self):
        saved = {'finished_at': '2026-07-21T10:00:00Z', 'notes': None}
        chain = _chain([saved])
        tables = {'sis_clp_records': chain}
        with patch('services.sis_clp_service.sis_service.student_in_org', return_value=True), \
             patch('services.sis_clp_service._admin', return_value=_client(tables)):
            out = clp.update_clp_record('org1', 's1', 'staff1', finished=True)
        assert out['record']['finished'] is True
        payload = chain.upsert.call_args.args[0]
        assert payload['finished_by'] == 'staff1'
        assert payload['finished_at'] is not None
        assert chain.upsert.call_args.kwargs['on_conflict'] == 'organization_id,student_user_id'

    def test_unmark_finished_clears_the_timestamp(self):
        chain = _chain([{'finished_at': None, 'notes': None}])
        tables = {'sis_clp_records': chain}
        with patch('services.sis_clp_service.sis_service.student_in_org', return_value=True), \
             patch('services.sis_clp_service._admin', return_value=_client(tables)):
            out = clp.update_clp_record('org1', 's1', 'staff1', finished=False)
        assert out['record']['finished'] is False
        payload = chain.upsert.call_args.args[0]
        assert payload['finished_at'] is None and payload['finished_by'] is None

    def test_notes_save_without_touching_finished(self):
        chain = _chain([{'finished_at': None, 'notes': 'Wants art electives'}])
        tables = {'sis_clp_records': chain}
        with patch('services.sis_clp_service.sis_service.student_in_org', return_value=True), \
             patch('services.sis_clp_service._admin', return_value=_client(tables)):
            out = clp.update_clp_record('org1', 's1', 'staff1', notes='Wants art electives')
        assert out['record']['notes'] == 'Wants art electives'
        payload = chain.upsert.call_args.args[0]
        assert 'finished_at' not in payload
        assert payload['notes_updated_by'] == 'staff1'

    def test_out_of_org_student_is_rejected(self):
        with patch('services.sis_clp_service.sis_service.student_in_org', return_value=False):
            assert 'error' in clp.update_clp_record('org1', 'stranger', 'staff1', finished=True)

    def test_finished_student_ids_filters_on_timestamp(self):
        rows = [{'student_user_id': 's1', 'finished_at': '2026-07-21'},
                {'student_user_id': 's2', 'finished_at': None}]
        tables = {'sis_clp_records': _chain(rows)}
        with patch('services.sis_clp_service._admin', return_value=_client(tables)):
            assert clp.finished_student_ids('org1') == {'s1'}
