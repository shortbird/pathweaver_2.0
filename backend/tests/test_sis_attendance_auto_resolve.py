"""
Ticket 05ccd3b9 (iCreate, Kate, campus coordinator):

    "When I resolve absences, some students are showing up as absent after a
    teacher marked them late/present or sometimes a late excuse from a parent.
    If those could automatically resolve when parents or teachers change it so
    I don't have to click on their name to find out, that would be great!"

An 'unaccounted' alert is per student per DAY. It now closes itself (status
'resolved', resolution 'other', a note saying why, resolved_by NULL) when
nothing on the record still says the student is missing:

- a teacher moves the mark off 'absent' and no other class that day still has
  an uncovered 'absent' mark, or
- a parent reports the absence for that day.

No migration: the CHECK on `resolution` has no automatic value, so 'other'
plus the note carries it (owner decision, 2026-10-12).
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_attendance_service as att
from services import sis_planned_absence_service as planned


ORG = 'org-1'
DAY = '2026-10-12'
OPEN_ALERT = {'id': 'a1', 'organization_id': ORG, 'student_user_id': 's1',
              'date': DAY, 'alert_type': 'unaccounted', 'status': 'open',
              'class_id': 'c1'}


class _FakeDB:
    """A Supabase client over in-memory rows that honours eq/in_ filters, so
    'the alert is open' and 'the roll still says absent' are real questions
    rather than scripted answers. Updates are applied and recorded."""

    def __init__(self, rows_by_table, fail_tables=()):
        self.rows = {k: [dict(r) for r in v] for k, v in rows_by_table.items()}
        self.fail_tables = set(fail_tables)
        self.updates = []  # (table, fields, matched rows)
        self.upserts = []

    def table(self, name):
        if name in self.fail_tables:
            raise RuntimeError(f'{name} is down')
        return _Query(self, name)


class _Query:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self.filters = []
        self._update = None
        self._upsert = None
        self._insert = None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filters.append(lambda r, c=col, v=val: r.get(c) == v)
        return self

    def in_(self, col, vals):
        self.filters.append(lambda r, c=col, v=tuple(vals): r.get(c) in v)
        return self

    def or_(self, *_a, **_k):
        return self

    def limit(self, *_a):
        return self

    def order(self, *_a, **_k):
        return self

    def update(self, fields):
        self._update = fields
        return self

    def upsert(self, payloads, **_k):
        self._upsert = payloads
        return self

    def insert(self, payload):
        self._insert = payload
        return self

    def execute(self):
        if self._insert is not None:
            row = dict(self._insert, id=f'{self.name}-{len(self.db.rows.get(self.name, []))}')
            self.db.rows.setdefault(self.name, []).append(row)
            return Mock(data=[dict(row)])
        if self._upsert is not None:
            self.db.upserts.append((self.name, self._upsert))
            if self.name == 'sis_attendance':
                # The roll's upsert lands the way the database would apply it,
                # so the auto-resolve check after it reads the new mark.
                rows = self.db.rows.setdefault(self.name, [])
                for p in self._upsert:
                    key = (p['class_id'], p['student_user_id'], p['date'])
                    hit = [r for r in rows
                           if (r.get('class_id'), r.get('student_user_id'), r.get('date')) == key]
                    if hit:
                        hit[0].update(p)
                    else:
                        rows.append(dict(p))
            return Mock(data=self._upsert)
        matched = [r for r in self.db.rows.get(self.name, [])
                   if all(f(r) for f in self.filters)]
        if self._update is not None:
            for r in matched:
                r.update(self._update)
            self.db.updates.append((self.name, self._update, [dict(r) for r in matched]))
        return Mock(data=[dict(r) for r in matched])


def _alert_updates(db):
    return [u for u in db.updates if u[0] == 'sis_attendance_alerts']


def _record(db, entries, class_id='c1', optional=()):
    """record() with the side systems (sessions, guardian lookup, notifications)
    stubbed; the alert table and the roll are the fake DB."""
    with patch.object(att, '_admin', return_value=db), \
         patch.object(att, 'optional_class_ids', side_effect=lambda ids: set(optional) & set(ids)), \
         patch('services.sis_class_session_service.record_roll'), \
         patch('services.sis_planned_absence_service.for_class_date', return_value={}), \
         patch.object(att, '_notify_admins_of_absences',
                      side_effect=lambda o, c, d, ids: len(ids)):
        return att.record(ORG, class_id, DAY, entries, recorded_by='t1')


@pytest.mark.unit
class TestTeacherChangesTheMark:
    def test_absent_to_late_closes_the_alert(self):
        """Kate: "showing up as absent after a teacher marked them late". The
        teacher's correction must close the alert without her clicking it."""
        db = _FakeDB({
            'sis_attendance': [{'organization_id': ORG, 'class_id': 'c1',
                                'student_user_id': 's1', 'date': DAY, 'status': 'absent'}],
            'sis_attendance_alerts': [dict(OPEN_ALERT)],
            'student_planned_absences': [],
        })
        result = _record(db, [{'student_user_id': 's1', 'status': 'late'}])

        assert result['alerts_auto_resolved'] == 1
        [(_t, fields, matched)] = _alert_updates(db)
        assert fields['status'] == 'resolved'
        assert fields['resolution'] == 'other'
        assert fields['resolution_note'] == 'Teacher changed the mark'
        assert fields['resolved_by'] is None
        assert fields['resolved_at']
        assert [m['id'] for m in matched] == ['a1']

    def test_still_absent_in_another_class_keeps_it_open(self):
        """The alert is per day. Late to pottery but still absent from
        robotics is still a student nobody has found."""
        db = _FakeDB({
            'sis_attendance': [
                {'organization_id': ORG, 'class_id': 'c1', 'student_user_id': 's1',
                 'date': DAY, 'status': 'late'},       # already corrected
                {'organization_id': ORG, 'class_id': 'c2', 'student_user_id': 's1',
                 'date': DAY, 'status': 'absent'},
            ],
            'sis_attendance_alerts': [dict(OPEN_ALERT)],
            'student_planned_absences': [],
        })
        with patch('services.sis_attendance_service.optional_class_ids', return_value=set()):
            closed = att.auto_resolve_if_accounted(ORG, 's1', DAY, att.AUTO_NOTE_TEACHER, client=db)
        assert closed is False
        assert _alert_updates(db) == []
        assert db.rows['sis_attendance_alerts'][0]['status'] == 'open'

    def test_absent_only_in_a_class_that_takes_no_roll_still_closes(self):
        """An absent mark in an attendance-optional class (29dff954) is not a
        missing student, so it does not hold the alert open."""
        db = _FakeDB({
            'sis_attendance': [{'organization_id': ORG, 'class_id': 'home', 'student_user_id': 's1',
                                'date': DAY, 'status': 'absent'}],
            'sis_attendance_alerts': [dict(OPEN_ALERT)],
            'student_planned_absences': [],
        })
        with patch('services.sis_attendance_service.optional_class_ids', return_value={'home'}):
            assert att.auto_resolve_if_accounted(ORG, 's1', DAY, att.AUTO_NOTE_TEACHER, client=db)

    def test_an_already_resolved_alert_is_untouched(self):
        """A coordinator's own answer ("absent without notice") must never be
        overwritten by the automatic one."""
        resolved = dict(OPEN_ALERT, status='resolved', resolution='absent_no_notice',
                        resolved_by='cc1')
        db = _FakeDB({
            'sis_attendance': [{'organization_id': ORG, 'class_id': 'c1', 'student_user_id': 's1',
                                'date': DAY, 'status': 'present'}],
            'sis_attendance_alerts': [resolved],
            'student_planned_absences': [],
        })
        assert att.auto_resolve_if_accounted(ORG, 's1', DAY, att.AUTO_NOTE_TEACHER, client=db) is False
        assert _alert_updates(db) == []
        assert db.rows['sis_attendance_alerts'][0]['resolution'] == 'absent_no_notice'
        assert db.rows['sis_attendance_alerts'][0]['resolved_by'] == 'cc1'

    def test_an_absent_mark_still_opens_an_alert(self):
        """The original rule is unchanged: a new, unreported absent mark
        raises the alert and tells the office."""
        db = _FakeDB({'sis_attendance': [], 'sis_attendance_alerts': [],
                      'student_planned_absences': []})
        result = _record(db, [{'student_user_id': 's1', 'status': 'absent'}])
        assert result['absences_flagged'] == 1
        assert result['admins_notified'] == 1
        assert result['alerts_auto_resolved'] == 0
        [(table, rows)] = [u for u in db.upserts if u[0] == 'sis_attendance_alerts']
        assert rows[0]['student_user_id'] == 's1' and rows[0]['status'] == 'open'
        assert _alert_updates(db) == []

    def test_a_present_mark_with_no_prior_absence_costs_no_alert_read(self):
        """Only a mark that moved OFF 'absent' can change the day's answer;
        an ordinary roster save does not look at alerts at all."""
        db = _FakeDB({'sis_attendance': [], 'sis_attendance_alerts': [dict(OPEN_ALERT)],
                      'student_planned_absences': []})
        with patch.object(att, 'auto_resolve_if_accounted') as helper:
            _record(db, [{'student_user_id': 's1', 'status': 'present'}])
        helper.assert_not_called()

    def test_an_auto_resolve_failure_never_fails_the_roll(self):
        db = _FakeDB({'sis_attendance': [{'organization_id': ORG, 'class_id': 'c1',
                                          'student_user_id': 's1', 'date': DAY,
                                          'status': 'absent'}],
                      'sis_attendance_alerts': [dict(OPEN_ALERT)],
                      'student_planned_absences': []})
        with patch.object(att, 'auto_resolve_if_accounted', side_effect=RuntimeError('boom')):
            result = _record(db, [{'student_user_id': 's1', 'status': 'present'}])
        assert result['count'] == 1
        assert result['alerts_auto_resolved'] == 0


@pytest.mark.unit
class TestParentReportsTheAbsence:
    def _create(self, db, class_id=None, end_date=None):
        from datetime import date
        with patch.object(planned, '_admin', return_value=db), \
             patch.object(planned, '_today', return_value=date(2026, 10, 12)), \
             patch.object(planned, '_notify_admins_of_report'), \
             patch('services.sis_attendance_service.optional_class_ids', return_value=set()):
            return planned.create(ORG, 's1', reported_by='g1', absence_date=DAY,
                                  class_id=class_id, end_date=end_date)

    def test_a_parent_report_for_the_day_closes_the_alert(self):
        """Kate: "sometimes a late excuse from a parent" — the parent's report
        is the answer, so the alert closes itself."""
        db = _FakeDB({
            'sis_attendance': [{'organization_id': ORG, 'class_id': 'c1', 'student_user_id': 's1',
                                'date': DAY, 'status': 'absent'}],
            'sis_attendance_alerts': [dict(OPEN_ALERT)],
            'student_planned_absences': [],
        })
        result = self._create(db)
        assert not result.get('error')
        [(_t, fields, matched)] = _alert_updates(db)
        assert fields['resolution'] == 'other'
        assert fields['resolution_note'] == 'Parent reported the absence'
        assert fields['resolved_by'] is None
        assert [m['id'] for m in matched] == ['a1']

    def test_a_class_report_does_not_cover_another_absent_class(self):
        """A report for pottery says nothing about robotics; the student is
        still unaccounted for there."""
        db = _FakeDB({
            'org_classes': [{'id': 'c1', 'organization_id': ORG}],
            'sis_attendance': [
                {'organization_id': ORG, 'class_id': 'c1', 'student_user_id': 's1',
                 'date': DAY, 'status': 'absent'},
                {'organization_id': ORG, 'class_id': 'c2', 'student_user_id': 's1',
                 'date': DAY, 'status': 'absent'},
            ],
            'sis_attendance_alerts': [dict(OPEN_ALERT)],
            'student_planned_absences': [],
        })
        result = self._create(db, class_id='c1')
        assert not result.get('error')
        assert _alert_updates(db) == []

    def test_a_failure_never_fails_the_parents_report(self):
        """Best effort: the report is saved and the office is told even if
        the alert table cannot be reached."""
        db = _FakeDB({'student_planned_absences': []}, fail_tables={'sis_attendance_alerts'})
        with patch.object(planned.logger, 'warning') as warn:
            result = self._create(db)
        assert not result.get('error')
        assert result['absences']
        warn.assert_called()

