"""
Who took the roll: class sessions, the covered-by flag, planned substitutes
(P7, iCreate 2026-09-23).

iCreate's coordinators need to know whether the assigned teacher taught a class
or somebody covered it. The roll is the signal, but sis_attendance.recorded_by
is overwritten by every save. sis_class_sessions keeps the FIRST saver, flags a
roll taken by someone who is not an assigned teacher, and lets the office mark a
substitute ahead of time -- which grants that class's roster and attendance for
that date only.
"""

import json
from contextlib import contextmanager
from datetime import date, datetime
from unittest.mock import Mock, patch

import pytest

from services import sis_class_session_service as svc


ORG = 'org-1'
DAY = '2026-09-22'  # a Tuesday -> day_of_week 2 (0=Sun)


# ── Pure rules ───────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestDeriveStatus:
    TEACHERS = {'t1', 'aide'}

    def test_the_assigned_teacher_is_the_normal_day(self):
        assert svc.derive_status('t1', self.TEACHERS, None) == ('none', None)

    def test_an_assistant_counts_as_assigned(self):
        assert svc.derive_status('aide', self.TEACHERS, None) == ('none', None)

    def test_anybody_else_is_flagged_as_the_presumed_substitute(self):
        assert svc.derive_status('other-teacher', self.TEACHERS, None) == ('flagged', 'other-teacher')

    def test_the_planned_substitute_taking_roll_confirms_the_plan(self):
        assert svc.derive_status('sub', self.TEACHERS, 'sub') == ('confirmed_sub', 'sub')

    def test_the_teacher_taking_roll_despite_a_planned_sub_is_flagged(self):
        """Somebody must decide whether the sub was needed; the planned sub
        stays named on the flag."""
        assert svc.derive_status('t1', self.TEACHERS, 'sub') == ('flagged', 'sub')

    def test_a_third_person_despite_a_planned_sub_is_flagged_as_them(self):
        assert svc.derive_status('x', self.TEACHERS, 'sub') == ('flagged', 'x')

    def test_no_roll_yet_keeps_the_plan_and_checks_nothing(self):
        assert svc.derive_status(None, self.TEACHERS, 'sub') == ('none', 'sub')


@pytest.mark.unit
class TestMeetingForDate:
    def test_the_weekly_meeting_on_that_weekday(self):
        meetings = [{'id': 'm-thu', 'day_of_week': 4, 'specific_date': None, 'start_time': '09:00'},
                    {'id': 'm-tue', 'day_of_week': 2, 'specific_date': None, 'start_time': '09:00'}]
        assert svc.meeting_for_date(meetings, DAY)['id'] == 'm-tue'

    def test_a_one_off_on_the_date_wins_over_the_weekly_one(self):
        meetings = [{'id': 'weekly', 'day_of_week': 2, 'specific_date': None, 'start_time': '09:00'},
                    {'id': 'oneoff', 'day_of_week': None, 'specific_date': DAY, 'start_time': '13:00'}]
        assert svc.meeting_for_date(meetings, DAY)['id'] == 'oneoff'

    def test_no_meeting_that_day(self):
        assert svc.meeting_for_date([{'id': 'm', 'day_of_week': 4, 'specific_date': None,
                                      'start_time': '09:00'}], DAY) is None
        assert svc.meeting_for_date([], 'junk') is None


@pytest.mark.unit
class TestOverdueRolls:
    SCHEDULE = [
        {'class_id': 'late', 'class_name': 'Pottery', 'start_time': '09:00:00', 'enrolled_count': 8},
        {'class_id': 'taken', 'class_name': 'Robotics', 'start_time': '09:00:00', 'enrolled_count': 8},
        {'class_id': 'soon', 'class_name': 'Choir', 'start_time': '09:50:00', 'enrolled_count': 8},
        {'class_id': 'empty', 'class_name': 'Nobody', 'start_time': '08:00:00', 'enrolled_count': 0},
    ]

    def test_started_past_the_grace_with_no_roll(self):
        # 10:00 -> 600 minutes. Pottery started 60 ago; Choir 10 ago (< 15).
        out = svc.overdue_rolls(self.SCHEDULE, {'taken'}, 600, 15)
        assert [m['class_id'] for m in out] == ['late']
        assert out[0]['minutes_late'] == 60

    def test_exactly_at_the_grace_is_not_yet_late(self):
        assert svc.overdue_rolls(self.SCHEDULE[:1], set(), 9 * 60 + 15, 15) == []

    def test_setting_defaults_and_clamps(self):
        assert svc.roll_check_minutes({}) == 15
        assert svc.roll_check_minutes({'roll_check_minutes': '30'}) == 30
        assert svc.roll_check_minutes({'roll_check_minutes': 'soon'}) == 15
        assert svc.roll_check_minutes({'roll_check_minutes': 100000}) == svc.MAX_ROLL_CHECK_MINUTES
        assert svc.roll_check_minutes({'roll_check_minutes': -5}) == 0


# ── The save path ────────────────────────────────────────────────────────────

class FakeRepo:
    """In-memory sis_class_sessions with the repository's contract: one row per
    (class_id, date, meeting_id), insert_if_absent returns None on a clash,
    claim_first_taker only writes when taken_by is empty."""

    def __init__(self, rows=None):
        self.rows = [dict(r) for r in (rows or [])]
        self.n = len(self.rows)

    def get(self, sid):
        return next((r for r in self.rows if r['id'] == sid), None)

    def for_class_date(self, class_id, on_date):
        return next((r for r in self.rows if r['class_id'] == class_id and r['date'] == on_date), None)

    def insert_if_absent(self, row):
        if any(r['class_id'] == row['class_id'] and r['date'] == row['date']
               and r.get('meeting_id') == row.get('meeting_id') for r in self.rows):
            return None
        self.n += 1
        new = {'id': f's{self.n}', 'sub_status': 'none', **row}
        self.rows.append(new)
        return new

    def patch(self, sid, fields):
        r = self.get(sid)
        r.update(fields)
        return r

    def claim_first_taker(self, sid, fields):
        r = self.get(sid)
        if r.get('taken_by'):
            return None
        r.update(fields)
        return r

    def covering_class_ids(self, user_id, org_id, on_date):
        return [r['class_id'] for r in self.rows
                if r.get('substitute_id') == user_id and r['date'] == on_date and r.get('planned_by')]

    def planned_for_date(self, org_id, on_date):
        return [{'class_id': r['class_id'], 'substitute_id': r['substitute_id']} for r in self.rows
                if r['date'] == on_date and r.get('planned_by') and r.get('substitute_id')]

    def for_org_date(self, org_id, on_date):
        return [r for r in self.rows if r['date'] == on_date]

    def flagged(self, org_id):
        return [r for r in self.rows if r.get('sub_status') == 'flagged']

    def in_range(self, org_id, a, b):
        return [r for r in self.rows if a <= r['date'] <= b]


@contextmanager
def sessions_with(repo, teachers=('t1',), meetings=None, staff=True):
    with patch.object(svc, '_repo', return_value=repo), \
         patch.object(svc.class_membership, 'class_teacher_ids', return_value=set(teachers)), \
         patch.object(svc, '_class_meetings', return_value=meetings or []), \
         patch.object(svc, '_staff_in_org', return_value=staff), \
         patch.object(svc, '_names', side_effect=lambda ids: {i: i.upper() for i in ids if i}), \
         patch.object(svc, '_now', return_value='2026-09-22T15:04:00+00:00'):
        yield


@pytest.mark.unit
class TestRecordRoll:
    MEETING = [{'id': 'm1', 'day_of_week': 2, 'specific_date': None, 'start_time': '09:00'}]

    def test_the_first_save_records_the_taker_and_the_meeting(self):
        repo = FakeRepo()
        with sessions_with(repo, meetings=self.MEETING):
            svc.record_roll(ORG, 'c1', DAY, 't1')
        row = repo.rows[0]
        assert (row['taken_by'], row['last_saved_by']) == ('t1', 't1')
        assert row['meeting_id'] == 'm1'
        assert row['sub_status'] == 'none' and row['substitute_id'] is None

    def test_a_later_save_never_replaces_the_first_taker(self):
        repo = FakeRepo()
        with sessions_with(repo):
            svc.record_roll(ORG, 'c1', DAY, 't1')
            svc.record_roll(ORG, 'c1', DAY, 'coordinator')
        assert len(repo.rows) == 1
        assert repo.rows[0]['taken_by'] == 't1'
        assert repo.rows[0]['last_saved_by'] == 'coordinator'
        # A coordinator fixing a mark after the teacher's roll is not a cover.
        assert repo.rows[0]['sub_status'] == 'none'

    def test_a_roll_by_someone_not_assigned_is_flagged(self):
        repo = FakeRepo()
        with sessions_with(repo, teachers=('t1',)):
            svc.record_roll(ORG, 'c1', DAY, 'other-teacher')
        assert repo.rows[0]['sub_status'] == 'flagged'
        assert repo.rows[0]['substitute_id'] == 'other-teacher'

    def test_the_planned_substitute_taking_roll_is_confirmed(self):
        repo = FakeRepo([{'id': 'p', 'organization_id': ORG, 'class_id': 'c1', 'date': DAY,
                          'meeting_id': None, 'taken_by': None, 'substitute_id': 'sub',
                          'planned_by': 'coord', 'sub_status': 'none'}])
        with sessions_with(repo):
            svc.record_roll(ORG, 'c1', DAY, 'sub')
        row = repo.rows[0]
        assert (row['taken_by'], row['sub_status'], row['substitute_id']) == ('sub', 'confirmed_sub', 'sub')

    def test_a_coordinators_decision_is_not_overwritten_by_the_first_roll(self):
        repo = FakeRepo([{'id': 'p', 'organization_id': ORG, 'class_id': 'c1', 'date': DAY,
                          'meeting_id': None, 'taken_by': None, 'substitute_id': 'sub',
                          'planned_by': 'coord', 'sub_status': 'teacher_present',
                          'confirmed_by': 'coord'}])
        with sessions_with(repo):
            svc.record_roll(ORG, 'c1', DAY, 'stranger')
        assert repo.rows[0]['sub_status'] == 'teacher_present'
        assert repo.rows[0]['taken_by'] == 'stranger'

    def test_a_failure_is_swallowed_so_the_roll_still_saves(self):
        broken = Mock()
        broken.for_class_date.side_effect = RuntimeError('relation "sis_class_sessions" does not exist')
        with sessions_with(broken):
            assert svc.record_roll(ORG, 'c1', DAY, 't1') is None

    def test_attendance_record_upserts_the_session(self):
        """The wiring: sis_attendance_service.record calls record_roll with the
        saver, after the rows are written. Without it no session is ever made."""
        from services import sis_attendance_service as att
        q = Mock()
        for chained in ('select', 'eq'):
            getattr(q, chained).return_value = q
        q.execute.return_value = Mock(data=[])
        q.upsert.return_value.execute.return_value = Mock(data=[{'student_user_id': 's1'}])
        client = Mock()
        client.table.return_value = q
        with patch.object(att, '_admin', return_value=client), \
             patch.object(att, '_notify_admins_of_absences', return_value=0), \
             patch.object(svc, 'record_roll') as roll:
            att.record(ORG, 'c1', DAY, [{'student_user_id': 's1', 'status': 'present'}],
                       recorded_by='t1')
        roll.assert_called_once_with(ORG, 'c1', DAY, 't1')


@pytest.mark.unit
class TestPlanAndResolve:
    def test_planning_creates_the_session_before_any_roll(self):
        repo = FakeRepo()
        with sessions_with(repo):
            out = svc.plan_substitute(ORG, 'c1', DAY, 'sub', actor_id='coord')
        row = repo.rows[0]
        assert (row['substitute_id'], row['planned_by'], row.get('taken_by')) == ('sub', 'coord', None)
        assert out['session']['planned'] is True
        assert out['session']['substitute_name'] == 'SUB'

    def test_planning_after_the_teacher_took_roll_raises_a_flag(self):
        repo = FakeRepo([{'id': 'x', 'organization_id': ORG, 'class_id': 'c1', 'date': DAY,
                          'meeting_id': None, 'taken_by': 't1', 'sub_status': 'none'}])
        with sessions_with(repo):
            svc.plan_substitute(ORG, 'c1', DAY, 'sub', actor_id='coord')
        assert repo.rows[0]['sub_status'] == 'flagged'
        assert repo.rows[0]['substitute_id'] == 'sub'

    def test_clearing_the_plan_revokes_the_grant(self):
        repo = FakeRepo()
        with sessions_with(repo):
            svc.plan_substitute(ORG, 'c1', DAY, 'sub', actor_id='coord')
            assert svc.covering_class_ids('sub', ORG, DAY) == ['c1']
            svc.plan_substitute(ORG, 'c1', DAY, None, actor_id='coord')
            assert svc.covering_class_ids('sub', ORG, DAY) == []

    def test_only_staff_of_the_school_can_be_the_substitute(self):
        with sessions_with(FakeRepo(), staff=False):
            assert svc.plan_substitute(ORG, 'c1', DAY, 'parent', actor_id='coord') == {
                'error': 'Pick a staff member of this school'}

    def test_a_bad_date_is_refused(self):
        with sessions_with(FakeRepo()):
            assert 'error' in svc.plan_substitute(ORG, 'c1', 'soon', 'sub', actor_id='coord')

    def _flagged(self):
        return FakeRepo([{'id': 'f', 'organization_id': ORG, 'class_id': 'c1', 'date': DAY,
                          'meeting_id': None, 'taken_by': 'other', 'substitute_id': 'other',
                          'sub_status': 'flagged'}])

    def test_confirming_a_substitute(self):
        repo = self._flagged()
        with sessions_with(repo):
            out = svc.resolve(ORG, 'f', 'confirmed_sub', None, actor_id='coord')
        assert out['session']['sub_status'] == 'confirmed_sub'
        assert repo.rows[0]['confirmed_by'] == 'coord'

    def test_other_needs_a_note(self):
        repo = self._flagged()
        with sessions_with(repo):
            assert svc.resolve(ORG, 'f', 'other', '  ', actor_id='coord') == {
                'error': 'Say what happened in the note'}
            assert svc.resolve(ORG, 'f', 'other', 'Field trip', actor_id='coord')['session']['sub_note'] == 'Field trip'

    def test_another_schools_session_is_not_found(self):
        repo = self._flagged()
        with sessions_with(repo):
            assert svc.resolve('org-2', 'f', 'teacher_present', None, actor_id='coord') == {
                'error': 'Session not found'}

    def test_an_unknown_outcome_is_refused(self):
        with sessions_with(self._flagged()):
            assert svc.resolve(ORG, 'f', 'flagged', None, actor_id='coord') == {'error': 'Unknown outcome'}


# ── Access: one class, one date ──────────────────────────────────────────────

@pytest.mark.unit
class TestClassScopeOnDate:
    def _scope(self, on_date):
        from services import sis_service
        repo = FakeRepo([{'id': 'p', 'organization_id': ORG, 'class_id': 'covered', 'date': DAY,
                          'substitute_id': 'sub', 'planned_by': 'coord'}])
        with patch.object(sis_service, 'caller_is_admin', return_value=False), \
             patch.object(sis_service, 'advisor_class_ids', return_value=['own']), \
             patch.object(svc, '_repo', return_value=repo):
            return sis_service.class_scope('sub', ORG, on_date=on_date)

    def test_the_planned_date_admits_the_covered_class(self):
        assert self._scope(DAY) == ['own', 'covered']

    def test_another_date_does_not(self):
        assert self._scope('2026-09-23') == ['own']

    def test_no_date_means_no_substitute_grant(self):
        """Every route that does not pass on_date -- gradebook, submissions,
        messaging -- keeps the person inside their own classes."""
        assert self._scope(None) == ['own']


def _admin_client_for_role(role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


@contextmanager
def caller(role):
    with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role(role)), \
         patch('services.sis_service.resolve_org_id', return_value=ORG):
        yield


@pytest.mark.unit
class TestRoutes:
    def test_the_attendance_gate_asks_about_the_rolls_date(self, client, auth_headers, mock_verify_token):
        seen = {}

        def scope(user_id, org_id, on_date=None):
            seen['on_date'] = on_date
            return ['c1'] if on_date == DAY else []

        with caller('advisor'), patch('services.sis_service.class_scope', side_effect=scope), \
             patch('routes.sis.attendance._class_in_org', return_value=True), \
             patch('routes.sis.attendance.attendance.get_for_date', return_value=[]), \
             patch('routes.sis.attendance.sessions.session_for', return_value={'taken_by_name': 'Ms. R'}):
            ok = client.get(f'/api/sis/classes/c1/attendance?date={DAY}&organization_id={ORG}',
                            headers=auth_headers)
            other_day = client.get(f'/api/sis/classes/c1/attendance?date=2026-09-23&organization_id={ORG}',
                                   headers=auth_headers)
        assert ok.status_code == 200
        assert json.loads(ok.data)['session'] == {'taken_by_name': 'Ms. R'}
        assert other_day.status_code == 404
        assert seen['on_date'] == '2026-09-23'

    def test_a_teacher_cannot_plan_a_substitute(self, client, auth_headers, mock_verify_token):
        with caller('advisor'):
            resp = client.put('/api/sis/classes/c1/substitute', headers=auth_headers,
                              json={'date': DAY, 'substitute_id': 'x', 'organization_id': ORG})
        assert resp.status_code == 403

    def test_a_coordinator_plans_one(self, client, auth_headers, mock_verify_token):
        with caller('org_admin'), \
             patch('routes.sis.attendance._class_in_org', return_value=True), \
             patch('routes.sis.attendance.sessions.plan_substitute',
                   return_value={'session': {'substitute_name': 'Sub'}}) as plan:
            resp = client.put('/api/sis/classes/c1/substitute', headers=auth_headers,
                              json={'date': DAY, 'substitute_id': 'x', 'organization_id': ORG})
        assert resp.status_code == 200
        plan.assert_called_once_with(ORG, 'c1', DAY, 'x', actor_id='test-user-123')

    def test_resolve_maps_not_found_to_404(self, client, auth_headers, mock_verify_token):
        with caller('org_admin'), \
             patch('routes.sis.attendance.sessions.resolve', return_value={'error': 'Session not found'}):
            resp = client.post('/api/sis/attendance/sessions/s1/resolve', headers=auth_headers,
                               json={'outcome': 'teacher_present', 'organization_id': ORG})
        assert resp.status_code == 404

    def test_the_history_report_downloads_as_csv(self, client, auth_headers, mock_verify_token):
        report = {'rows': [{'date': DAY, 'class_name': 'Pottery', 'teacher_name': 'Ms. R',
                            'taken_by_name': 'Mr. S', 'taken_at_local': '2026-09-22 9:04am',
                            'taker_is_teacher': False, 'substitute_name': 'Mr. S',
                            'status_label': 'To check', 'planned_by_name': None,
                            'confirmed_by_name': None, 'sub_note': None}]}
        with caller('org_admin'), \
             patch('services.sis_staff_service._org_now', return_value=datetime(2026, 9, 22, 10, 0)), \
             patch('services.sis_class_session_service.history', return_value=report):
            resp = client.get(f'/api/sis/reports/roll-call?from={DAY}&to={DAY}&format=csv'
                              f'&organization_id={ORG}', headers=auth_headers)
        assert resp.status_code == 200
        body = resp.data.decode()
        assert 'Roll taken by' in body.splitlines()[0]
        assert 'Pottery,Ms. R,Mr. S,2026-09-22 9:04am,No,Mr. S,To check' in body


# ── History ──────────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestHistory:
    def test_rows_name_the_taker_and_whether_they_teach_the_class(self):
        repo = FakeRepo([
            {'id': 'a', 'organization_id': ORG, 'class_id': 'c1', 'date': DAY, 'taken_by': 't1',
             'taken_at': '2026-09-22T15:04:00+00:00', 'sub_status': 'none'},
            {'id': 'b', 'organization_id': ORG, 'class_id': 'c1', 'date': '2026-09-23', 'taken_by': 'x',
             'taken_at': '2026-09-23T15:10:00+00:00', 'substitute_id': 'x', 'sub_status': 'confirmed_sub'},
        ])
        from zoneinfo import ZoneInfo
        with sessions_with(repo), \
             patch.object(svc, '_class_names', return_value={'c1': {'id': 'c1', 'name': 'Pottery',
                                                                     'primary_instructor_id': 't1'}}):
            report = svc.history(ORG, DAY, '2026-09-23', tz=ZoneInfo('America/Denver'))
        rows = report['rows']
        assert [r['taker_is_teacher'] for r in rows] == [True, False]
        assert rows[0]['taken_at_local'] == '2026-09-22 9:04am'
        assert rows[1]['status_label'] == 'Substitute confirmed'
        csv = svc.history_csv_rows(report)
        assert csv[1][:7] == ['2026-09-23', 'Pottery', 'T1', 'X', '2026-09-23 9:10am', 'No', 'X']

    def test_bad_ranges_are_refused(self):
        assert 'error' in svc.history(ORG, 'soon', DAY)
        assert 'error' in svc.history(ORG, '2026-09-23', DAY)


# ── Teachers to check ────────────────────────────────────────────────────────

@pytest.mark.unit
class TestTeachersToCheck:
    def test_no_roll_and_flags_together(self):
        schedule = [{'class_id': 'c1', 'class_name': 'Pottery', 'start_time': '09:00', 'enrolled_count': 5},
                    {'class_id': 'c2', 'class_name': 'Robotics', 'start_time': '09:00', 'enrolled_count': 5}]
        flagged = [{'id': 'f', 'sub_status': 'flagged'}]
        with patch('services.sis_attendance_sweep_service.term_has_started', return_value=True), \
             patch.object(svc, 'taken_class_ids', return_value={'c2'}), \
             patch.object(svc, 'flagged', return_value=flagged):
            out = svc.teachers_to_check(ORG, datetime(2026, 9, 22, 9, 30), schedule,
                                        {'roll_check_minutes': 20}, {})
        assert out['grace_minutes'] == 20
        assert [m['class_id'] for m in out['no_roll']] == ['c1']
        assert out['flagged'] == flagged

    def test_nothing_is_late_before_term_starts(self):
        schedule = [{'class_id': 'c1', 'start_time': '09:00', 'enrolled_count': 5}]
        with patch('services.sis_attendance_sweep_service.term_has_started', return_value=False), \
             patch.object(svc, 'flagged', return_value=[]):
            out = svc.teachers_to_check(ORG, datetime(2026, 8, 10, 12, 0), schedule, {}, {})
        assert out['no_roll'] == []


# ── The reminder goes to the planned substitute ──────────────────────────────

class _TableRouter:
    def __init__(self, rows_by_table):
        self._rows = rows_by_table

    def table(self, name):
        q = Mock()
        for chained in ('select', 'eq', 'in_', 'limit', 'order', 'neq'):
            getattr(q, chained).return_value = q
        q.execute.return_value = Mock(data=list(self._rows.get(name, [])))
        return q


@pytest.mark.unit
class TestSweepReminder:
    def test_the_planned_substitute_is_reminded_with_a_link_to_the_class(self):
        from services import sis_attendance_sweep_service as sweep
        router = _TableRouter({
            'school_enrollments': [],
            'org_classes': [{'id': 'c1', 'name': 'Pottery', 'primary_instructor_id': 't1'}],
            'class_meetings': [{'class_id': 'c1', 'day_of_week': 2, 'specific_date': None,
                                'start_time': '10:00'}],
            'class_enrollments': [],
            'sis_attendance': [],
            'sis_attendance_alerts': [],
            'users': [],
            'class_advisors': [],
        })
        sent = []
        now = Mock()
        now.date.return_value = date(2026, 9, 22)
        now.hour, now.minute = 10, 2
        with patch.object(sweep, 'term_has_started', return_value=True), \
             patch.object(sweep, 'org_settings', return_value={
                 'timezone': 'America/Denver', 'school_start_hour': 0,
                 'school_end_hour': 23, 'first_day_of_school': None}), \
             patch.object(sweep, 'org_now', return_value=now), \
             patch.object(sweep, '_admin', return_value=router), \
             patch.object(sweep, 'fetch_all_rows', side_effect=lambda build: build().execute().data), \
             patch.object(svc, 'planned_subs_for_date', return_value={'c1': {'sub'}}), \
             patch.object(sweep.sis_notifications, 'notify',
                          side_effect=lambda uid, title, body, **kw: sent.append((uid, kw.get('link')))):
            counts = sweep._sweep_org(ORG)
        assert counts['class_reminders'] == 1
        assert ('t1', '/classes?tab=attendance') in sent
        assert ('sub', '/my-classes/c1') in sent


# ── The student_day notes fix ────────────────────────────────────────────────

@pytest.mark.unit
class TestStudentDayNote:
    def test_the_teachers_note_comes_back(self):
        """student_day read rec.get('notes'), but the column is `note`, so every
        class's note came back empty."""
        from services import sis_attendance_service as att
        rows = {
            'users': [{'id': 's1', 'first_name': 'Jane'}],
            'class_enrollments': [{'class_id': 'c1'}],
            'org_classes': [{'id': 'c1', 'name': 'Pottery'}],
            'class_meetings': [{'class_id': 'c1', 'day_of_week': 2, 'specific_date': None,
                                'start_time': '09:00', 'end_time': '10:00'}],
            'sis_attendance': [{'class_id': 'c1', 'status': 'late', 'note': 'Bus was late'}],
            'student_planned_absences': [],
        }
        with patch.object(att, '_admin', return_value=_TableRouter(rows)):
            day = att.student_day(ORG, 's1', DAY)
        assert day['classes'][0]['notes'] == 'Bus was late'


# ── Both dashboards carry it ─────────────────────────────────────────────────

@pytest.mark.unit
class TestDashboards:
    SESSION = {'id': 's1', 'class_id': 'c1', 'taken_by': 't1', 'taken_by_name': 'Ms. R'}
    CHECK = {'grace_minutes': 15, 'no_roll': [], 'flagged': [{'id': 'f'}], 'resolutions': []}

    def test_the_admin_dashboard_shows_the_same_section_and_roll_lines(self):
        from tests.test_sis_admin_dashboard import _run, dash
        overrides = {
            'schedule': patch.object(dash.coordinator, 'today_schedule',
                                     side_effect=lambda *a, **k: [{'class_id': 'c1'}, {'class_id': 'c2'}]),
            'sessions': patch.object(dash.sessions, 'sessions_by_class',
                                     return_value={'c1': self.SESSION}),
            'check': patch.object(dash.sessions, 'teachers_to_check', return_value=self.CHECK),
        }
        payload = _run(overrides=overrides)
        assert payload['today']['teachers_to_check'] == self.CHECK
        rolls = {m['class_id']: m['roll'] for m in payload['today']['schedule']}
        assert rolls == {'c1': self.SESSION, 'c2': None}

    def test_a_hidden_attendance_module_leaves_it_out(self):
        from tests.test_sis_admin_dashboard import _run
        payload = _run(settings={'hidden_modules': ['attendance']})
        assert 'teachers_to_check' not in payload['today']

    def test_the_coordinator_dashboard_carries_it_too(self):
        from services import sis_coordinator_service as coord
        router = _TableRouter({'sis_attendance': [], 'student_planned_absences': [],
                               'organizations': [{'name': 'iCreate', 'feature_flags': {}}]})
        with patch.object(coord, '_admin', return_value=router), \
             patch.object(coord, '_org_now', return_value=datetime(2026, 9, 22, 10, 0)), \
             patch.object(coord.attendance, 'open_alerts', return_value=[]), \
             patch.object(coord.sis_service, 'caller_org_roles', return_value=['campus_coordinator']), \
             patch.object(coord, 'staff_resources_for', return_value=[]), \
             patch.object(coord, 'pinned_links_for', return_value=[]), \
             patch.object(coord, 'list_assignments', return_value=[]), \
             patch.object(coord, '_my_open_tasks', return_value=[]), \
             patch.object(coord, 'today_schedule', return_value=[{'class_id': 'c1'}]), \
             patch.object(coord.sessions, 'sessions_by_class', return_value={'c1': self.SESSION}), \
             patch.object(coord.sessions, 'teachers_to_check', return_value=self.CHECK):
            out = coord.get_dashboard(ORG, 'kate')
        assert out['teachers_to_check'] == self.CHECK
        assert out['today_schedule'][0]['roll'] == self.SESSION
