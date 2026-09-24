"""
Two iCreate tickets from Katrine Myers (campus coordinator), 2026-09-24.

1a54e05a -- "Is there a way I could see some kind of aggregate list for where
the families live? I have some families asking whether others might be
interested in carpooling and although that option is available to post, it
would be convenient to know so I could help it along."
  -> GET /api/sis/reports/family-locations: families counted by city, each
     family listed, with its carpool answer. Staff only.

50616794 -- on the registration answers report: "this would be the best spot
to be able to filter the families info by selection. So more questions might
be, sort families by age of children. Sort families by location, or form of
payment, or students who only come one day, etc."
  -> every row of /api/sis/reports/registration-answers carries the facts the
     page filters and sorts on: answer values, city, the family's own form of
     payment, and each child's age and days per week.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import sis_reports_service as reports


ORG = 'org-1'


def _admin_client_for_role(role, org_role=None):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{
        'role': role, 'org_role': org_role,
        'org_roles': [org_role] if org_role else None,
    }])
    return client


@contextmanager
def caller(role='org_admin', org_role=None):
    with patch('database.get_supabase_admin_client',
               return_value=_admin_client_for_role(role, org_role)), \
         patch('services.sis_service.resolve_org_id', return_value=ORG):
        yield


def _hh(hid, name, city=None, state='UT', postal='84043', carpool=False, members=None):
    return {'id': hid, 'name': name, 'city': city, 'state': state, 'postal_code': postal,
            'carpool_interest': carpool, 'address_line1': '1 Secret Lane',
            'members': members if members is not None else [
                {'name': f'{name} Parent', 'relationship': 'guardian'},
                {'name': f'{name} Kid', 'relationship': 'student', 'status': 'enrolled'},
            ]}


def _locations(households):
    with patch('services.sis_service.households_with_members', return_value=households):
        return reports.family_locations_report(ORG)


# ── 1a54e05a: where families live ────────────────────────────────────────────

@pytest.mark.unit
class TestFamilyLocationsReport:
    """1a54e05a: "some kind of aggregate list for where the families live"."""

    def test_families_are_counted_by_city_biggest_first(self):
        report = _locations([
            _hh('h1', 'Ames', city='Lehi'),
            _hh('h2', 'Bell', city='Lehi'),
            _hh('h3', 'Cole', city='Orem'),
        ])
        assert [(c['city'], c['family_count']) for c in report['cities']] == [('Lehi', 2), ('Orem', 1)]
        assert report['total_families'] == 3
        # "Family names in each city should be listable" -- the names ride along.
        assert [f['name'] for f in report['cities'][0]['families']] == ['Ames', 'Bell']

    def test_one_town_typed_two_ways_is_one_town(self):
        report = _locations([
            _hh('h1', 'Ames', city='Lehi'),
            _hh('h2', 'Bell', city=' lehi '),
            _hh('h3', 'Cole', city='Lehi'),
        ])
        assert len(report['cities']) == 1
        assert report['cities'][0]['city'] == 'Lehi'   # the spelling most families used
        assert report['cities'][0]['family_count'] == 3

    def test_a_family_with_no_city_is_counted_under_no_city_on_file_last(self):
        report = _locations([
            _hh('h1', 'Ames', city=None),
            _hh('h2', 'Bell', city='   '),
            _hh('h3', 'Cole', city='Orem'),
        ])
        last = report['cities'][-1]
        assert last['city'] == 'No city on file'
        assert last['no_city'] is True
        assert last['family_count'] == 2
        assert report['no_city_families'] == 2
        assert report['cities'][0]['city'] == 'Orem'

    def test_the_carpool_answer_is_passed_through_as_stored(self):
        """"who might be interested in carpooling": yes, no, and never
        answered are three different things, and the payload keeps all three."""
        report = _locations([
            _hh('h1', 'Ames', city='Lehi', carpool=True),
            _hh('h2', 'Bell', city='Lehi', carpool=False),
            _hh('h3', 'Cole', city='Lehi', carpool=None),
        ])
        fams = {f['name']: f for f in report['cities'][0]['families']}
        assert fams['Ames']['carpool_interest'] is True
        assert fams['Bell']['carpool_interest'] is False
        assert 'carpool_interest' in fams['Cole'] and fams['Cole']['carpool_interest'] is None
        assert report['cities'][0]['carpool_count'] == 1
        assert report['carpool_families'] == 1

    def test_no_more_than_the_family_record_shows_and_never_the_street(self):
        report = _locations([_hh('h1', 'Ames', city='Lehi', carpool=True)])
        fam = report['cities'][0]['families'][0]
        assert set(fam) == {'household_id', 'name', 'city', 'state', 'postal_code',
                            'carpool_interest', 'guardians', 'students'}
        assert '1 Secret Lane' not in json.dumps(report)

    def test_a_family_that_has_left_the_school_is_not_listed(self):
        report = _locations([
            _hh('h1', 'Ames', city='Lehi'),
            _hh('h2', 'Gone', city='Lehi', members=[
                {'name': 'Gone Parent', 'relationship': 'guardian'},
                {'name': 'Gone Kid', 'relationship': 'student', 'status': 'withdrawn'},
            ]),
            _hh('h3', 'Mixed', city='Lehi', members=[
                {'name': 'Mixed Parent', 'relationship': 'guardian'},
                {'name': 'Mixed Stays', 'relationship': 'student', 'status': 'enrolled'},
                {'name': 'Mixed Grad', 'relationship': 'student', 'status': 'graduated'},
            ]),
        ])
        fams = {f['name']: f for f in report['cities'][0]['families']}
        assert 'Gone' not in fams
        assert fams['Mixed']['students'] == ['Mixed Stays']
        assert fams['Mixed']['guardians'] == ['Mixed Parent']

    def test_csv_is_one_row_per_family_with_the_carpool_answer_in_words(self):
        report = _locations([
            _hh('h1', 'Ames', city='Lehi', carpool=True),
            _hh('h2', 'Bell', city=None, carpool=None),
        ])
        rows = reports.family_locations_csv_rows(report)
        assert rows[0][:4] == ['Lehi', 'UT', '84043', 'Ames']
        assert rows[0][-1] == 'Yes'
        assert rows[1][0] == 'No city on file'
        assert rows[1][-1] == 'Not answered'


@pytest.mark.unit
class TestFamilyLocationsRoute:
    REPORT = {'total_families': 1, 'carpool_families': 1, 'no_city_families': 0,
              'cities': [{'city': 'Lehi', 'no_city': False, 'states': ['UT'],
                          'family_count': 1, 'carpool_count': 1,
                          'families': [{'household_id': 'h1', 'name': 'Ames', 'city': 'Lehi',
                                        'state': 'UT', 'postal_code': '84043',
                                        'carpool_interest': True,
                                        'guardians': ['Ann Ames'], 'students': ['Al Ames']}]}]}

    def test_an_org_admin_gets_it(self, client, auth_headers, mock_verify_token):
        with caller(), patch('routes.sis.reports.reports.family_locations_report',
                             return_value=self.REPORT):
            resp = client.get('/api/sis/reports/family-locations?organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['report']['cities'][0]['families'][0]['carpool_interest'] is True

    def test_the_campus_coordinator_who_asked_gets_it(self, client, auth_headers, mock_verify_token):
        """1a54e05a came from a campus coordinator; ADMIN_ROLES includes her."""
        with caller(role='org_managed', org_role='campus_coordinator'), \
                patch('routes.sis.reports.reports.family_locations_report',
                      return_value=self.REPORT):
            resp = client.get('/api/sis/reports/family-locations?organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 200

    @pytest.mark.parametrize('role,org_role', [
        ('student', None), ('parent', None),
        ('org_managed', 'student'), ('org_managed', 'parent'),
    ])
    def test_families_and_students_are_refused_and_nothing_is_read(
            self, client, auth_headers, mock_verify_token, role, org_role):
        with caller(role=role, org_role=org_role), \
                patch('routes.sis.reports.reports.family_locations_report') as run:
            resp = client.get('/api/sis/reports/family-locations?organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 403
        assert 'Lehi' not in resp.data.decode()
        run.assert_not_called()

    def test_csv(self, client, auth_headers, mock_verify_token):
        with caller(), patch('routes.sis.reports.reports.family_locations_report',
                             return_value=self.REPORT):
            resp = client.get('/api/sis/reports/family-locations?organization_id=org-1&format=csv',
                              headers=auth_headers)
        assert resp.status_code == 200
        body = resp.data.decode()
        assert 'Carpool interest' in body and 'Ames' in body and 'Yes' in body


# ── 50616794: days per week, read off the schedule ───────────────────────────

@pytest.mark.unit
class TestSchoolDaysByStudent:
    """50616794: "students who only come one day". Nothing stores it; it is the
    distinct weekdays a student's active classes meet."""

    def _run(self, classes, enrollments):
        with patch('services.sis_catalog_service.list_classes', return_value=classes), \
             patch('services.sis_reports_service.fetch_all_rows', return_value=enrollments):
            return reports.school_days_by_student(ORG)

    def test_two_classes_on_the_same_day_are_one_day(self):
        out = self._run(
            [{'id': 'c1', 'meetings': [{'day_of_week': 2}]},
             {'id': 'c2', 'meetings': [{'day_of_week': 2}, {'day_of_week': 4}]},
             {'id': 'c3', 'meetings': [{'day_of_week': 2}]}],
            [{'class_id': 'c1', 'student_id': 's1'}, {'class_id': 'c3', 'student_id': 's1'},
             {'class_id': 'c2', 'student_id': 's2'}])
        assert out['s1'] == {'days': [2], 'unscheduled': False}
        assert out['s2'] == {'days': [2, 4], 'unscheduled': False}

    def test_a_class_with_no_meeting_is_flagged_not_guessed(self):
        out = self._run([{'id': 'c1', 'meetings': []}],
                        [{'class_id': 'c1', 'student_id': 's1'}])
        assert out['s1'] == {'days': [], 'unscheduled': True}

    def test_no_classes_reads_no_enrollments(self):
        with patch('services.sis_catalog_service.list_classes', return_value=[]), \
             patch('services.sis_reports_service.fetch_all_rows') as f:
            assert reports.school_days_by_student(ORG) == {}
        f.assert_not_called()


# ── 50616794: the registration answers rows carry what the page filters on ───

REGS = [
    {'parent_user_id': 'p1', 'status': 'completed',
     'kids': [{'user_id': 'k1', 'name': 'Ada Ames'}, {'user_id': 'k2', 'name': 'Ben Ames'}],
     'answers': {'lunch': ['Hot', 'Cold'], 'payment_intent': ['Utah Fits All', 'Self-Pay']}},
    {'parent_user_id': 'p2', 'status': 'completed',
     'kids': [{'user_id': 'k3', 'name': 'Cal Bell', 'dob': '2015-05-05'}],
     'answers': {'lunch': 'Hot'}},
]
USERS = {
    'p1': {'first_name': 'Pat', 'last_name': 'Ames', 'email': 'pat@example.com'},
    'p2': {'first_name': 'Sam', 'last_name': 'Bell', 'email': 'sam@example.com'},
    'k1': {'first_name': 'Ada', 'last_name': 'Ames', 'date_of_birth': '2018-01-01'},
    'k2': {'first_name': 'Ben', 'last_name': 'Ames', 'date_of_birth': '2014-01-01'},
    'k3': {'first_name': 'Cal', 'last_name': 'Bell'},
}
HOUSEHOLDS = {
    'p1': {'name': 'Ames', 'city': 'Lehi', 'state': 'UT'},
    'k1': {'name': 'Ames', 'city': 'Lehi', 'state': 'UT'},
    'k2': {'name': 'Ames', 'city': 'Lehi', 'state': 'UT'},
    'p2': {'name': 'Bell', 'city': None, 'state': None, 'funding_source': 'ufa'},
}
SCHEDULE = {'k1': {'days': [2], 'unscheduled': False},
            'k2': {'days': [2, 4], 'unscheduled': False}}
AGES = {'2018-01-01': 8, '2014-01-01': 12, '2015-05-05': 11}


@contextmanager
def answers_context(questions=None):
    from routes.sis import reports as routes
    with patch.object(routes, '_org_flags', return_value={}), \
         patch.object(routes, '_configured_questions',
                      return_value=questions or [{'key': 'lunch', 'label': 'Lunch',
                                                  'type': 'multi', 'options': [],
                                                  'required': False, 'per_student': False}]), \
         patch.object(routes, '_reg_context', return_value=(REGS, USERS, HOUSEHOLDS)), \
         patch('services.sis_age.ages_for', return_value=lambda dob: AGES.get(dob)), \
         patch.object(routes.reports, 'school_days_by_student', return_value=SCHEDULE):
        yield


@pytest.mark.unit
class TestRegistrationAnswerRows:
    """50616794: "sort families by age of children. Sort families by location,
    or form of payment, or students who only come one day"."""

    def _get(self, client, auth_headers, qs='question_key=lunch', **ctx):
        with caller(), answers_context(**ctx):
            resp = client.get(f'/api/sis/reports/registration-answers?organization_id=org-1&{qs}',
                              headers=auth_headers)
        assert resp.status_code == 200, resp.data
        return resp

    def test_a_family_row_carries_city_payment_ages_and_days(self, client, auth_headers,
                                                             mock_verify_token):
        rows = json.loads(self._get(client, auth_headers).data)['report']['rows']
        ames = next(r for r in rows if r['family'] == 'Ames')
        assert ames['answer_values'] == ['Hot', 'Cold']
        assert ames['city'] == 'Lehi'
        assert ames['payment_methods'] == ['Utah Fits All', 'Self-Pay']
        assert [(k['name'], k['age'], k['days_per_week'], k['days']) for k in ames['kids']] == [
            ('Ada Ames', 8, 1, 'Tue'), ('Ben Ames', 12, 2, 'Tue Thu')]

    def test_a_family_with_no_city_and_no_payment_answer_still_has_a_row(
            self, client, auth_headers, mock_verify_token):
        rows = json.loads(self._get(client, auth_headers).data)['report']['rows']
        bell = next(r for r in rows if r['family'] == 'Bell')
        assert bell['city'] == ''
        # Their own words only: the staff-set funding_source is NOT read into it.
        assert bell['payment_methods'] == []
        # The age falls back to the date of birth given at registration, and a
        # child in no class comes 0 days rather than vanishing.
        assert bell['kids'] == [{'name': 'Cal Bell', 'age': 11, 'days_per_week': 0,
                                 'days': '', 'unscheduled': False}]

    def test_a_per_student_question_gives_each_child_their_own_facts(
            self, client, auth_headers, mock_verify_token):
        regs = [{'parent_user_id': 'p1', 'status': 'completed',
                 'kids': [{'user_id': 'k1'}, {'user_id': 'k2'}],
                 'answers': {'shirt': {'k1': 'S', 'k2': 'L'}}}]
        from routes.sis import reports as routes
        with caller(), answers_context(questions=[{'key': 'shirt', 'label': 'Shirt',
                                                   'type': 'text', 'options': [],
                                                   'required': False, 'per_student': True}]), \
                patch.object(routes, '_reg_context', return_value=(regs, USERS, HOUSEHOLDS)):
            resp = client.get('/api/sis/reports/registration-answers?organization_id=org-1'
                              '&question_key=shirt', headers=auth_headers)
        rows = json.loads(resp.data)['report']['rows']
        by = {r['student']: r for r in rows}
        assert by['Ada Ames']['answer_values'] == ['S']
        assert by['Ada Ames']['kids'][0]['days_per_week'] == 1
        assert by['Ben Ames']['answer_values'] == ['L']
        assert by['Ben Ames']['kids'][0]['age'] == 12
        assert by['Ben Ames']['city'] == 'Lehi'

    def test_csv_has_the_new_columns(self, client, auth_headers, mock_verify_token):
        body = self._get(client, auth_headers, qs='question_key=lunch&format=csv').data.decode()
        header = body.splitlines()[0]
        for col in ('City', 'Ages', 'Days per week', 'Form of payment'):
            assert col in header
        assert 'Utah Fits All; Self-Pay' in body
        assert '8, 12' in body

    @pytest.mark.parametrize('role,org_role', [
        ('student', None), ('parent', None), ('org_managed', 'parent'),
    ])
    def test_families_and_students_are_refused(self, client, auth_headers, mock_verify_token,
                                               role, org_role):
        from routes.sis import reports as routes
        with caller(role=role, org_role=org_role), \
                patch.object(routes, '_reg_context') as ctx:
            resp = client.get('/api/sis/reports/registration-answers?organization_id=org-1'
                              '&question_key=lunch', headers=auth_headers)
        assert resp.status_code == 403
        assert 'pat@example.com' not in resp.data.decode()
        ctx.assert_not_called()


@pytest.mark.unit
class TestRegistrationReadsArePaged:
    """The page filters over the rows it loaded, so the rows must be all of them."""

    def test_the_registration_household_and_user_reads_page(self):
        import inspect
        from routes.sis import reports as routes
        for fn in (routes._latest_registrations, routes._household_by_user, routes._users_by_id):
            source = inspect.getsource(fn)
            assert 'fetch_all_rows' in source, fn.__name__
            assert '.execute()' not in source, fn.__name__

    def test_latest_registration_per_parent_is_still_the_newest(self):
        from routes.sis import reports as routes
        rows = [
            {'id': 'a', 'parent_user_id': 'p1', 'status': 'completed', 'updated_at': '2026-01-01'},
            {'id': 'b', 'parent_user_id': 'p1', 'status': 'completed', 'updated_at': '2026-03-01'},
            {'id': 'c', 'parent_user_id': 'p1', 'status': 'draft', 'updated_at': '2026-04-01'},
        ]
        with patch.object(routes, 'fetch_all_rows', return_value=rows), \
             patch.object(routes, '_admin', return_value=Mock()):
            out = routes._latest_registrations(ORG)
        assert [r['id'] for r in out] == ['b']
