"""
The daily roll: one whole-school attendance mark per student per day.

Ticket 0680d03c (Apogee Cache Valley): "schoolwide daily attendance for
teachers. Present / Absent (comment box for reason, no 'Sick') / Picked Up.
Present on arrival in the morning, Picked Up when they leave, pickup time
recorded automatically. School days Mon-Thu." Apogee hides the classes module,
so the class roll could not answer it.

Built generic (tickets skill 2b): rows in sis_attendance with class_id NULL,
switched on per org by sis_settings.attendance.daily_roll. The defaults are how
every school worked before (no daily roll, no check-out, all four statuses,
Mon-Fri), and the class roll path is pinned unchanged below -- iCreate,
Gryffin and Horizon take ~5k class rolls on it.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import sis_attendance_service as att


# ── A small in-memory PostgREST stand-in ─────────────────────────────────────
class _Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters = db, table, []
        self.op, self.payload, self.on_conflict, self._limit = 'select', None, None, None

    # filters
    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filters.append(lambda r: r.get(col) == val)
        return self

    def is_(self, col, val):
        assert val == 'null'
        self.filters.append(lambda r: r.get(col) is None)
        return self

    def in_(self, col, vals):
        vals = list(vals)
        self.filters.append(lambda r: r.get(col) in vals)
        return self

    def or_(self, *_a):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, a, b):
        return self

    def limit(self, n):
        self._limit = n
        return self

    # writes
    def upsert(self, payload, on_conflict=None, **_k):
        self.op, self.payload, self.on_conflict = 'upsert', payload, on_conflict
        return self

    def update(self, fields):
        self.op, self.payload = 'update', fields
        return self

    def _match(self):
        return [r for r in self.db.rows(self.table) if all(f(r) for f in self.filters)]

    def execute(self):
        self.db.calls.append((self.table, self.op, self.payload, self.on_conflict))
        if self.op == 'upsert':
            out = []
            keys = [k.strip() for k in (self.on_conflict or 'id').split(',')]
            for p in (self.payload if isinstance(self.payload, list) else [self.payload]):
                existing = next((r for r in self.db.rows(self.table)
                                 if all(r.get(k) == p.get(k) for k in keys)), None)
                if existing is not None:
                    existing.update(p)
                    out.append(dict(existing))
                else:
                    row = {'id': f'row-{len(self.db.rows(self.table)) + 1}', **p}
                    self.db.rows(self.table).append(row)
                    out.append(dict(row))
            return Mock(data=out)
        if self.op == 'update':
            hit = self._match()
            for r in hit:
                r.update(self.payload)
            return Mock(data=[dict(r) for r in hit])
        rows = [dict(r) for r in self._match()]
        return Mock(data=rows[:self._limit] if self._limit else rows)


class _DB:
    def __init__(self, **tables):
        self.tables = {k: list(v) for k, v in tables.items()}
        self.calls = []

    def rows(self, table):
        return self.tables.setdefault(table, [])

    def table(self, name):
        return _Query(self, name)


ORG = 'org-1'
DAY = '2026-10-13'
STUDENTS = [{'id': 's1', 'first_name': 'Ada', 'last_name': 'Ant', 'date_of_birth': None},
            {'id': 's2', 'first_name': 'Bo', 'last_name': 'Bee', 'date_of_birth': None}]


@contextmanager
def _service(db, students=STUDENTS, whole_day=None, student_days=None):
    # The org's stored settings, read when a caller does not pass the
    # per-student days map (54b29e8a). Default: no map, how every school worked.
    stored = {**att.default_attendance_settings(), 'student_days': dict(student_days or {})}
    with patch.object(att, '_admin', return_value=db), \
         patch.object(att, 'attendance_settings', return_value=stored), \
         patch('services.sis_service.current_students', return_value=students), \
         patch('services.sis_age.ages_for', return_value=lambda _dob: None), \
         patch('services.sis_planned_absence_service.for_whole_day',
               return_value=whole_day or {}), \
         patch.object(att, '_notify_admins_of_absences', return_value=0) as notify:
        yield notify


def _daily(db, sid):
    return next(r for r in db.rows('sis_attendance')
                if r['student_user_id'] == sid and r.get('class_id') is None)


# ── Settings ─────────────────────────────────────────────────────────────────
@pytest.mark.unit
class TestSettings:
    def test_defaults_are_how_every_school_worked_before(self):
        assert att.attendance_settings({'feature_flags': {}}) == {
            'daily_roll': False, 'checkout': False,
            'statuses': ['present', 'absent', 'late', 'excused'],
            'school_days': [1, 2, 3, 4, 5],
            # 54b29e8a: no per-student days = everyone attends every school day.
            'student_days': {},
        }

    def test_a_stored_value_wins_over_the_default(self):
        org = {'feature_flags': {'sis_settings': {'attendance': {
            'daily_roll': True, 'checkout': True,
            'statuses': ['absent', 'present'], 'school_days': [4, 1, 2, 3]}}}}
        s = att.attendance_settings(org)
        assert s == {'daily_roll': True, 'checkout': True,
                     'statuses': ['present', 'absent'], 'school_days': [1, 2, 3, 4],
                     'student_days': {}}

    def test_an_unreadable_key_reads_as_its_default(self):
        s = att.parse_attendance_settings({'daily_roll': 'yes', 'statuses': ['late'],
                                           'school_days': [0, 9]})
        assert s == att.default_attendance_settings()

    @pytest.mark.parametrize('bad', [
        {'daily_roll': 'on'},
        {'statuses': ['present']},                 # absent is required
        {'statuses': ['present', 'absent', 'sick']},  # no "Sick"
        {'school_days': []},
        {'school_days': [0]},
        'nope',
    ])
    def test_the_patch_refuses_a_bad_value(self, bad):
        cleaned, problem = att.clean_attendance_settings(bad)
        assert cleaned is None and problem

    def test_the_patch_cleans_a_good_value(self):
        cleaned, problem = att.clean_attendance_settings(
            {'daily_roll': True, 'checkout': False, 'statuses': ['absent', 'present'],
             'school_days': [4, 3, 2, 1, 1], 'extra': 'dropped'})
        assert problem is None
        assert cleaned == {'daily_roll': True, 'checkout': False,
                           'statuses': ['present', 'absent'], 'school_days': [1, 2, 3, 4]}


# ── record_daily / check-out ─────────────────────────────────────────────────
@pytest.mark.unit
class TestRecordDaily:
    def test_present_writes_a_null_class_row_and_stamps_arrival(self):
        db = _DB()
        with _service(db), patch.object(att, '_now', return_value='2026-10-13T08:05:00Z'):
            result = att.record_daily(ORG, DAY, [{'student_user_id': 's1', 'status': 'present'}], 'coach')
        assert result['count'] == 1
        row = _daily(db, 's1')
        assert row['class_id'] is None
        assert row['arrived_at'] == '2026-10-13T08:05:00Z'
        assert row['departed_at'] is None
        upsert = next(c for c in db.calls if c[1] == 'upsert')
        assert upsert[3] == 'class_id,student_user_id,date'

    def test_arrival_is_kept_on_a_second_present_tap(self):
        db = _DB(sis_attendance=[{'id': 'r1', 'organization_id': ORG, 'class_id': None,
                                  'student_user_id': 's1', 'date': DAY, 'status': 'present',
                                  'arrived_at': '2026-10-13T08:05:00Z', 'departed_at': None}])
        with _service(db), patch.object(att, '_now', return_value='2026-10-13T10:00:00Z'):
            att.record_daily(ORG, DAY, [{'student_user_id': 's1', 'status': 'late'}], 'coach')
        assert _daily(db, 's1')['arrived_at'] == '2026-10-13T08:05:00Z'
        assert len(db.rows('sis_attendance')) == 1  # one daily row per student per date

    def test_absent_keeps_the_reason_and_clears_the_times(self):
        db = _DB(sis_attendance=[{'id': 'r1', 'organization_id': ORG, 'class_id': None,
                                  'student_user_id': 's1', 'date': DAY, 'status': 'present',
                                  'arrived_at': 'a', 'departed_at': 'd', 'departed_by': 'coach'}])
        with _service(db):
            att.record_daily(ORG, DAY, [{'student_user_id': 's1', 'status': 'absent',
                                         'note': '  Dentist  '}], 'coach')
        row = _daily(db, 's1')
        assert row['status'] == 'absent' and row['note'] == 'Dentist'
        assert row['arrived_at'] is None and row['departed_at'] is None and row['departed_by'] is None

    def test_a_status_the_school_turned_off_is_not_written(self):
        db = _DB()
        with _service(db):
            result = att.record_daily(ORG, DAY, [{'student_user_id': 's1', 'status': 'late'}],
                                      'coach', statuses=['present', 'absent'])
        assert result['count'] == 0
        assert db.rows('sis_attendance') == []

    def test_a_student_from_outside_the_school_is_refused(self):
        db = _DB()
        with _service(db):
            result = att.record_daily(ORG, DAY, [{'student_user_id': 'stranger', 'status': 'present'}], 'coach')
        assert result['refused'] == ['stranger']
        assert db.rows('sis_attendance') == []

    def test_an_unreported_absence_raises_one_daily_alert(self):
        db = _DB()
        with _service(db) as notify:
            result = att.record_daily(ORG, DAY, [{'student_user_id': 's1', 'status': 'absent'},
                                                 {'student_user_id': 's2', 'status': 'absent'}],
                                      'coach')
        assert result['absences_flagged'] == 2
        alerts = db.rows('sis_attendance_alerts')
        assert {a['student_user_id'] for a in alerts} == {'s1', 's2'}
        assert all(a['class_id'] is None for a in alerts)
        notify.assert_called_once_with(ORG, None, DAY, ['s1', 's2'])

    def test_a_whole_day_guardian_report_raises_no_alert(self):
        db = _DB()
        with _service(db, whole_day={'s1': {'scope': 'day', 'reason': 'Trip'}}):
            result = att.record_daily(ORG, DAY, [{'student_user_id': 's1', 'status': 'absent'}], 'coach')
        assert result['absences_flagged'] == 0
        assert db.rows('sis_attendance_alerts') == []

    def test_an_absence_with_a_typed_reason_raises_no_alert(self):
        """Ticket 0680d03c (Apogee): "a comment box on Absent would let us note
        the reason." A reason from staff accounts for the child, like a
        guardian report does, so the office is not alerted."""
        db = _DB()
        with _service(db) as notify:
            result = att.record_daily(ORG, DAY, [{'student_user_id': 's1', 'status': 'absent',
                                                  'note': 'Sick'},
                                                 {'student_user_id': 's2', 'status': 'absent'}],
                                      'coach')
        assert result['absences_flagged'] == 1
        assert {a['student_user_id'] for a in db.rows('sis_attendance_alerts')} == {'s2'}
        notify.assert_called_once_with(ORG, None, DAY, ['s2'])

    def test_a_reason_typed_after_the_tap_closes_the_open_alert(self):
        db = _DB(sis_attendance=[{'id': 'r1', 'organization_id': ORG, 'class_id': None,
                                  'student_user_id': 's1', 'date': DAY, 'status': 'absent',
                                  'note': None}],
                 sis_attendance_alerts=[{'id': 'a1', 'organization_id': ORG, 'student_user_id': 's1',
                                         'date': DAY, 'alert_type': 'unaccounted', 'class_id': None,
                                         'status': 'open'}])
        with _service(db):
            result = att.record_daily(ORG, DAY, [{'student_user_id': 's1', 'status': 'absent',
                                                  'note': 'Sick'}], 'coach')
        assert result['alerts_auto_resolved'] == 1
        alert = db.rows('sis_attendance_alerts')[0]
        assert alert['status'] == 'resolved'
        assert alert['resolution_note'] == att.AUTO_NOTE_REASON

    def test_checkout_stamps_the_time_and_who(self):
        db = _DB(sis_attendance=[{'id': 'r1', 'organization_id': ORG, 'class_id': None,
                                  'student_user_id': 's1', 'date': DAY, 'status': 'present',
                                  'arrived_at': 'a', 'departed_at': None}])
        with patch.object(att, '_admin', return_value=db), \
             patch.object(att, '_now', return_value='2026-10-13T15:30:00Z'):
            result = att.checkout_daily(ORG, DAY, 's1', 'coach')
            assert result['record']['departed_at'] == '2026-10-13T15:30:00Z'
            assert result['record']['departed_by'] == 'coach'
            # A second tap keeps the first time.
            with patch.object(att, '_now', return_value='2026-10-13T16:00:00Z'):
                again = att.checkout_daily(ORG, DAY, 's1', 'other')
            assert again['record']['departed_at'] == '2026-10-13T15:30:00Z'
            undone = att.undo_checkout_daily(ORG, DAY, 's1', 'coach')
        assert undone['record']['departed_at'] is None
        assert undone['record']['departed_by'] is None
        assert _daily(db, 's1')['status'] == 'present'
        assert _daily(db, 's1')['arrived_at'] == 'a'

    def test_a_student_who_never_arrived_cannot_be_picked_up(self):
        db = _DB(sis_attendance=[{'id': 'r1', 'organization_id': ORG, 'class_id': None,
                                  'student_user_id': 's1', 'date': DAY, 'status': 'absent'}])
        with patch.object(att, '_admin', return_value=db):
            assert att.checkout_daily(ORG, DAY, 's1', 'coach')['error']
            assert att.checkout_daily(ORG, DAY, 's2', 'coach')['error']
        assert _daily(db, 's1').get('departed_at') is None

    def test_a_picked_up_row_counts_as_present_in_the_rate(self):
        s = att.summarize([{'status': 'present', 'departed_at': 'x'}, {'status': 'absent'}])
        assert s['counts']['present'] == 1 and s['attendance_rate'] == 0.5

    def test_get_daily_lists_every_student_with_their_mark(self):
        db = _DB(sis_attendance=[
            {'id': 'r1', 'organization_id': ORG, 'class_id': None, 'student_user_id': 's1',
             'date': DAY, 'status': 'present', 'arrived_at': 'a', 'departed_at': 'd', 'note': None},
            # A class row for the same student and date is not the daily mark.
            {'id': 'r2', 'organization_id': ORG, 'class_id': 'c1', 'student_user_id': 's2',
             'date': DAY, 'status': 'absent'},
        ])
        with _service(db, whole_day={'s2': {'scope': 'day', 'reason': 'Sick'}}):
            roster = att.get_daily(ORG, DAY)
        by = {r['student_user_id']: r for r in roster}
        assert by['s1']['status'] == 'present'
        assert by['s1']['arrived_at'] == 'a' and by['s1']['departed_at'] == 'd'
        assert by['s2']['status'] is None  # not marked on the daily roll
        assert by['s2']['planned_absence']['reason'] == 'Sick'
        assert by['s2']['arrived_at'] is None and by['s2']['departed_at'] is None


# ── The class roll is unchanged ──────────────────────────────────────────────
@pytest.mark.unit
class TestClassRollUnchanged:
    def test_record_writes_the_class_and_none_of_the_daily_columns(self):
        """record() is the class roll iCreate, Gryffin and Horizon use. Its
        payload is exactly the keys it had before the daily roll existed."""
        db = _DB()
        with patch.object(att, '_admin', return_value=db), \
             patch('services.sis_planned_absence_service.for_class_date', return_value={}), \
             patch('services.sis_class_session_service.record_roll'), \
             patch.object(att, '_notify_admins_of_absences', return_value=0), \
             patch.object(att, 'optional_class_ids', return_value=set()):
            att.record(ORG, 'c1', DAY, [{'student_user_id': 's1', 'status': 'present'}], 't1')
        upsert = next(c for c in db.calls if c[1] == 'upsert')
        assert upsert[3] == 'class_id,student_user_id,date'
        assert set(upsert[2][0]) == {'organization_id', 'class_id', 'student_user_id', 'date',
                                     'status', 'note', 'recorded_by', 'updated_at'}
        assert upsert[2][0]['class_id'] == 'c1'

    def test_get_for_date_never_reads_the_daily_row(self):
        db = _DB(sis_attendance=[
            {'id': 'r1', 'organization_id': ORG, 'class_id': None, 'student_user_id': 's1',
             'date': DAY, 'status': 'absent'},
        ], class_enrollments=[{'class_id': 'c1', 'student_id': 's1', 'status': 'active'}],
           users=[{'id': 's1', 'first_name': 'Ada', 'last_name': 'Ant'}])
        with patch.object(att, '_admin', return_value=db), \
             patch('services.sis_age.ages_for', return_value=lambda _dob: None), \
             patch('services.sis_planned_absence_service.for_class_date', return_value={}):
            roster = att.get_for_date(ORG, 'c1', DAY)
        assert roster[0]['status'] is None

    def test_student_day_reports_the_daily_mark_apart_from_the_classes(self):
        db = _DB(
            users=[{'id': 's1', 'first_name': 'Ada', 'last_name': 'Ant'}],
            sis_attendance=[{'id': 'r1', 'organization_id': ORG, 'class_id': None,
                             'student_user_id': 's1', 'date': DAY, 'status': 'present',
                             'arrived_at': 'a', 'departed_at': 'd', 'note': None}],
        )
        with patch.object(att, '_admin', return_value=db):
            day = att.student_day(ORG, 's1', DAY)
        assert day['classes'] == []  # no "Unknown class" row for the daily mark
        assert day['daily'] == {'status': 'present', 'note': None,
                                'arrived_at': 'a', 'departed_at': 'd'}
        assert day['not_taken'] == 0

    def test_student_day_daily_is_none_when_there_is_no_daily_mark(self):
        db = _DB(users=[{'id': 's1', 'first_name': 'Ada'}])
        with patch.object(att, '_admin', return_value=db):
            assert att.student_day(ORG, 's1', DAY)['daily'] is None

    def test_daily_report_names_the_daily_roll_and_its_reason(self):
        db = _DB(
            sis_attendance=[{'organization_id': ORG, 'class_id': None, 'student_user_id': 's1',
                             'date': DAY, 'status': 'absent', 'note': 'Dentist'}],
            users=[{'id': 's1', 'first_name': 'Ada', 'last_name': 'Ant'}],
        )
        with patch.object(att, '_admin', return_value=db), \
             patch.object(att, 'optional_class_ids', return_value=set()):
            rows = att.daily_report(ORG, DAY)
        assert rows == [{'student': 'Ada Ant', 'class': 'Daily roll', 'status': 'absent',
                         'excused': 'Unexcused', 'reason': 'Dentist'}]

    def test_resolving_a_daily_alert_corrects_the_daily_row_only(self):
        db = _DB(
            sis_attendance_alerts=[{'id': 'a1', 'organization_id': ORG, 'student_user_id': 's1',
                                    'date': DAY, 'class_id': None, 'status': 'open'}],
            sis_attendance=[
                {'id': 'r1', 'organization_id': ORG, 'class_id': None, 'student_user_id': 's1',
                 'date': DAY, 'status': 'absent'},
                {'id': 'r2', 'organization_id': ORG, 'class_id': 'c1', 'student_user_id': 's1',
                 'date': DAY, 'status': 'absent'},
            ])
        with patch.object(att, '_admin', return_value=db):
            att.resolve_alert(ORG, 'a1', 'mismarked', None, 'office')
        rows = {r['id']: r for r in db.rows('sis_attendance')}
        assert rows['r1']['status'] == 'present'
        assert rows['r2']['status'] == 'absent'


# ── Routes ───────────────────────────────────────────────────────────────────
def _caller(role, org_role=None):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'in_', 'single'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'id': 'test-user-123', 'role': role,
                                             'org_role': org_role, 'org_roles': [org_role] if org_role else None,
                                             'organization_id': ORG}])
    return client


ON = {'daily_roll': True, 'checkout': True, 'statuses': ['present', 'absent'],
      'school_days': [1, 2, 3, 4]}
OFF = att.default_attendance_settings()


@contextmanager
def _route(role='org_managed', org_role='advisor', settings=ON, today=DAY):
    with patch('database.get_supabase_admin_client', return_value=_caller(role, org_role)), \
         patch('utils.auth.org_scope.caller_can_access_user', return_value=True), \
         patch('services.sis_service.resolve_org_id', return_value=ORG), \
         patch('modules.gate.module_enabled', return_value=True), \
         patch('routes.sis.attendance.attendance.attendance_settings', return_value=settings), \
         patch('routes.sis.attendance._org_today', return_value=today):
        yield


@pytest.mark.unit
class TestDailyRoutes:
    def test_an_advisor_reads_the_daily_roll(self, client, auth_headers, mock_verify_token):
        roster = [{'student_user_id': 's1', 'name': 'Ada', 'status': None,
                   'arrived_at': None, 'departed_at': None}]
        with _route(), patch('routes.sis.attendance.attendance.get_daily', return_value=roster):
            resp = client.get(f'/api/sis/attendance/daily?date={DAY}&organization_id={ORG}',
                              headers=auth_headers)
        assert resp.status_code == 200, resp.get_json()
        body = resp.get_json()
        assert body['roster'][0]['departed_at'] is None
        assert body['settings']['statuses'] == ['present', 'absent']
        assert body['today'] == DAY

    def test_refused_when_the_daily_roll_is_off(self, client, auth_headers, mock_verify_token):
        with _route(settings=OFF), \
             patch('routes.sis.attendance.attendance.record_daily') as rec:
            got = client.get(f'/api/sis/attendance/daily?date={DAY}&organization_id={ORG}',
                             headers=auth_headers)
            posted = client.post('/api/sis/attendance/daily', headers=auth_headers,
                                 json={'date': DAY, 'organization_id': ORG,
                                       'entries': [{'student_user_id': 's1', 'status': 'present'}]})
        assert got.status_code == 404
        assert posted.status_code == 404
        rec.assert_not_called()

    @pytest.mark.parametrize('role', ['student', 'parent'])
    def test_refused_for_students_and_parents(self, role, client, auth_headers, mock_verify_token):
        with _route(role=role, org_role=None), \
             patch('routes.sis.attendance.attendance.record_daily') as rec:
            resp = client.post('/api/sis/attendance/daily', headers=auth_headers,
                               json={'date': DAY, 'organization_id': ORG,
                                     'entries': [{'student_user_id': 's1', 'status': 'present'}]})
        assert resp.status_code == 403
        rec.assert_not_called()

    def test_an_advisor_records_with_the_schools_statuses(self, client, auth_headers, mock_verify_token):
        with _route(), patch('routes.sis.attendance.attendance.record_daily',
                             return_value={'saved': [], 'count': 1}) as rec:
            resp = client.post('/api/sis/attendance/daily', headers=auth_headers,
                               json={'date': DAY, 'organization_id': ORG,
                                     'entries': [{'student_user_id': 's1', 'status': 'present'}]})
        assert resp.status_code == 200, resp.get_json()
        assert rec.call_args.kwargs['statuses'] == ['present', 'absent']
        assert rec.call_args.kwargs['recorded_by'] == 'test-user-123'

    def test_checkout_is_refused_when_checkout_is_off(self, client, auth_headers, mock_verify_token):
        with _route(settings={**ON, 'checkout': False}), \
             patch('routes.sis.attendance.attendance.checkout_daily') as co:
            resp = client.post(f'/api/sis/attendance/daily/s1/checkout?organization_id={ORG}',
                               headers=auth_headers, json={'date': DAY})
        assert resp.status_code == 404
        co.assert_not_called()

    def test_checkout_today_and_undo(self, client, auth_headers, mock_verify_token):
        with _route(), \
             patch('routes.sis.attendance.attendance.checkout_daily',
                   return_value={'record': {'departed_at': 'now'}}) as co, \
             patch('routes.sis.attendance.attendance.undo_checkout_daily',
                   return_value={'record': {'departed_at': None}}) as undo:
            done = client.post(f'/api/sis/attendance/daily/s1/checkout?organization_id={ORG}',
                               headers=auth_headers, json={'date': DAY})
            back = client.delete(f'/api/sis/attendance/daily/s1/checkout?date={DAY}&organization_id={ORG}',
                                 headers=auth_headers)
        assert done.status_code == 200 and json.loads(done.data)['record']['departed_at'] == 'now'
        assert back.status_code == 200 and json.loads(back.data)['record']['departed_at'] is None
        co.assert_called_once()
        undo.assert_called_once()

    def test_checkout_on_another_day_is_refused(self, client, auth_headers, mock_verify_token):
        with _route(today='2026-10-14'), \
             patch('routes.sis.attendance.attendance.checkout_daily') as co:
            resp = client.post(f'/api/sis/attendance/daily/s1/checkout?organization_id={ORG}',
                               headers=auth_headers, json={'date': DAY})
        assert resp.status_code == 400
        co.assert_not_called()


# ── The settings PATCH ───────────────────────────────────────────────────────
@pytest.mark.unit
class TestSettingsPatch:
    def _patch(self, client, auth_headers, body):
        repo = Mock()
        repo.find_by_id.return_value = {'id': ORG, 'feature_flags': {
            'sis_settings': {'rooms': [{'name': 'Kitchen'}]}}}
        repo.update_organization.side_effect = lambda org_id, data: {'id': org_id, **data}
        admin_row = {'id': 'molly', 'role': 'org_managed', 'org_role': 'org_admin',
                     'org_roles': ['org_admin'], 'is_org_admin': True, 'organization_id': ORG}
        caller = Mock()
        table = Mock()
        for chained in ('select', 'eq', 'limit', 'single', 'in_'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[admin_row])
        caller.table.return_value = table
        with patch('database.get_supabase_admin_client', return_value=caller), \
             patch('services.sis_service.get_user_org_context',
                   return_value={'role': 'org_admin', 'organization_id': ORG}), \
             patch('services.sis_service.resolve_org_id', return_value=ORG), \
             patch('services.sis_service.caller_sees_pay', return_value=True), \
             patch('modules.gate.module_enabled', return_value=True), \
             patch('repositories.organization_repository.OrganizationRepository', return_value=repo):
            resp = client.patch(f'/api/sis/settings?organization_id={ORG}',
                                headers=auth_headers, json=body)
        return resp, repo

    def test_a_good_value_is_stored_cleaned_and_nothing_else_moves(self, client, auth_headers, mock_verify_token):
        resp, repo = self._patch(client, auth_headers, {'sis_settings': {'attendance': {
            'daily_roll': True, 'checkout': True, 'statuses': ['absent', 'present'],
            'school_days': [4, 1, 2, 3]}}})
        assert resp.status_code == 200, resp.get_json()
        written = repo.update_organization.call_args[0][1]['feature_flags']['sis_settings']
        assert written['attendance'] == {'daily_roll': True, 'checkout': True,
                                         'statuses': ['present', 'absent'],
                                         'school_days': [1, 2, 3, 4]}
        assert written['rooms'] == [{'name': 'Kitchen'}]

    def test_a_bad_value_is_refused_and_nothing_is_written(self, client, auth_headers, mock_verify_token):
        resp, repo = self._patch(client, auth_headers, {'sis_settings': {'attendance': {
            'daily_roll': True, 'statuses': ['present', 'sick']}}})
        assert resp.status_code == 400
        assert resp.get_json()['fields'] == ['attendance']
        repo.update_organization.assert_not_called()


# ── Per-student attending days (ticket 54b29e8a) ─────────────────────────────
# Apogee Cache Valley (Mandie, org_admin): "Can you get rid of the 'not
# accounted for' option? I don't want to have to fill that out every day and
# we have a few students that only come 2 days per week." Stored in
# sis_settings.attendance.student_days = {student_id: [ISO weekdays]}. DAY
# (2026-10-13) is a Tuesday, ISO weekday 2.
MON_WED = [1, 3]


@pytest.mark.unit
class TestStudentDaysSettings:
    def test_a_school_with_no_map_has_every_student_on_every_school_day(self):
        s = att.parse_attendance_settings({'daily_roll': True})
        assert s['student_days'] == {}
        assert att.is_scheduled(s['student_days'], 's1', DAY) is True

    def test_a_stored_map_is_read_and_unreadable_entries_dropped(self):
        s = att.parse_attendance_settings({'student_days': {
            's1': [3, 1, 1],        # kept, sorted, deduped
            's2': [],               # empty: dropped (every school day)
            's3': [0, 8],           # out of range: dropped
            's4': 'mon',            # not a list: dropped
            '': [1],                # no id: dropped
        }})
        assert s['student_days'] == {'s1': [1, 3]}

    def test_the_patch_cleans_the_map_and_drops_unknown_values(self):
        cleaned, problem = att.clean_attendance_settings(
            {'school_days': [1, 2, 3, 4], 'student_days': {'s1': [3, 1], 's2': [9], 's3': True}})
        assert problem is None
        assert cleaned == {'school_days': [1, 2, 3, 4], 'student_days': {'s1': [1, 3]}}

    def test_the_patch_refuses_a_map_that_is_not_an_object(self):
        cleaned, problem = att.clean_attendance_settings({'student_days': ['s1']})
        assert cleaned is None and problem

    def test_an_empty_or_null_map_is_not_stored(self):
        for value in (None, {}, {'s1': []}):
            cleaned, problem = att.clean_attendance_settings({'student_days': value})
            assert problem is None and 'student_days' not in cleaned

    def test_is_scheduled_reads_the_students_own_weekdays(self):
        days = {'s1': MON_WED}
        assert att.is_scheduled(days, 's1', DAY) is False          # Tuesday
        assert att.is_scheduled(days, 's1', '2026-10-14') is True  # Wednesday
        assert att.is_scheduled(days, 's2', DAY) is True           # not in the map
        assert att.is_scheduled(days, 's1', 'not-a-date') is True  # in doubt: due


@pytest.mark.unit
class TestStudentDaysRoll:
    def test_get_daily_says_who_is_not_scheduled_today(self):
        db = _DB()
        with _service(db, student_days={'s1': MON_WED}):
            roster = att.get_daily(ORG, DAY)
        by = {r['student_user_id']: r for r in roster}
        assert by['s1']['scheduled'] is False and by['s1']['days'] == MON_WED
        assert by['s2']['scheduled'] is True and by['s2']['days'] is None

    def test_get_daily_uses_the_routes_copy_of_the_map(self):
        db = _DB()
        with _service(db):
            roster = att.get_daily(ORG, '2026-10-14', student_days={'s2': [2]})
        by = {r['student_user_id']: r for r in roster}
        assert by['s1']['scheduled'] is True
        assert by['s2']['scheduled'] is False

    def test_absent_on_a_day_the_student_is_not_scheduled_raises_no_alert(self):
        db = _DB()
        with _service(db, student_days={'s1': MON_WED}) as notify:
            result = att.record_daily(ORG, DAY, [{'student_user_id': 's1', 'status': 'absent'}], 'coach')
        assert result['count'] == 1           # the mark is still recorded
        assert _daily(db, 's1')['status'] == 'absent'
        assert result['absences_flagged'] == 0
        assert db.rows('sis_attendance_alerts') == []
        notify.assert_called_once_with(ORG, None, DAY, [])

    def test_a_scheduled_student_absent_with_no_reason_still_raises_the_alert(self):
        db = _DB()
        with _service(db) as notify:
            result = att.record_daily(ORG, '2026-10-14',
                                      [{'student_user_id': 's1', 'status': 'absent'},
                                       {'student_user_id': 's2', 'status': 'absent'}],
                                      'coach', student_days={'s1': MON_WED, 's2': [2]})
        # Wednesday: s1 is due, s2 (Tuesdays only) is not.
        assert result['absences_flagged'] == 1
        assert {a['student_user_id'] for a in db.rows('sis_attendance_alerts')} == {'s1'}
        notify.assert_called_once_with(ORG, None, '2026-10-14', ['s1'])

    def test_a_student_marked_present_on_an_off_day_is_still_recorded(self):
        db = _DB()
        with _service(db, student_days={'s1': MON_WED}):
            att.record_daily(ORG, DAY, [{'student_user_id': 's1', 'status': 'present'}], 'coach')
        assert _daily(db, 's1')['status'] == 'present'


@pytest.mark.unit
class TestStudentDaysSave:
    def _blob(self, days, stored=None, students=STUDENTS):
        settings = {**att.default_attendance_settings(), 'daily_roll': True,
                    'school_days': [1, 2, 3, 4], 'student_days': dict(stored or {})}
        with patch.object(att, '_stored_attendance', return_value=settings), \
             patch.object(att, 'daily_roster',
                          return_value=[{'student_user_id': u['id']} for u in students]):
            return att.student_days_blob(ORG, 's1', days)

    def test_setting_days_keeps_every_other_attendance_key(self):
        blob, problem = self._blob([3, 1], stored={'s2': [2]})
        assert problem is None
        assert blob == {'daily_roll': True, 'checkout': False,
                        'statuses': ['present', 'absent', 'late', 'excused'],
                        'school_days': [1, 2, 3, 4],
                        'student_days': {'s1': [1, 3], 's2': [2]}}

    @pytest.mark.parametrize('days', [None, [], [1, 2, 3, 4, 5, 6, 7]])
    def test_clearing_returns_the_student_to_every_school_day(self, days):
        blob, problem = self._blob(days, stored={'s1': MON_WED})
        assert problem is None
        assert 'student_days' not in blob

    def test_a_student_from_outside_the_school_is_refused(self):
        blob, problem = self._blob([1], students=[{'id': 's2'}])
        assert blob is None and problem

    def test_bad_days_are_refused(self):
        blob, problem = self._blob([0, 9])
        assert blob is None and problem

    def test_a_settings_save_without_the_map_keeps_the_stored_one(self):
        stored = {**att.default_attendance_settings(), 'student_days': {'s1': MON_WED}}
        with patch.object(att, '_stored_attendance', return_value=stored):
            kept = att.with_stored_student_days(ORG, {'daily_roll': True}, {'daily_roll': True})
            named = att.with_stored_student_days(ORG, {'daily_roll': True},
                                                 {'daily_roll': True, 'student_days': None})
        assert kept == {'daily_roll': True, 'student_days': {'s1': MON_WED}}
        assert named == {'daily_roll': True}


@pytest.mark.unit
class TestStudentDaysRoutes:
    def _put(self, client, auth_headers, body, org_role='org_admin', stored_days=None):
        repo = Mock()
        stored_attendance = {**ON, 'student_days': dict(stored_days or {})}
        repo.find_by_id.return_value = {'id': ORG, 'feature_flags': {
            'sis_settings': {'rooms': [{'name': 'Kitchen'}], 'attendance': stored_attendance}}}
        repo.update_organization.side_effect = lambda org_id, data: {'id': org_id, **data}
        parsed = att.parse_attendance_settings(stored_attendance)
        with _route(org_role=org_role, settings=parsed), \
             patch.object(att, 'daily_roster', return_value=[{'student_user_id': 's1'},
                                                             {'student_user_id': 's2'}]), \
             patch('services.sis_service.get_user_org_context',
                   return_value={'role': 'org_admin', 'organization_id': ORG}), \
             patch('services.sis_service.caller_sees_pay', return_value=True), \
             patch('repositories.organization_repository.OrganizationRepository', return_value=repo):
            resp = client.put(f'/api/sis/attendance/daily/s1/days?organization_id={ORG}',
                              headers=auth_headers, json=body)
        return resp, repo

    def test_an_admin_sets_a_students_days(self, client, auth_headers, mock_verify_token):
        resp, repo = self._put(client, auth_headers, {'days': [3, 1]}, stored_days={'s2': [2]})
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()['days'] == [1, 3]
        written = repo.update_organization.call_args[0][1]['feature_flags']['sis_settings']
        assert written['attendance']['student_days'] == {'s1': [1, 3], 's2': [2]}
        assert written['attendance']['school_days'] == [1, 2, 3, 4]
        assert written['attendance']['daily_roll'] is True
        assert written['rooms'] == [{'name': 'Kitchen'}]

    def test_null_clears_the_students_days(self, client, auth_headers, mock_verify_token):
        resp, repo = self._put(client, auth_headers, {'days': None}, stored_days={'s1': [1, 3]})
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()['days'] is None
        written = repo.update_organization.call_args[0][1]['feature_flags']['sis_settings']
        assert 'student_days' not in written['attendance']

    def test_an_advisor_cannot_change_a_schedule(self, client, auth_headers, mock_verify_token):
        resp, repo = self._put(client, auth_headers, {'days': [1]}, org_role='advisor')
        assert resp.status_code == 403
        repo.update_organization.assert_not_called()

    def test_the_roll_routes_pass_the_map_to_the_service(self, client, auth_headers, mock_verify_token):
        settings = {**att.parse_attendance_settings(ON), 'student_days': {'s1': [1, 3]}}
        with _route(settings=settings), \
             patch('routes.sis.attendance.attendance.get_daily', return_value=[]) as get, \
             patch('routes.sis.attendance.attendance.record_daily',
                   return_value={'saved': [], 'count': 0}) as rec:
            client.get(f'/api/sis/attendance/daily?date={DAY}&organization_id={ORG}', headers=auth_headers)
            client.post('/api/sis/attendance/daily', headers=auth_headers,
                        json={'date': DAY, 'organization_id': ORG,
                              'entries': [{'student_user_id': 's1', 'status': 'absent'}]})
        assert get.call_args.kwargs['student_days'] == {'s1': [1, 3]}
        assert rec.call_args.kwargs['student_days'] == {'s1': [1, 3]}


@pytest.mark.unit
class TestSettingsPatchKeepsStudentDays:
    """The Settings card sends only its four keys and the PATCH replaces the
    attendance object whole; the per-student days must survive that save."""

    _patch = TestSettingsPatch._patch

    def test_a_card_save_keeps_the_stored_student_days(self, client, auth_headers, mock_verify_token):
        stored = {**att.default_attendance_settings(), 'student_days': {'s1': [1, 3]}}
        with patch.object(att, '_stored_attendance', return_value=stored):
            resp, repo = self._patch(client, auth_headers, {'sis_settings': {'attendance': {
                'daily_roll': True, 'checkout': True, 'statuses': ['present', 'absent'],
                'school_days': [1, 2, 3, 4]}}})
        assert resp.status_code == 200, resp.get_json()
        written = repo.update_organization.call_args[0][1]['feature_flags']['sis_settings']
        assert written['attendance']['student_days'] == {'s1': [1, 3]}
        assert written['attendance']['school_days'] == [1, 2, 3, 4]
