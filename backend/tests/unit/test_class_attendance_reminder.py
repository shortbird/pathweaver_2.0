"""
Unit tests for the ClassAttendanceReminderJob wrapper (iCreate SIS).

The substantive selection/notification logic lives in AttendanceService and is
tested there; here we just confirm the job resolves `now`, passes the window
through, and surfaces the service result.
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock, patch

from jobs.class_attendance_reminder import ClassAttendanceReminderJob, _resolve_now


def test_resolve_now_uses_explicit_iso():
    now = _resolve_now({'now': '2026-06-29T09:00:00', 'timezone': 'America/Denver'})
    assert now.year == 2026 and now.month == 6 and now.day == 29
    assert now.hour == 9


def test_execute_delegates_to_service_with_window():
    fake_service = MagicMock()
    fake_service.send_attendance_reminders.return_value = {
        'reminders_sent': 3, 'classes_notified': 2,
    }

    with patch('services.attendance_service.AttendanceService', return_value=fake_service):
        result = ClassAttendanceReminderJob.execute({
            'now': '2026-06-29T09:00:00',
            'timezone': 'America/Denver',
            'window_minutes': 20,
        })

    assert result['status'] == 'success'
    assert result['reminders_sent'] == 3
    kwargs = fake_service.send_attendance_reminders.call_args.kwargs
    assert kwargs['window_minutes'] == 20
    assert isinstance(kwargs['now'], datetime)
