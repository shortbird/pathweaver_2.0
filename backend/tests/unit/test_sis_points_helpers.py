"""Points helpers: students a school names to give points to other students.

Ticket 0f401a62 (Apogee Cache Valley): "Is there a way to create a separate
login for students to use to track points? We don't want all of them to have
access to the point system but we do have a studio leader each session that
tracks points."

Owner's design (2026-10-13), generic for any school with the points module:
the admins keep a list (feature_flags.sis_settings.point_helper_ids); a
student on it, signed in as themselves, gives points to other students:
positive only, capped per entry, never to themselves, no take, no undo, no
button editing. Everyone else is refused and nothing is written. The staff
board marks a helper's entry with the giver so a coach can check and undo it.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_points_service as psvc
from services.sis_points_service import (
    HELPER_MIN_MAX, POINT_HELPERS_KEY, PointsError, PointsService, given_by_student,
    helper_max, helpers_from_flags,
)

ORG = 'org-1'
OTHER_ORG = 'org-2'
HELPER = 'stu-helper'
KID_A = 'stu-a'
KID_B = 'stu-b'
NOT_HELPER = 'stu-plain'
OUTSIDER = 'stu-other-school'
WITHDRAWN = 'stu-withdrawn'
PARENT = 'par-1'
COACH = 'coach-1'


def _person(uid, org=ORG, role='student', first='Ada'):
    return {'id': uid, 'first_name': first, 'last_name': 'Kid', 'organization_id': org,
            'role': 'org_managed', 'org_role': role}


PEOPLE = [
    _person(HELPER, first='Hal'), _person(KID_A, first='Ada'), _person(KID_B, first='Ben'),
    _person(NOT_HELPER, first='Nia'), _person(OUTSIDER, org=OTHER_ORG, first='Oz'),
    _person(WITHDRAWN, first='Wes'), _person(PARENT, role='parent', first='Pat'),
    _person(COACH, role='advisor', first='Coach'),
]

# What sis_service.get_roster answers for ORG (only the fields _students reads).
ROSTER = [
    {'student_id': HELPER, 'name': 'Hal Kid', 'is_student': True, 'enrollment_status': 'enrolled'},
    {'student_id': KID_A, 'name': 'Ada Kid', 'is_student': True, 'enrollment_status': 'enrolled'},
    {'student_id': KID_B, 'name': 'Ben Kid', 'is_student': True, 'enrollment_status': 'enrolled'},
    {'student_id': NOT_HELPER, 'name': 'Nia Kid', 'is_student': True, 'enrollment_status': 'enrolled'},
    {'student_id': WITHDRAWN, 'name': 'Wes Kid', 'is_student': True, 'enrollment_status': 'withdrawn'},
    {'student_id': PARENT, 'name': 'Pat Kid', 'is_student': False, 'enrollment_status': None},
]


class HelperRepo:
    def __init__(self, helper_ids=(HELPER,), buttons=None, balances=None, given=None, recent=None):
        self._users = {u['id']: u for u in PEOPLE}
        self._flags = {'sis_settings': {POINT_HELPERS_KEY: list(helper_ids)}} if helper_ids is not None else {}
        self._buttons = buttons if buttons is not None else [
            {'id': 'b1', 'label': 'Daily job', 'amount': 5},
            {'id': 'b2', 'label': 'Park trip', 'amount': -20},
        ]
        self._balances = balances or {KID_A: 12, KID_B: 3, HELPER: 7}
        self._given = given or []
        self._recent = recent or []
        self.inserted = []
        self.given_args = None

    def users(self, ids):
        return [self._users[i] for i in ids if i in self._users]

    def org_feature_flags(self, org_id):
        return self._flags if org_id == ORG else {}

    def buttons(self, org_id):
        return self._buttons

    def balances(self, org_id, student_ids=None):
        ids = self._balances.keys() if student_ids is None else student_ids
        return [{'student_user_id': i, 'balance': self._balances[i]} for i in ids if i in self._balances]

    def insert_entries(self, rows):
        self.inserted.extend(rows)
        return [{**r, 'id': f'e{i}'} for i, r in enumerate(rows)]

    def given_by(self, org_id, giver_id, limit):
        self.given_args = (org_id, giver_id, limit)
        return self._given

    def recent_entries(self, org_id, limit):
        return self._recent

    def student_entries(self, org_id, student_id, limit):
        return []

    def org_timezone(self, org_id):
        return 'America/Denver'

    def self_added_since(self, org_id, student_id, since_iso):
        return []


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setattr(psvc, 'now_iso', lambda: '2026-10-13T15:00:00+00:00')
    with patch('services.sis_service.get_roster', return_value=ROSTER):
        yield


@pytest.fixture
def module_on():
    with patch('modules.enabled.module_enabled', return_value=True) as m:
        yield m


@pytest.fixture
def module_off():
    with patch('modules.enabled.module_enabled', return_value=False) as m:
        yield m


GIVE = {'student_ids': [KID_A, KID_B], 'amount': 5, 'reason': 'Daily job'}


# -- the stored list ----------------------------------------------------------

class TestHelperList:
    def test_flags_without_a_list_mean_nobody(self):
        assert helpers_from_flags(None) == []
        assert helpers_from_flags({}) == []
        assert helpers_from_flags({'sis_settings': {POINT_HELPERS_KEY: 'x'}}) == []
        assert helpers_from_flags({'sis_settings': {POINT_HELPERS_KEY: ['a', None, 'b']}}) == ['a', 'b']

    def test_helpers_are_named_and_only_current_students(self):
        repo = HelperRepo(helper_ids=[HELPER, WITHDRAWN])
        assert PointsService(repo).helpers(ORG) == [{'student_id': HELPER, 'name': 'Hal Kid'}]

    def test_save_keeps_current_students_and_drops_repeats(self):
        out = PointsService(HelperRepo()).clean_helper_ids(ORG, [HELPER, KID_A, HELPER])
        assert out == [HELPER, KID_A]

    def test_an_empty_list_is_allowed(self):
        assert PointsService(HelperRepo()).clean_helper_ids(ORG, []) == []

    @pytest.mark.parametrize('bad', [[OUTSIDER], [PARENT], [COACH], [WITHDRAWN], ['nobody']])
    def test_save_refuses_anyone_not_a_current_student_here(self, bad):
        with pytest.raises(PointsError, match='current students'):
            PointsService(HelperRepo()).clean_helper_ids(ORG, [HELPER, *bad])

    def test_save_refuses_a_non_list(self):
        with pytest.raises(PointsError):
            PointsService(HelperRepo()).clean_helper_ids(ORG, HELPER)


# -- the gate -----------------------------------------------------------------

class TestHelperGate:
    def test_a_helper_gives_every_picked_student_an_entry_created_by_them(self, module_on):
        """Ticket 0f401a62: "we do have a studio leader each session that
        tracks points." One request, one entry per student, created_by the
        helper so the staff board shows who gave it."""
        repo = HelperRepo()
        out = PointsService(repo).add_as_helper(HELPER, GIVE)
        assert [(r['student_user_id'], r['amount'], r['reason'], r['created_by'], r['source'])
                for r in repo.inserted] == [
            (KID_A, 5, 'Daily job', HELPER, 'staff'), (KID_B, 5, 'Daily job', HELPER, 'staff')]
        assert out['balances'] == {KID_A: 17, KID_B: 8}
        assert all(e['given_by_student'] and e['created_by_name'] == 'Hal Kid' for e in out['entries'])
        assert not any(e['added_by_student'] for e in out['entries'])

    def test_a_student_not_on_the_list_is_refused(self, module_on):
        """"We don't want all of them to have access to the point system.\""""
        repo = HelperRepo()
        with pytest.raises(PermissionError):
            PointsService(repo).add_as_helper(NOT_HELPER, GIVE)
        with pytest.raises(PermissionError):
            PointsService(repo).helper_board(NOT_HELPER)
        assert repo.inserted == []

    def test_nobody_is_a_helper_without_a_list(self, module_on):
        repo = HelperRepo(helper_ids=None)
        with pytest.raises(PermissionError):
            PointsService(repo).add_as_helper(HELPER, GIVE)
        assert repo.inserted == []

    @pytest.mark.parametrize('caller', [PARENT, COACH])
    def test_an_adult_on_the_list_is_still_refused(self, module_on, caller):
        """Only a student is a helper. Staff give points through /entries."""
        repo = HelperRepo(helper_ids=[HELPER, caller])
        with pytest.raises(PermissionError):
            PointsService(repo).add_as_helper(caller, GIVE)
        assert repo.inserted == []

    def test_a_helper_of_another_school_is_refused(self, module_on):
        """OUTSIDER's school (OTHER_ORG) has no list; ORG's list naming them
        does not count, because the list read is their own school's."""
        repo = HelperRepo(helper_ids=[HELPER, OUTSIDER])
        with pytest.raises(PermissionError):
            PointsService(repo).add_as_helper(OUTSIDER, GIVE)
        assert repo.inserted == []

    def test_a_helper_cannot_give_to_another_schools_student(self, module_on):
        repo = HelperRepo()
        with pytest.raises(LookupError):
            PointsService(repo).add_as_helper(HELPER, {**GIVE, 'student_ids': [KID_A, OUTSIDER]})
        assert repo.inserted == []

    def test_refused_when_the_module_is_off(self, module_off):
        repo = HelperRepo()
        with pytest.raises(PermissionError):
            PointsService(repo).add_as_helper(HELPER, GIVE)
        assert repo.inserted == []

    def test_a_helper_cannot_give_to_themselves(self, module_on):
        """Decision: no self-award. A helper's own points stay under the
        student daily cap (POST /mine); this door would walk around it."""
        repo = HelperRepo()
        with pytest.raises(PointsError, match='yourself'):
            PointsService(repo).add_as_helper(HELPER, {**GIVE, 'student_ids': [KID_A, HELPER]})
        assert repo.inserted == []

    @pytest.mark.parametrize('amount', [-5, -1, 0])
    def test_a_helper_cannot_take_points(self, module_on, amount):
        repo = HelperRepo()
        with pytest.raises(PointsError):
            PointsService(repo).add_as_helper(HELPER, {**GIVE, 'amount': amount})
        assert repo.inserted == []

    def test_a_reason_is_required(self, module_on):
        repo = HelperRepo()
        with pytest.raises(PointsError, match='Reason'):
            PointsService(repo).add_as_helper(HELPER, {**GIVE, 'reason': '  '})
        assert repo.inserted == []

    def test_the_per_entry_limit(self, module_on):
        repo = HelperRepo()
        with pytest.raises(PointsError, match='up to 10'):
            PointsService(repo).add_as_helper(HELPER, {**GIVE, 'amount': 11})
        assert repo.inserted == []
        PointsService(repo).add_as_helper(HELPER, {**GIVE, 'amount': 10})
        assert [r['amount'] for r in repo.inserted] == [10, 10]

    def test_the_limit_grows_to_the_schools_largest_give_button(self, module_on):
        repo = HelperRepo(buttons=[{'id': 'b', 'label': 'Big project', 'amount': 25}])
        PointsService(repo).add_as_helper(HELPER, {**GIVE, 'amount': 25})
        assert repo.inserted[0]['amount'] == 25

    def test_limit_values(self):
        assert HELPER_MIN_MAX == 10
        assert helper_max([]) == 10
        assert helper_max([{'amount': 5}, {'amount': -50}]) == 10
        assert helper_max([{'amount': 30}]) == 30


# -- the helper's screen ------------------------------------------------------

class TestHelperBoard:
    def test_other_current_students_give_buttons_limit_and_own_gives(self, module_on):
        given = [{'id': 'g1', 'organization_id': ORG, 'student_user_id': KID_A, 'amount': 5,
                  'reason': 'Daily job', 'source': 'staff', 'created_by': HELPER,
                  'created_at': '2026-10-13T14:00:00Z'}]
        repo = HelperRepo(given=given)
        out = PointsService(repo).helper_board(HELPER)
        # Not the helper, not a withdrawn student, not a parent; no ages.
        assert out['students'] == [
            {'student_id': KID_A, 'name': 'Ada Kid', 'balance': 12},
            {'student_id': KID_B, 'name': 'Ben Kid', 'balance': 3},
            {'student_id': NOT_HELPER, 'name': 'Nia Kid', 'balance': 0},
        ]
        # Only the give buttons: a helper never takes.
        assert out['buttons'] == [{'id': 'b1', 'label': 'Daily job', 'amount': 5}]
        assert out['max_amount'] == 10
        assert repo.given_args == (ORG, HELPER, psvc.HELPER_RECENT)
        assert out['recent'][0]['student_name'] == 'Ada Kid'
        assert out['recent'][0]['given_by_student'] is True


# -- what staff and families see ----------------------------------------------

class TestGiverOnTheBoard:
    def test_given_by_student_flags_only_a_student_giving_someone_else(self):
        people = {u['id']: u for u in PEOPLE}
        assert given_by_student({'created_by': HELPER, 'student_user_id': KID_A}, people) is True
        assert given_by_student({'created_by': KID_A, 'student_user_id': KID_A}, people) is False
        assert given_by_student({'created_by': COACH, 'student_user_id': KID_A}, people) is False
        assert given_by_student({'created_by': None, 'student_user_id': KID_A}, people) is False
        assert given_by_student({'created_by': 'gone', 'student_user_id': KID_A}, people) is False

    def test_staff_board_carries_the_giver_beside_the_existing_tags(self):
        rows = [
            {'id': 'h', 'student_user_id': KID_A, 'amount': 5, 'reason': 'Daily job',
             'source': 'staff', 'created_by': HELPER, 'created_at': 't3'},
            {'id': 's', 'student_user_id': KID_B, 'amount': 3, 'reason': 'Chickens',
             'source': 'staff', 'created_by': KID_B, 'created_at': 't2'},
            {'id': 'c', 'student_user_id': KID_A, 'amount': 5, 'reason': 'Daily job',
             'source': 'staff', 'created_by': COACH, 'created_at': 't1'},
        ]
        out = {e['id']: e for e in PointsService(HelperRepo(recent=rows)).board(ORG)['recent']}
        assert (out['h']['given_by_student'], out['h']['added_by_student'],
                out['h']['created_by_name'], out['h']['source']) == (True, False, 'Hal Kid', 'staff')
        # Unchanged: a student's own entry, and a coach's entry.
        assert (out['s']['given_by_student'], out['s']['added_by_student'], out['s']['source']) == (
            False, True, 'student')
        assert (out['c']['given_by_student'], out['c']['added_by_student'],
                out['c']['created_by_name']) == (False, False, 'Coach Kid')

    def test_mine_tells_a_helper_and_nobody_else(self, module_on):
        assert PointsService(HelperRepo()).mine(HELPER)[0]['is_helper'] is True
        assert PointsService(HelperRepo()).mine(NOT_HELPER)[0]['is_helper'] is False

    def test_a_parent_of_a_helper_is_not_a_helper(self, module_on):
        with patch('utils.class_membership.children_of_parent', return_value={HELPER}):
            out = PointsService(HelperRepo()).mine(PARENT)
        assert out[0]['is_helper'] is False

    def test_add_own_still_works_for_a_helper_under_the_daily_cap(self, module_on):
        """The helper's own points are unchanged: POST /mine, capped per day."""
        repo = HelperRepo()
        out = PointsService(repo).add_own(HELPER, {'amount': 5, 'reason': 'My job'})
        assert repo.inserted[0]['created_by'] == HELPER
        assert out['entries'][0]['added_by_student'] is True
        assert out['entries'][0]['given_by_student'] is False


# -- routes -------------------------------------------------------------------

def _door(role):
    """The admin client require_role reads the caller's role from."""
    client = Mock()
    client.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {'role': 'org_managed', 'org_role': role, 'org_roles': [role]}]
    return client


class TestRoutes:
    def test_each_helper_route_has_one_owner(self, app):
        m = app.url_map.bind('localhost')
        assert m.match('/api/sis/points/helpers', method='GET')[0] == 'sis_points.list_helpers'
        assert m.match('/api/sis/points/helpers', method='PUT')[0] == 'sis_points.save_helpers'
        assert m.match('/api/sis/points/helper', method='GET')[0] == 'sis_points.helper_board'
        assert m.match('/api/sis/points/helper/entries', method='POST')[0] == 'sis_points.helper_add'

    def _call(self, app, auth_headers_for, caller, role, method, path, body=None, repo=None):
        repo = repo or HelperRepo()
        client = app.test_client()
        with patch('database.get_supabase_admin_client', return_value=_door(role)), \
             patch('modules.gate.check_module', return_value=None), \
             patch('modules.enabled.module_enabled', return_value=True), \
             patch('services.sis_points_service.SisPointsRepository', return_value=repo):
            resp = getattr(client, method)(path, json=body, headers=auth_headers_for(caller))
        return resp, repo

    def test_a_helper_gives_through_the_route(self, app, auth_headers_for):
        resp, repo = self._call(app, auth_headers_for, HELPER, 'student', 'post',
                                '/api/sis/points/helper/entries', GIVE)
        assert resp.status_code == 200, resp.get_json()
        assert len(repo.inserted) == 2

    def test_a_non_helper_student_gets_403_and_nothing_is_written(self, app, auth_headers_for):
        resp, repo = self._call(app, auth_headers_for, NOT_HELPER, 'student', 'post',
                                '/api/sis/points/helper/entries', GIVE)
        assert resp.status_code == 403
        assert repo.inserted == []
        resp, _ = self._call(app, auth_headers_for, NOT_HELPER, 'student', 'get', '/api/sis/points/helper')
        assert resp.status_code == 403

    @pytest.mark.parametrize('method,path', [
        ('get', '/api/sis/points/helper'),
        ('post', '/api/sis/points/helper/entries'),
    ])
    def test_a_parent_is_refused_at_the_door(self, app, auth_headers_for, method, path):
        repo = HelperRepo(helper_ids=[HELPER, PARENT])
        resp, repo = self._call(app, auth_headers_for, PARENT, 'parent', method, path, GIVE, repo)
        assert resp.status_code == 403
        assert repo.inserted == []

    def test_a_negative_amount_is_a_400_and_nothing_is_written(self, app, auth_headers_for):
        resp, repo = self._call(app, auth_headers_for, HELPER, 'student', 'post',
                                '/api/sis/points/helper/entries', {**GIVE, 'amount': -5})
        assert resp.status_code == 400
        assert repo.inserted == []

    def test_a_student_cannot_save_the_helper_list(self, app, auth_headers_for):
        with patch('services.org_settings_service.patch_feature_flags') as patch_flags:
            resp, _ = self._call(app, auth_headers_for, HELPER, 'student', 'put',
                                 '/api/sis/points/helpers', {'student_ids': [HELPER]})
        assert resp.status_code == 403
        patch_flags.assert_not_called()

    def test_an_admin_saves_the_list_into_sis_settings(self, app, auth_headers_for):
        with patch('services.sis_service.resolve_org_id', return_value=ORG), \
             patch('services.sis_service.caller_sees_pay', return_value=True), \
             patch('services.sis_service.get_user_org_context', return_value={'role': 'org_managed'}), \
             patch('services.org_settings_service.patch_feature_flags') as patch_flags:
            resp, _ = self._call(app, auth_headers_for, COACH, 'org_admin', 'put',
                                 '/api/sis/points/helpers', {'student_ids': [HELPER, KID_A]})
        assert resp.status_code == 200, resp.get_json()
        assert patch_flags.call_args[0] == (ORG, {'sis_settings': {POINT_HELPERS_KEY: [HELPER, KID_A]}})
        assert resp.get_json()['can_edit'] is True

    def test_an_admin_cannot_save_a_student_of_another_school(self, app, auth_headers_for):
        with patch('services.sis_service.resolve_org_id', return_value=ORG), \
             patch('services.org_settings_service.patch_feature_flags') as patch_flags:
            resp, _ = self._call(app, auth_headers_for, COACH, 'org_admin', 'put',
                                 '/api/sis/points/helpers', {'student_ids': [OUTSIDER]})
        assert resp.status_code == 400
        patch_flags.assert_not_called()

    def test_an_advisor_reads_the_list_but_cannot_save_it(self, app, auth_headers_for):
        with patch('services.sis_service.resolve_org_id', return_value=ORG), \
             patch('services.sis_service.caller_is_admin', return_value=False):
            resp, _ = self._call(app, auth_headers_for, COACH, 'advisor', 'get', '/api/sis/points/helpers')
        assert resp.status_code == 200
        assert resp.get_json() == {'success': True, 'can_edit': False,
                                   'helpers': [{'student_id': HELPER, 'name': 'Hal Kid'}]}
        with patch('services.org_settings_service.patch_feature_flags') as patch_flags:
            resp, _ = self._call(app, auth_headers_for, COACH, 'advisor', 'put',
                                 '/api/sis/points/helpers', {'student_ids': []})
        assert resp.status_code == 403
        patch_flags.assert_not_called()
