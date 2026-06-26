"""
Unit tests for the pure SIS attendance-sweep rules (check-in reminders + gaps).
No DB, no timezone. 2026-06-29 is a Monday (python weekday()==0 -> our day 1).
"""

from datetime import date

from services import sis_attendance_sweep as sweep

MON = date(2026, 6, 29)   # Monday  -> our day_of_week 1
TUE = date(2026, 6, 30)   # Tuesday -> our day_of_week 2


class TestMeetingIsToday:
    def test_recurring_weekday_match(self):
        assert sweep.meeting_is_today({'day_of_week': 1}, MON) is True
        assert sweep.meeting_is_today({'day_of_week': 2}, MON) is False

    def test_one_off_date(self):
        assert sweep.meeting_is_today({'specific_date': '2026-06-29'}, MON) is True
        assert sweep.meeting_is_today({'specific_date': '2026-06-30'}, MON) is False


class TestFirstStart:
    def test_earliest_today(self):
        meetings = [
            {'day_of_week': 1, 'start_time': '11:00'},
            {'day_of_week': 1, 'start_time': '09:30'},
            {'day_of_week': 2, 'start_time': '08:00'},   # not today
        ]
        assert sweep.first_start_minutes_today(meetings, MON) == 9 * 60 + 30

    def test_none_today(self):
        assert sweep.first_start_minutes_today([{'day_of_week': 2, 'start_time': '08:00'}], MON) is None


class TestCheckinReminderDue:
    def test_due_after_grace(self):
        # first class 09:30 (570), grace 15 -> due at >= 585. now 590.
        assert sweep.checkin_reminder_due(now_minutes=590, first_start_minutes=570,
                                          grace_minutes=15, has_checkin_or_absence=False) is True

    def test_not_due_before_grace(self):
        assert sweep.checkin_reminder_due(now_minutes=580, first_start_minutes=570,
                                          grace_minutes=15, has_checkin_or_absence=False) is False

    def test_not_due_if_checked_in(self):
        assert sweep.checkin_reminder_due(now_minutes=600, first_start_minutes=570,
                                          grace_minutes=15, has_checkin_or_absence=True) is False

    def test_not_due_if_no_class(self):
        assert sweep.checkin_reminder_due(now_minutes=600, first_start_minutes=None,
                                          grace_minutes=15, has_checkin_or_absence=False) is False


class TestDetectGap:
    def _rows(self):
        return [
            {'class_id': 'a', 'class_name': 'Math', 'start_minutes': 9 * 60, 'status': 'present'},
            {'class_id': 'b', 'class_name': 'Art', 'start_minutes': 11 * 60, 'status': 'absent'},
        ]

    def test_gap_when_present_then_absent_and_started(self):
        gap = sweep.detect_attendance_gap(self._rows(), now_minutes=11 * 60 + 5)
        assert gap and gap['class_id'] == 'b'

    def test_no_gap_if_later_class_not_started(self):
        assert sweep.detect_attendance_gap(self._rows(), now_minutes=10 * 60) is None

    def test_no_gap_if_no_earlier_present(self):
        rows = [
            {'class_id': 'a', 'start_minutes': 9 * 60, 'status': 'absent'},
            {'class_id': 'b', 'start_minutes': 11 * 60, 'status': 'absent'},
        ]
        assert sweep.detect_attendance_gap(rows, now_minutes=12 * 60) is None

    def test_no_gap_if_later_present(self):
        rows = [
            {'class_id': 'a', 'start_minutes': 9 * 60, 'status': 'present'},
            {'class_id': 'b', 'start_minutes': 11 * 60, 'status': 'present'},
        ]
        assert sweep.detect_attendance_gap(rows, now_minutes=12 * 60) is None

    def test_unordered_input_still_detected(self):
        rows = [
            {'class_id': 'b', 'start_minutes': 11 * 60, 'status': 'absent'},
            {'class_id': 'a', 'start_minutes': 9 * 60, 'status': 'late'},  # late counts as present
        ]
        gap = sweep.detect_attendance_gap(rows, now_minutes=11 * 60 + 30)
        assert gap and gap['class_id'] == 'b'
