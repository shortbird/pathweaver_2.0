"""
Unit tests for AttendanceService (iCreate SIS attendance).

Covers the "teacher marks absences" model and its notification rules:
  * A student becoming 'absent' notifies their parent(s).
  * A 'present' -> 'absent' change notifies parent(s) AND org admin(s).
  * Re-marking an already-absent student does nothing.
  * Marking present / excused never pings a parent.
Plus the start-of-class reminder fan-out to advisors.

Repositories and the notification service are mocked — pure business logic, no DB.
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock

import pytest

from services.attendance_service import AttendanceService
from services.base_service import ValidationError


CLASS_ID = 'cls-1'
ORG_ID = 'org-1'
MARKED_BY = 'advisor-1'
DATE = '2026-06-30'


def _service(prior_status_map=None):
    """AttendanceService with mocked repo + notifier. prior_status_map = student->status before this mark."""
    svc = AttendanceService()
    svc.attendance_repo = MagicMock()
    svc.class_repo = MagicMock()
    svc.notification_service = MagicMock()

    svc.attendance_repo.get_status_map.return_value = dict(prior_status_map or {})
    svc.attendance_repo.get_student.side_effect = lambda sid: {'id': sid, 'display_name': f'Student {sid}'}
    svc.attendance_repo.get_class.return_value = {'id': CLASS_ID, 'name': 'Robotics', 'organization_id': ORG_ID}
    svc.attendance_repo.get_org_admin_ids.return_value = ['admin-1', 'admin-2']
    # default: two parents per student
    svc.notification_service.get_parents_for_student.side_effect = lambda sid: [{'id': f'parent-of-{sid}'}]
    return svc


def _mark(svc, records, meeting_date=DATE):
    return svc.mark_attendance(
        class_id=CLASS_ID,
        organization_id=ORG_ID,
        meeting_date=meeting_date,
        records=records,
        marked_by=MARKED_BY,
    )


class TestMarkAttendanceNotifications:
    def test_marking_absent_notifies_parents_only(self):
        svc = _service(prior_status_map={})  # nothing recorded yet
        summary = _mark(svc, [{'student_id': 's1', 'status': 'absent'}])

        # parent of s1 notified, no org admins (not a present->absent change)
        svc.notification_service.notify_student_absent.assert_called_once()
        kwargs = svc.notification_service.notify_student_absent.call_args.kwargs
        assert kwargs['recipient_id'] == 'parent-of-s1'
        assert kwargs['changed_from_present'] is False
        svc.attendance_repo.get_org_admin_ids.assert_not_called()
        assert summary['parents_notified'] == 1
        assert summary['org_admins_notified'] == 0
        assert summary['absent'] == 1

    def test_present_then_absent_notifies_parents_and_org_admins(self):
        svc = _service(prior_status_map={'s1': 'present'})
        summary = _mark(svc, [{'student_id': 's1', 'status': 'absent'}])

        recipients = [c.kwargs['recipient_id'] for c in svc.notification_service.notify_student_absent.call_args_list]
        assert 'parent-of-s1' in recipients
        assert 'admin-1' in recipients and 'admin-2' in recipients
        # every send for this transition is flagged as a correction
        assert all(c.kwargs['changed_from_present'] is True
                   for c in svc.notification_service.notify_student_absent.call_args_list)
        assert summary['parents_notified'] == 1
        assert summary['org_admins_notified'] == 2

    def test_already_absent_is_not_renotified(self):
        svc = _service(prior_status_map={'s1': 'absent'})
        summary = _mark(svc, [{'student_id': 's1', 'status': 'absent'}])

        svc.notification_service.notify_student_absent.assert_not_called()
        assert summary['parents_notified'] == 0
        assert summary['org_admins_notified'] == 0

    def test_marking_present_sends_nothing(self):
        svc = _service(prior_status_map={'s1': 'absent'})
        _mark(svc, [{'student_id': 's1', 'status': 'present'}])
        svc.notification_service.notify_student_absent.assert_not_called()

    def test_excused_then_absent_notifies_parents_not_admins(self):
        # excused -> absent is a new absence (parents) but NOT a present->absent correction
        svc = _service(prior_status_map={'s1': 'excused'})
        summary = _mark(svc, [{'student_id': 's1', 'status': 'absent'}])

        recipients = [c.kwargs['recipient_id'] for c in svc.notification_service.notify_student_absent.call_args_list]
        assert recipients == ['parent-of-s1']
        assert summary['org_admins_notified'] == 0

    def test_mixed_roster_counts_and_persists(self):
        svc = _service(prior_status_map={'s2': 'present'})
        summary = _mark(svc, [
            {'student_id': 's1', 'status': 'present'},
            {'student_id': 's2', 'status': 'absent'},   # present -> absent
            {'student_id': 's3', 'status': 'excused'},
        ])
        # every record persisted
        assert svc.attendance_repo.upsert_status.call_count == 3
        assert summary['present'] == 1
        assert summary['absent'] == 1
        assert summary['excused'] == 1
        # s2 present->absent => parent + 2 admins
        assert summary['parents_notified'] == 1
        assert summary['org_admins_notified'] == 2


class TestMarkAttendanceValidation:
    def test_invalid_status_raises(self):
        svc = _service()
        with pytest.raises(ValidationError):
            _mark(svc, [{'student_id': 's1', 'status': 'late'}])

    def test_missing_student_id_raises(self):
        svc = _service()
        with pytest.raises(ValidationError):
            _mark(svc, [{'status': 'absent'}])

    def test_empty_records_raises(self):
        svc = _service()
        with pytest.raises(ValidationError):
            _mark(svc, [])

    def test_missing_meeting_date_raises(self):
        svc = _service()
        with pytest.raises(ValidationError):
            svc.mark_attendance(class_id=CLASS_ID, organization_id=ORG_ID,
                                meeting_date='', records=[{'student_id': 's1', 'status': 'absent'}],
                                marked_by=MARKED_BY)


class TestSendAttendanceReminders:
    def _svc_with_classes(self, classes):
        svc = AttendanceService()
        svc.attendance_repo = MagicMock()
        svc.notification_service = MagicMock()
        svc.attendance_repo.find_classes_meeting.return_value = classes
        return svc

    def test_notifies_advisors_when_not_taken(self):
        svc = self._svc_with_classes([{'id': 'c1', 'name': 'Art', 'organization_id': ORG_ID}])
        svc.attendance_repo.attendance_taken.return_value = False
        svc.attendance_repo.get_active_advisor_ids.return_value = ['adv-1', 'adv-2']
        svc.attendance_repo.reminder_already_sent.return_value = False

        # Mon 2026-06-29 09:00 local
        summary = svc.send_attendance_reminders(now=datetime(2026, 6, 29, 9, 0, 0), window_minutes=15)

        assert svc.notification_service.notify_attendance_reminder.call_count == 2
        assert summary['reminders_sent'] == 2
        assert summary['classes_notified'] == 1
        # queried for Monday
        assert svc.attendance_repo.find_classes_meeting.call_args.args[0] == 'mon'

    def test_skips_class_when_attendance_already_taken(self):
        svc = self._svc_with_classes([{'id': 'c1', 'name': 'Art', 'organization_id': ORG_ID}])
        svc.attendance_repo.attendance_taken.return_value = True

        summary = svc.send_attendance_reminders(now=datetime(2026, 6, 29, 9, 0, 0))

        svc.notification_service.notify_attendance_reminder.assert_not_called()
        assert summary['skipped_taken'] == 1
        assert summary['reminders_sent'] == 0

    def test_skips_advisor_when_reminder_already_sent(self):
        svc = self._svc_with_classes([{'id': 'c1', 'name': 'Art', 'organization_id': ORG_ID}])
        svc.attendance_repo.attendance_taken.return_value = False
        svc.attendance_repo.get_active_advisor_ids.return_value = ['adv-1']
        svc.attendance_repo.reminder_already_sent.return_value = True

        summary = svc.send_attendance_reminders(now=datetime(2026, 6, 29, 9, 0, 0))

        svc.notification_service.notify_attendance_reminder.assert_not_called()
        assert summary['reminders_sent'] == 0
