"""
Recurring tasks: "every weekday, lock the east doors"; "M/W/F, send the
attendance photo".

An admin assigns a task to anyone -- staff, parents, students -- on chosen
weekdays between a start and an optional end date (iCreate meeting
2026-09-23). Each occurrence is its own task row, due that day, and expires at
the end of that day in the ORG's timezone (owner's answer 5): a daily duty
nobody did on Tuesday is not still owed on Friday, it simply did not happen,
and the office sees that in the date x person grid.

The cron (/api/sis/internal/task-occurrences, every dispatcher run) does two
passes:

  1. create today's occurrences for every live schedule whose day it is,
     idempotent on (schedule_id, user_id, occurrence_date) -- a unique index
     backs it, so two overlapping runs cannot double a row;
  2. mark every unfinished occurrence whose day has ended 'expired'.

Weekdays are Python's weekday(): 0 = Monday .. 6 = Sunday, stored in
sis_task_schedules.days_of_week.
"""

import uuid as _uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from services import sis_onboarding_service as onboarding
from utils.logger import get_logger

logger = get_logger(__name__)

DEFAULT_TZ = 'America/Denver'   # matches sis_staff_service.DEFAULT_TZ
DAY_NAMES = ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')
# The grid reads at most this many days at a time.
MAX_GRID_DAYS = 62


# admin client justified: schedules and their occurrences span every person a
#   school assigns to, and the cron runs with no caller at all; the routes'
#   ADMIN_ROLES + org gate (or the cron secret) is the authorization
from utils.admin_client import admin_client as _admin


def _repo():
    from repositories.sis_task_repository import SisTaskRepository
    return SisTaskRepository(client=_admin())


def _zone(name: Optional[str]) -> ZoneInfo:
    try:
        return ZoneInfo(name or DEFAULT_TZ)
    except Exception:  # noqa: BLE001 -- a bad value in the column is not our caller's fault
        return ZoneInfo(DEFAULT_TZ)


def end_of_day_utc(day: date, tz: ZoneInfo) -> str:
    """The last moment of `day` in `tz`, as a UTC timestamp. Midnight of the
    next local day, which is DST-correct where "+24h" is not."""
    nxt = datetime.combine(day + timedelta(days=1), time(0, 0), tzinfo=tz)
    return (nxt - timedelta(seconds=1)).astimezone(timezone.utc).isoformat()


def _clean_days(value: Any) -> Optional[List[int]]:
    if not isinstance(value, (list, tuple)):
        return None
    try:
        days = sorted({int(d) for d in value})
    except (TypeError, ValueError):
        return None
    if not days or any(d < 0 or d > 6 for d in days):
        return None
    return days


def _clean_date(value: Any) -> Optional[str]:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10]).isoformat()
    except ValueError:
        return None


def describe_days(days: List[int]) -> str:
    """"Every day", "Weekdays", or "Mon, Wed, Fri"."""
    days = sorted(days or [])
    if days == list(range(7)):
        return 'Every day'
    if days == list(range(5)):
        return 'Weekdays'
    return ', '.join(DAY_NAMES[d] for d in days)


# ── Admin: create, list, change ─────────────────────────────────────────────

def create_schedule(org_id: str, actor_id: str, data: Dict[str, Any],
                    today: Optional[date] = None) -> Dict[str, Any]:
    """Save a recurring task and create today's occurrence if today is one of
    its days -- an admin who sets "every weekday from today" at 8am expects
    the first one to be there, not tomorrow's."""
    title = (data.get('title') or '').strip()
    template = None
    if data.get('template_id'):
        template = onboarding._load_template(org_id, data['template_id'])
        if not template:
            return {'error': 'Template not found'}
        title = title or template.get('name') or ''
    if not title:
        return {'error': 'The task needs a title'}
    days = _clean_days(data.get('days_of_week'))
    if days is None:
        return {'error': 'Pick at least one day'}
    start = _clean_date(data.get('start_date'))
    if not start:
        return {'error': 'Pick a start date'}
    end = _clean_date(data.get('end_date'))
    if data.get('end_date') and not end:
        return {'error': 'That end date is not a date'}
    if end and end < start:
        return {'error': 'The end date is before the start date'}
    priority = data.get('priority') or None
    if priority is not None and priority not in onboarding.PRIORITIES:
        return {'error': 'Invalid priority'}
    people = onboarding._clean_recipients(data.get('recipients') or [], 'staff')
    if not people:
        return {'error': 'Pick at least one person'}
    try:
        onboarding.assert_recipients_in_org(org_id, [p['id'] for p in people])
    except onboarding.RecipientNotInOrg as e:
        return {'error': str(e)}

    items: Optional[List[Dict[str, Any]]]
    if template is not None:
        items = [dict(i) for i in (template.get('items') or []) if isinstance(i, dict)]
        description = data.get('description') or template.get('description')
    else:
        items = onboarding._clean_items(data.get('items') or []) if data.get('items') else []
        if items is None:
            return {'error': 'Every step needs a title'}
        description = data.get('description')
    for i in items:
        # A step naming one person's document cannot repeat for many people.
        i['document_id'] = None

    row = _repo().insert_schedule({
        'organization_id': org_id,
        'title': title,
        'description': (description or '').strip() or None,
        'items': items,
        'template_id': data.get('template_id') or None,
        'recipients': people,
        'days_of_week': days,
        'start_date': start,
        'end_date': end,
        'priority': priority,
        'active': True,
        'created_by': actor_id,
    })
    if not row:
        return {'error': 'Could not save the schedule', 'status': 500}
    created = 0
    try:
        created = run_schedule(row, today=today).get('created', 0)
    except Exception as e:  # noqa: BLE001 -- the cron will catch up
        logger.error(f'[TaskSchedule] first run failed for {row.get("id")}: {e}', exc_info=True)
    return {'schedule': decorate(row), 'created_today': created}


def decorate(row: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(row)
    out['days_label'] = describe_days(row.get('days_of_week') or [])
    out['recipient_count'] = len(row.get('recipients') or [])
    today = date.today().isoformat()
    end = str(row.get('end_date') or '')
    # Ended: past its end date, or stopped with "End" (which sets the end
    # date to today and switches it off). Paused is off with days still ahead.
    ended = bool(end) and (end < today or (not row.get('active') and end <= today))
    out['state'] = 'ended' if ended else 'active' if row.get('active') else 'paused'
    return out


def list_schedules(org_id: str) -> List[Dict[str, Any]]:
    return [decorate(r) for r in _repo().list_schedules(org_id)]


def _owned(org_id: str, schedule_id: str) -> Optional[Dict[str, Any]]:
    row = _repo().get_schedule(schedule_id)
    if not row or row.get('organization_id') != org_id:
        return None
    return row


def update_schedule(org_id: str, schedule_id: str, data: Dict[str, Any],
                    today: Optional[date] = None) -> Dict[str, Any]:
    """Pause, resume, end, or change the days of a schedule.

    `end: true` stops it for good as of today: the end date becomes today, so
    today's occurrence (if already out) stays and nothing new is made. Pausing
    is the reversible version. Occurrences already created are never touched
    -- they are what happened.
    """
    row = _owned(org_id, schedule_id)
    if not row:
        return {'error': 'Schedule not found', 'status': 404}
    today = today or date.today()
    fields: Dict[str, Any] = {'updated_at': datetime.now(timezone.utc).isoformat()}
    if data.get('end'):
        end = min(today.isoformat(), row.get('end_date') or today.isoformat())
        fields.update({'active': False, 'end_date': max(end, row['start_date'])})
    if 'active' in data and not data.get('end'):
        fields['active'] = bool(data['active'])
    if 'days_of_week' in data:
        days = _clean_days(data['days_of_week'])
        if days is None:
            return {'error': 'Pick at least one day'}
        fields['days_of_week'] = days
    if 'end_date' in data and not data.get('end'):
        end = _clean_date(data['end_date'])
        if data['end_date'] and not end:
            return {'error': 'That end date is not a date'}
        if end and end < row['start_date']:
            return {'error': 'The end date is before the start date'}
        fields['end_date'] = end
    updated = _repo().update_schedule(schedule_id, fields) or {**row, **fields}
    if fields.get('active') and not row.get('active'):
        # Resumed: today's occurrence, if today is one of its days, should not
        # wait for the next cron run. Clearing last_run_on lets the run happen.
        try:
            run_schedule({**updated, 'last_run_on': None}, today=today)
        except Exception as e:  # noqa: BLE001 -- the cron will catch up
            logger.error(f'[TaskSchedule] resume run failed for {schedule_id}: {e}')
    return {'schedule': decorate(updated)}


# ── The grid ────────────────────────────────────────────────────────────────

def grid(org_id: str, schedule_id: str, since: Optional[str] = None,
         until: Optional[str] = None) -> Dict[str, Any]:
    """Dates x people for one schedule: who did it on which day.

    Defaults to the last 14 days up to today. A cell is the occurrence's
    status ('done', 'expired', 'open') and when it was finished; a date the
    schedule does not run on has no column at all.
    """
    row = _owned(org_id, schedule_id)
    if not row:
        return {'error': 'Schedule not found', 'status': 404}
    tz = _zone(_repo().org_timezones([org_id]).get(org_id))
    today = datetime.now(timezone.utc).astimezone(tz).date()
    end = _clean_date(until) or today.isoformat()
    start = _clean_date(since) or (date.fromisoformat(end) - timedelta(days=13)).isoformat()
    if start < row['start_date']:
        start = row['start_date']
    if (date.fromisoformat(end) - date.fromisoformat(start)).days > MAX_GRID_DAYS:
        start = (date.fromisoformat(end) - timedelta(days=MAX_GRID_DAYS)).isoformat()

    days = set(row.get('days_of_week') or [])
    dates: List[str] = []
    d = date.fromisoformat(start)
    while d.isoformat() <= end:
        if d.weekday() in days:
            dates.append(d.isoformat())
        d += timedelta(days=1)

    from services.sis_tasks_service import finished_at, task_status
    cells: Dict[str, Dict[str, Any]] = {}
    for occ in _repo().list_for_schedule(schedule_id, since=start, until=end):
        status = task_status(occ)
        cells[f"{occ['user_id']}:{occ['occurrence_date']}"] = {
            'task_id': occ['id'],
            'status': 'done' if status in ('done', 'waiting_on_admin')
            else 'expired' if status == 'expired' else 'open',
            'finished_at': finished_at(occ) if status in ('done', 'waiting_on_admin') else None,
        }
    from services.sis_tasks_service import _names
    people = row.get('recipients') or []
    names = _names([p['id'] for p in people])
    return {
        'schedule': decorate(row),
        'dates': dates,
        'people': sorted(({'id': p['id'], 'audience': p.get('audience'),
                           'name': names.get(p['id']) or 'Unknown'} for p in people),
                         key=lambda p: p['name'].lower()),
        'cells': cells,
    }


# ── The cron ────────────────────────────────────────────────────────────────

def run_schedule(row: Dict[str, Any], today: Optional[date] = None,
                 tz: Optional[ZoneInfo] = None) -> Dict[str, int]:
    """Create today's occurrences of one schedule, if today is one of its days.

    Idempotent: people who already have today's row are skipped before the
    insert, and the unique index refuses the rest if two runs overlap.
    """
    if not row.get('active'):
        return {'created': 0}
    if tz is None:
        tz = _zone(_repo().org_timezones([row['organization_id']]).get(row['organization_id']))
    today = today or datetime.now(timezone.utc).astimezone(tz).date()
    day = today.isoformat()
    if day < str(row.get('start_date')) or (row.get('end_date') and day > str(row['end_date'])):
        return {'created': 0}
    if today.weekday() not in (row.get('days_of_week') or []):
        return {'created': 0}

    repo = _repo()
    have = repo.occurrence_user_ids(row['id'], day)
    todo = [p for p in (row.get('recipients') or []) if p.get('id') not in have]
    created = 0
    if todo:
        # Deterministic, so every run on the same day files into the same card.
        batch = str(_uuid.uuid5(_uuid.NAMESPACE_URL, f"optio-task-schedule:{row['id']}:{day}"))
        result = onboarding.assign_task(
            row['organization_id'], row.get('created_by'), todo,
            title=row.get('title'), description=row.get('description'),
            items=row.get('items') or None, due_date=day,
            priority=row.get('priority'),
            schedule_id=row['id'], occurrence_date=day,
            expires_at=end_of_day_utc(today, tz), batch_id=batch,
            skip_held=False)
        if result.get('error'):
            logger.warning(f"[TaskSchedule] {row['id']} on {day}: {result['error']}")
        else:
            created = result.get('assigned', 0)
    repo.update_schedule(row['id'], {'last_run_on': day})
    return {'created': created}


def run_due(now: Optional[datetime] = None) -> Dict[str, Any]:
    """The cron's two passes: today's occurrences, then expiry."""
    now = now or datetime.now(timezone.utc)
    repo = _repo()
    schedules = repo.active_schedules()
    zones = repo.org_timezones([s['organization_id'] for s in schedules])
    created = ran = failed = 0
    for s in schedules:
        tz = _zone(zones.get(s['organization_id']))
        today = now.astimezone(tz).date()
        if s.get('end_date') and today.isoformat() > str(s['end_date']):
            # Past its end: stop reading it every ten minutes.
            repo.update_schedule(s['id'], {'active': False})
            continue
        if str(s.get('last_run_on') or '') == today.isoformat():
            # Already made today's. last_run_on is written after the inserts,
            # so a run that died half-way leaves it unset and the next run
            # finishes the job.
            continue
        try:
            created += run_schedule(s, today=today, tz=tz)['created']
            ran += 1
        except Exception as e:  # noqa: BLE001 -- one schedule must not stop the rest
            failed += 1
            logger.error(f"[TaskSchedule] run failed for {s.get('id')}: {e}", exc_info=True)
    expired = repo.expire_before(now.isoformat())
    return {'schedules': len(schedules), 'ran': ran, 'created': created,
            'expired': expired, 'failed': failed}

