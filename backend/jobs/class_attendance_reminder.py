"""
Class Attendance Reminder Job (iCreate SIS)

Run on a short recurring schedule (e.g. every 15 min via Render cron). For classes
that start within the current window today and whose attendance hasn't been taken,
notify each class's advisors to mark today's absences.

job_data (all optional):
  - now: ISO datetime to evaluate against (for testing; defaults to current time in `timezone`)
  - timezone: IANA tz name for interpreting class start_times (default 'America/Denver')
  - window_minutes: how far ahead of `now` to look for class starts (default 15)
"""

from typing import Dict, Any
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

DEFAULT_TIMEZONE = 'America/Denver'
DEFAULT_WINDOW_MINUTES = 15


def _resolve_now(job_data: Dict[str, Any]) -> datetime:
    """Determine the wall-clock 'now' to evaluate class start_times against."""
    tz_name = job_data.get('timezone') or DEFAULT_TIMEZONE
    tz = None
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(tz_name)
    except Exception:
        # tzdata may be missing (e.g. bare Windows); fall back to naive local time.
        logger.warning(f"Timezone '{tz_name}' unavailable; using naive local time for attendance reminders")

    if job_data.get('now'):
        now = datetime.fromisoformat(job_data['now'])
        if tz is not None:
            now = now.replace(tzinfo=tz) if now.tzinfo is None else now.astimezone(tz)
        return now

    return datetime.now(tz) if tz is not None else datetime.now()


class ClassAttendanceReminderJob:
    """Job handler for start-of-class attendance reminders."""

    @staticmethod
    def execute(job_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from services.attendance_service import AttendanceService

            now = _resolve_now(job_data or {})
            window_minutes = int((job_data or {}).get('window_minutes', DEFAULT_WINDOW_MINUTES))

            result = AttendanceService().send_attendance_reminders(
                now=now, window_minutes=window_minutes
            )
            return {'status': 'success', **result}

        except Exception as e:
            logger.error(f"Class attendance reminder job failed: {e}")
            raise
