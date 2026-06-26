"""
SIS attendance sweep — PURE rules for check-in reminders + attendance-gap alerts.

No DB, no timezone lookups (the caller passes the org-local 'now'), so the tricky
parts are exhaustively unit-testable. The sweep service composes DB reads + the
org timezone and calls these.

- check-in reminder: a guardian is reminded when their child has a class today and
  hasn't been checked in (or marked absent) by `grace_minutes` after the day's
  FIRST class start.
- attendance-gap: a student was present (or late) for an earlier class but is marked
  absent for a later class whose start time has already passed.
"""

from datetime import time as dtime, timedelta, datetime, date
from typing import Dict, List, Any, Optional


def _to_minutes(t: Any) -> Optional[int]:
    """'HH:MM[:SS]' or datetime.time -> minutes since midnight."""
    if t is None:
        return None
    if isinstance(t, dtime):
        return t.hour * 60 + t.minute
    parts = str(t).split(':')
    try:
        return int(parts[0]) * 60 + (int(parts[1]) if len(parts) > 1 else 0)
    except (ValueError, IndexError):
        return None


def meeting_is_today(meeting: Dict[str, Any], today: date) -> bool:
    """Does a meeting occur on `today` (recurring weekday match or one-off date)?"""
    if meeting.get('day_of_week') is not None:
        # our convention: 0=Sun..6=Sat; python weekday(): Mon=0..Sun=6
        return meeting['day_of_week'] == (today.weekday() + 1) % 7
    sd = meeting.get('specific_date')
    if sd is None:
        return False
    if isinstance(sd, date) and not isinstance(sd, datetime):
        return sd == today
    return str(sd)[:10] == today.isoformat()


def first_start_minutes_today(meetings: List[Dict[str, Any]], today: date) -> Optional[int]:
    """Earliest start (minutes since midnight) among today's meetings, or None."""
    starts = [
        _to_minutes(m.get('start_time'))
        for m in (meetings or []) if meeting_is_today(m, today)
    ]
    starts = [s for s in starts if s is not None]
    return min(starts) if starts else None


def checkin_reminder_due(*, now_minutes: int, first_start_minutes: Optional[int],
                         grace_minutes: int, has_checkin_or_absence: bool) -> bool:
    """
    True when a reminder should be sent: there is a class today, the student isn't
    checked in / marked absent, and we're past (first class start + grace).
    """
    if first_start_minutes is None:      # no class today
        return False
    if has_checkin_or_absence:           # already checked in / out / absent
        return False
    return now_minutes >= first_start_minutes + grace_minutes


def detect_attendance_gap(class_attendance: List[Dict[str, Any]],
                          now_minutes: int) -> Optional[Dict[str, Any]]:
    """
    class_attendance: [{'class_id', 'class_name', 'start_minutes', 'status'}] for the
    student's classes today (status from teacher attendance: present/late/absent/None).

    Returns the missed (later) class dict if the student was present/late for an
    EARLIER-starting class and is marked absent for a LATER class whose start has
    already passed; else None.
    """
    rows = [r for r in (class_attendance or []) if r.get('start_minutes') is not None]
    rows.sort(key=lambda r: r['start_minutes'])
    seen_present = False
    for r in rows:
        status = r.get('status')
        if status in ('present', 'late'):
            seen_present = True
        elif status == 'absent' and seen_present and r['start_minutes'] <= now_minutes:
            return r
    return None
