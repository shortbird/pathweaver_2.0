"""Students write their own weekly goals and add their own points.

Ticket 910668d8 (David Nilson, coach at Apogee Cache Valley): "We would like
the Adventurers to be able to type in their own goals, and us Coaches to be
able to edit the fields as well, similar to Google Sheets. I would also like
both the Adventurers and us Coaches to be able to input Points - but where we
Coaches can take them away if upon inspection they shouldn't have been
received."

Owner's rules (2026-10-12): a student types goal TEXT only, for the current
week only, until the Thursday check-in locks it; a coach's save keeps the
student's text unless the coach changed that subject. A student adds positive
points with a reason, capped per day; they count at once, are marked as the
student's, and a coach undoes them with the ordinary undo.
"""

from datetime import date
from unittest.mock import Mock, patch

import pytest

from services import sis_points_service as psvc
from services import sis_weekly_goal_service as gsvc
from services.sis_points_service import STUDENT_DAILY_CAP, PointsError, PointsService
from services.sis_weekly_goal_service import (
    LOCKED_MESSAGE, WeeklyGoalError, WeeklyGoalLocked, WeeklyGoalService,
)

ORG = 'org-1'
STUDENT = 'stu-1'
OTHER_STUDENT = 'stu-2'
PARENT = 'par-1'
COACH = 'coach-1'
SUBJECTS = ['Reading', 'Math', 'Fitness']
THIS_WEEK = '2026-10-12'   # the Monday of the fixed "today" below
TODAY = date(2026, 10, 14)


def _student(uid=STUDENT, org=ORG):
    return {'id': uid, 'first_name': 'Ada', 'last_name': 'Kid', 'organization_id': org,
            'role': 'org_managed', 'org_role': 'student'}


def _parent(uid=PARENT, org=ORG):
    return {'id': uid, 'first_name': 'Pat', 'last_name': 'Kid', 'organization_id': org,
            'role': 'org_managed', 'org_role': 'parent'}


@pytest.fixture(autouse=True)
def _fixed_clock(monkeypatch):
    original = gsvc.week_start_of
    monkeypatch.setattr(gsvc, 'week_start_of',
                        lambda value=None: original(TODAY if value is None else value))
    monkeypatch.setattr(gsvc, 'now_iso', lambda: '2026-10-14T15:00:00+00:00')
    monkeypatch.setattr(psvc, 'now_iso', lambda: '2026-10-14T15:00:00+00:00')


@pytest.fixture
def module_on():
    with patch('modules.enabled.module_enabled', return_value=True) as m:
        yield m


@pytest.fixture
def module_off():
    with patch('modules.enabled.module_enabled', return_value=False) as m:
        yield m


# -- weekly goals -------------------------------------------------------------

class GoalRepo:
    def __init__(self, existing=None, users=None):
        self.existing = existing
        self.users = {u['id']: u for u in (users or [_student()])}
        self.saved = None

    def user_row(self, user_id):
        return self.users.get(user_id)

    def org_row(self, org_id):
        return {'id': ORG, 'feature_flags': {'sis_settings': {'goal_subjects': SUBJECTS}}}

    def get(self, org_id, student_id, week_start):
        return self.existing

    def upsert(self, payload):
        self.saved = payload
        return payload


STAFF_WEEK = {
    'id': 'w1', 'organization_id': ORG, 'student_user_id': STUDENT, 'week_start': THIS_WEEK,
    'goals': [{'subject': 'Reading', 'goal': 'Ch 3', 'completed': True},
              {'subject': 'Math', 'goal': '', 'completed': None},
              {'subject': 'Fitness', 'goal': 'Run', 'completed': None}],
    'complaints': 2, 'valid_complaints': 1, 'notes': 'Coach note',
    'goals_set_by': COACH, 'goals_set_at': '2026-10-12T09:00:00Z',
    'checked_in_by': None, 'checked_in_at': None,
}


class TestStudentWritesOwnGoals:
    def test_student_writes_goal_text_for_the_current_week(self, module_on):
        """Ticket 910668d8: "We would like the Adventurers to be able to type
        in their own goals." Only the subjects sent change; the coach's other
        goals and ticks stay."""
        repo = GoalRepo(existing=dict(STAFF_WEEK))
        out = WeeklyGoalService(repo).save_own_goals(STUDENT, {
            'goals': [{'subject': 'Math', 'goal': 'Lesson 4'}]})
        assert repo.saved['week_start'] == THIS_WEEK
        assert [(g['subject'], g['goal'], g['completed']) for g in repo.saved['goals']] == [
            ('Reading', 'Ch 3', True), ('Math', 'Lesson 4', None), ('Fitness', 'Run', None)]
        assert repo.saved['goals_set_by'] == STUDENT
        assert out['notes'] == 'Coach note'

    def test_first_write_of_the_week_creates_the_row(self, module_on):
        repo = GoalRepo(existing=None)
        WeeklyGoalService(repo).save_own_goals(STUDENT, {
            'goals': [{'subject': 'Reading', 'goal': 'Ch 1'}]})
        assert [g['goal'] for g in repo.saved['goals']] == ['Ch 1', '', '']

    def test_refused_after_the_thursday_check_in(self, module_on):
        """Owner: goals lock once the coach records the Thursday check-in."""
        repo = GoalRepo(existing={**STAFF_WEEK, 'checked_in_at': '2026-10-15T10:00:00Z'})
        with pytest.raises(WeeklyGoalLocked, match=LOCKED_MESSAGE):
            WeeklyGoalService(repo).save_own_goals(STUDENT, {
                'goals': [{'subject': 'Math', 'goal': 'Lesson 4'}]})
        assert repo.saved is None

    @pytest.mark.parametrize('week', ['2026-10-05', '2026-10-19'])
    def test_refused_for_another_week(self, module_on, week):
        repo = GoalRepo()
        with pytest.raises(WeeklyGoalError):
            WeeklyGoalService(repo).save_own_goals(STUDENT, {
                'week_start': week, 'goals': [{'subject': 'Math', 'goal': 'x'}]})
        assert repo.saved is None

    def test_any_day_of_this_week_is_this_week(self, module_on):
        repo = GoalRepo()
        WeeklyGoalService(repo).save_own_goals(STUDENT, {
            'week_start': '2026-10-16', 'goals': [{'subject': 'Math', 'goal': 'x'}]})
        assert repo.saved['week_start'] == THIS_WEEK

    def test_a_parent_is_refused(self, module_on):
        repo = GoalRepo(users=[_parent()])
        with pytest.raises(PermissionError):
            WeeklyGoalService(repo).save_own_goals(PARENT, {
                'goals': [{'subject': 'Math', 'goal': 'x'}]})
        assert repo.saved is None

    def test_writes_only_the_callers_own_row(self, module_on):
        """There is no student id in the request: a body naming another
        student is ignored, and the caller's row is the one written."""
        repo = GoalRepo(users=[_student(), _student(OTHER_STUDENT)])
        WeeklyGoalService(repo).save_own_goals(STUDENT, {
            'student_id': OTHER_STUDENT, 'student_user_id': OTHER_STUDENT,
            'goals': [{'subject': 'Math', 'goal': 'x'}]})
        assert repo.saved['student_user_id'] == STUDENT

    def test_refused_when_the_module_is_off(self, module_off):
        repo = GoalRepo()
        with pytest.raises(PermissionError):
            WeeklyGoalService(repo).save_own_goals(STUDENT, {
                'goals': [{'subject': 'Math', 'goal': 'x'}]})
        assert repo.saved is None

    def test_cannot_set_ticks_complaints_notes_or_the_check_in(self, module_on):
        """Owner: "They can never write done ticks, complaints, notes or the
        check-in." The payload carries none of those columns, so the upsert
        leaves the coach's values alone."""
        repo = GoalRepo(existing=dict(STAFF_WEEK))
        WeeklyGoalService(repo).save_own_goals(STUDENT, {
            'goals': [{'subject': 'Reading', 'goal': 'Ch 3', 'completed': False},
                      {'subject': 'Math', 'goal': 'Lesson 4', 'completed': True}],
            'complaints': 0, 'valid_complaints': 0, 'notes': 'mine now',
            'check_in': True, 'checked_in_at': '2026-10-14T00:00:00Z',
        })
        saved = repo.saved
        for column in ('complaints', 'valid_complaints', 'notes', 'checked_in_at', 'checked_in_by'):
            assert column not in saved
        assert [g['completed'] for g in saved['goals']] == [True, None, None]


class TestStaffSaveKeepsStudentText:
    def test_staff_save_still_works_and_keeps_text_the_coach_did_not_touch(self):
        """Ticket 910668d8: "us Coaches to be able to edit the fields as
        well." The coach's form loaded Math blank; the student has since
        typed "Lesson 4". The coach changes Reading only, so Math keeps the
        student's text."""
        stored = {**STAFF_WEEK, 'goals': [
            {'subject': 'Reading', 'goal': 'Ch 3', 'completed': None},
            {'subject': 'Math', 'goal': 'Lesson 4', 'completed': None},
            {'subject': 'Fitness', 'goal': 'Run', 'completed': None}]}
        loaded = [{'subject': 'Reading', 'goal': 'Ch 3'}, {'subject': 'Math', 'goal': ''},
                  {'subject': 'Fitness', 'goal': 'Run'}]
        repo = GoalRepo(existing=stored)
        out = WeeklyGoalService(repo).save(ORG, STUDENT, THIS_WEEK, {
            'goals': [{'subject': 'Reading', 'goal': 'Ch 4'}, {'subject': 'Math', 'goal': ''},
                      {'subject': 'Fitness', 'goal': 'Run'}],
            'base_goals': loaded, 'complaints': 2, 'valid_complaints': 1, 'notes': 'Coach note',
        }, COACH)
        assert [g['goal'] for g in out['goals']] == ['Ch 4', 'Lesson 4', 'Run']
        assert out['complaints'] == 2

    def test_a_subject_the_coach_changed_wins(self):
        stored = {**STAFF_WEEK, 'goals': [{'subject': 'Math', 'goal': 'Student text'}]}
        repo = GoalRepo(existing=stored)
        out = WeeklyGoalService(repo).save(ORG, STUDENT, THIS_WEEK, {
            'goals': [{'subject': 'Math', 'goal': 'Coach text'}],
            'base_goals': [{'subject': 'Math', 'goal': ''}],
        }, COACH)
        assert out['goals'][1]['goal'] == 'Coach text'

    def test_without_base_goals_the_week_is_replaced_as_before(self):
        stored = {**STAFF_WEEK, 'goals': [{'subject': 'Math', 'goal': 'Student text'}]}
        repo = GoalRepo(existing=stored)
        out = WeeklyGoalService(repo).save(ORG, STUDENT, THIS_WEEK, {
            'goals': [{'subject': 'Math', 'goal': ''}]}, COACH)
        assert out['goals'][1]['goal'] == ''


class TestGoalsMine:
    def _repo(self, week):
        class Repo(GoalRepo):
            def history(self, student_id, limit):
                return [week] if week else []

            def annual_goal_rows(self, org_id, student_ids):
                return []
        return Repo(users=[_student(), _parent()])

    def test_a_student_can_edit_this_week_until_check_in(self, module_on):
        out = WeeklyGoalService(self._repo(dict(STAFF_WEEK))).mine(STUDENT)
        assert out[0]['is_self'] is True
        assert out[0]['can_edit_goals'] is True
        assert out[0]['goals_locked'] is False

    def test_locked_after_check_in(self, module_on):
        week = {**STAFF_WEEK, 'checked_in_at': '2026-10-15T10:00:00Z'}
        out = WeeklyGoalService(self._repo(week)).mine(STUDENT)
        assert out[0]['can_edit_goals'] is False
        assert out[0]['goals_locked'] is True

    def test_a_parent_reads_only(self, module_on):
        with patch('utils.class_membership.children_of_parent', return_value={STUDENT}):
            out = WeeklyGoalService(self._repo(dict(STAFF_WEEK))).mine(PARENT)
        assert out[0]['is_self'] is False
        assert out[0]['can_edit_goals'] is False


# -- points -------------------------------------------------------------------

class PointsRepo:
    def __init__(self, users=None, balance=0, added_today=None, entry=None):
        self._users = {u['id']: u for u in (users or [_student()])}
        self._balance = balance
        self._added = added_today or []
        self._entry = entry
        self.inserted = []
        self.deleted = []
        self.since = None

    def users(self, ids):
        return [self._users[i] for i in ids if i in self._users]

    def org_timezone(self, org_id):
        return 'America/Denver'

    def self_added_since(self, org_id, student_id, since_iso):
        self.since = since_iso
        return [{'id': f'a{i}', 'amount': a} for i, a in enumerate(self._added)]

    def balances(self, org_id, student_ids=None):
        total = self._balance + sum(r['amount'] for r in self.inserted) - (
            self._entry['amount'] if self.deleted and self._entry else 0)
        return [{'student_user_id': STUDENT, 'balance': total}]

    def insert_entries(self, rows):
        self.inserted.extend(rows)
        return [{**r, 'id': f'e{i}'} for i, r in enumerate(rows)]

    def entry(self, entry_id):
        return self._entry

    def delete_entry(self, entry_id):
        self.deleted.append(entry_id)

    def student_entries(self, org_id, student_id, limit):
        return []


class TestStudentAddsOwnPoints:
    def test_allowed_counted_at_once_and_flagged(self, module_on):
        """Ticket 910668d8: "I would also like both the Adventurers and us
        Coaches to be able to input Points." A student's points count in
        the balance at once and are marked as the student's."""
        repo = PointsRepo(balance=10)
        out = PointsService(repo).add_own(STUDENT, {'amount': 5, 'reason': 'Cleaned the kitchen'})
        row = repo.inserted[0]
        assert (row['student_user_id'], row['created_by'], row['amount']) == (STUDENT, STUDENT, 5)
        assert out['balance'] == 15
        assert out['entries'][0]['added_by_student'] is True
        assert out['entries'][0]['source'] == 'student'

    def test_staff_entries_are_not_flagged(self):
        assert psvc.added_by_student({'created_by': COACH, 'student_user_id': STUDENT}) is False
        assert psvc.added_by_student({'created_by': None, 'student_user_id': STUDENT}) is False

    def test_the_daily_cap_is_enforced(self, module_on):
        repo = PointsRepo(added_today=[15])
        with pytest.raises(PointsError, match='5 left today'):
            PointsService(repo).add_own(STUDENT, {'amount': 6, 'reason': 'Job'})
        assert repo.inserted == []
        PointsService(repo).add_own(STUDENT, {'amount': 5, 'reason': 'Job'})
        assert repo.inserted[0]['amount'] == 5

    def test_the_cap_day_starts_at_the_schools_midnight(self, module_on):
        repo = PointsRepo()
        PointsService(repo).add_own(STUDENT, {'amount': 1, 'reason': 'Job'})
        # Denver is UTC-6 in October: midnight there is 06:00 UTC.
        assert repo.since.endswith('T06:00:00+00:00')

    def test_cap_is_a_sensible_default(self):
        assert STUDENT_DAILY_CAP == 20

    @pytest.mark.parametrize('body', [
        {'amount': -5, 'reason': 'Spend'},
        {'amount': 0, 'reason': 'Nothing'},
        {'amount': 5, 'reason': '   '},
        {'amount': 5},
    ])
    def test_negative_zero_or_reasonless_is_refused(self, module_on, body):
        repo = PointsRepo()
        with pytest.raises(PointsError):
            PointsService(repo).add_own(STUDENT, body)
        assert repo.inserted == []

    def test_a_parent_is_refused(self, module_on):
        repo = PointsRepo(users=[_parent()])
        with pytest.raises(PermissionError):
            PointsService(repo).add_own(PARENT, {'amount': 5, 'reason': 'Job'})
        assert repo.inserted == []

    def test_refused_when_the_module_is_off(self, module_off):
        repo = PointsRepo()
        with pytest.raises(PermissionError):
            PointsService(repo).add_own(STUDENT, {'amount': 5, 'reason': 'Job'})
        assert repo.inserted == []

    def test_a_body_naming_another_student_still_writes_the_caller(self, module_on):
        repo = PointsRepo(users=[_student(), _student(OTHER_STUDENT)])
        PointsService(repo).add_own(STUDENT, {'student_ids': [OTHER_STUDENT], 'amount': 5,
                                              'reason': 'Job'})
        assert repo.inserted[0]['student_user_id'] == STUDENT

    def test_staff_undo_works_on_a_student_entry(self):
        """Ticket 910668d8: "where we Coaches can take them away if upon
        inspection they shouldn't have been received." The ordinary undo."""
        entry = {'id': 'e1', 'organization_id': ORG, 'student_user_id': STUDENT,
                 'created_by': STUDENT, 'amount': 5}
        repo = PointsRepo(balance=15, entry=entry)
        out = PointsService(repo).undo(ORG, 'e1')
        assert repo.deleted == ['e1']
        assert out == {'student_id': STUDENT, 'balance': 10}


class TestPointsMine:
    def test_a_student_sees_the_add_form_and_their_day(self, module_on):
        out = PointsService(PointsRepo(added_today=[3])).mine(STUDENT)
        assert out[0]['can_add'] is True
        assert (out[0]['daily_cap'], out[0]['added_today']) == (20, 3)

    def test_a_parent_does_not(self, module_on):
        repo = PointsRepo(users=[_student(), _parent()])
        with patch('utils.class_membership.children_of_parent', return_value={STUDENT}):
            out = PointsService(repo).mine(PARENT)
        assert out[0]['can_add'] is False
        assert 'daily_cap' not in out[0]


# -- routes -------------------------------------------------------------------

class TestRoutes:
    def test_self_routes_have_one_owner(self, app):
        m = app.url_map.bind('localhost')
        assert m.match('/api/sis/weekly-goals/mine/goals', method='PUT')[0] == \
            'sis_weekly_goals.save_my_goals'
        assert m.match('/api/sis/points/mine', method='POST')[0] == 'sis_points.add_mine'

    @pytest.mark.parametrize('method,path', [
        ('put', '/api/sis/weekly-goals/mine/goals'),
        ('post', '/api/sis/points/mine'),
    ])
    def test_a_parent_is_refused_at_the_door(self, app, auth_headers_for, method, path):
        """require_role('student'): a parent in family scope never reaches
        the service."""
        users = Mock()
        users.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {'role': 'org_managed', 'org_role': 'parent', 'org_roles': ['parent']}]
        client = app.test_client()
        headers = auth_headers_for(PARENT)
        with patch('database.get_supabase_admin_client', return_value=users), \
             patch('modules.gate.check_module', return_value=None), \
             patch('services.sis_points_service.PointsService.add_own') as add_own, \
             patch('services.sis_weekly_goal_service.WeeklyGoalService.save_own_goals') as save_own:
            resp = getattr(client, method)(path, json={'amount': 5, 'reason': 'x', 'goals': []},
                                           headers=headers)
        assert resp.status_code == 403
        add_own.assert_not_called()
        save_own.assert_not_called()
