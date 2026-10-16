"""The school calendar: every read of sis_events, and its writes.

Ten places read sis_events with four different audience filters -- the SIS
calendar, the parent feed, the community feed (which re-read the table on
its own), the ICS export, the dashboard, the RSVP service -- so "who sees
an admins-only event" was answered wherever somebody last typed it
(docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, E2; M12 in
docs/sis/CONSOLIDATION_PLAN.md). This module is the one reader. A caller
says who is looking (`viewer`) and the window it wants; the audience rule
lives here and nowhere else.

Viewers:
  'admin'   sees every event, admins-only included (org_admin, superadmin).
  'staff'   sees school and teacher events (advisor, campus coordinator).
  'family'  sees school events only (parents, students, observers).
  'shared'  the subscribable ICS feed: its token can be forwarded, so it never
            carries an admins-only event; the family token narrows to school.

The audience words themselves are services/sis_audiences.EVENT_AUDIENCES.

Stamps: sis_events.start_at / end_at hold the wall clock the office typed,
tagged +00 (see utils/timeFormat.js on the web and components/school/format.ts
on mobile for the reading rule). This module does not convert them.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from utils.logger import get_logger
from utils.validation.sanitizers import pgrst_timestamp

logger = get_logger(__name__)

# admin client justified: sis_events is deny-all RLS (service role only). Every
#   caller is a role-gated route or a service behind one, and the org filter
#   below is the scope; the audience filter is the visibility rule.
from utils.admin_client import admin_client as _admin

VIEWERS = ('admin', 'staff', 'family', 'shared')

#: What each viewer may see. None means everything.
_VISIBLE = {
    'admin': None,
    'staff': ('school', 'teachers'),
    'family': ('school',),
    'shared': ('school', 'teachers'),
}

FAMILY_COLUMNS = ('id, title, description, location, start_at, end_at, all_day, '
                  'category, categories, audience, '
                  'rsvp_enabled, rsvp_fee_cents, rsvp_closes_at, '
                  'rsvp_mode, rsvp_capacity, series_id')


def viewer_for_roles(roles) -> str:
    """The viewer kind for a set of effective roles."""
    roles = set(roles or ())
    if roles & {'org_admin', 'superadmin'}:
        return 'admin'
    if roles & {'advisor', 'campus_coordinator'}:
        return 'staff'
    return 'family'


def viewer_for_user(user_id: str) -> str:
    """The viewer kind for a signed-in person, from the same role read every
    SIS decision uses."""
    from services import sis_service
    return viewer_for_roles(sis_service.caller_org_roles(user_id))


def visible_audiences(viewer: str):
    if viewer not in VIEWERS:
        raise ValueError(f'unknown events viewer {viewer!r}')
    return _VISIBLE[viewer]


def _audience_ok(row: Dict[str, Any], allowed) -> bool:
    """Fail closed: a value outside the viewer's set is hidden, whatever it is."""
    if allowed is None:
        return True
    return row.get('audience') in allowed


def list_events(org_id: str, viewer: str, *, from_iso: Optional[str] = None,
                to_iso: Optional[str] = None, upcoming_only: bool = False,
                limit: Optional[int] = None, columns: str = '*') -> List[Dict[str, Any]]:
    """The events this viewer may see in the window, soonest first.

    `from_iso` keeps any event still running at that moment (an event that
    started before the window and ends inside it is on the calendar); `to_iso`
    is exclusive on start_at. `upcoming_only` is "from now". `from_iso` is
    validated as a timestamp because it lands in a PostgREST filter string
    where a comma would end the clause.
    """
    allowed = visible_audiences(viewer)
    q = _admin().table('sis_events').select(columns).eq('organization_id', org_id)
    if upcoming_only:
        q = q.gte('start_at', datetime.utcnow().isoformat())
    if from_iso:
        f = pgrst_timestamp(from_iso, 'from')
        q = q.or_(f'start_at.gte.{f},end_at.gte.{f}')
    if to_iso:
        q = q.lt('start_at', to_iso)
    if allowed is not None:
        # Filtered in the query so a limit counts visible rows, not all rows.
        q = q.in_('audience', list(allowed))
    q = q.order('start_at')
    if limit:
        q = q.limit(limit)
    rows = (q.execute()).data or []
    # The query filtered; this pass is the same rule stated once more, so a
    # client stub (or a future reader that skips the filter) cannot widen it.
    return [r for r in rows if _audience_ok(r, allowed)]


def get_event(org_id: str, event_id: str) -> Optional[Dict[str, Any]]:
    """One event, or None when it is not this org's."""
    rows = (_admin().table('sis_events').select('*')
            .eq('id', event_id).eq('organization_id', org_id)
            .limit(1).execute()).data
    return rows[0] if rows else None


def _insert(payload) -> List[Dict[str, Any]]:
    """The one insert into sis_events: one event (a dict, as it always was), or
    every date of a series in a single statement (a list). The caller pins the
    org and the author on every row."""
    return (_admin().table('sis_events').insert(payload).execute()).data or []


def create_event(org_id: str, user_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    row = _insert({**fields, 'organization_id': org_id, 'created_by': user_id})
    return row[0] if row else None


def update_event(org_id: str, event_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update, or None when the event is not this org's."""
    if not get_event(org_id, event_id):
        return None
    row = (_admin().table('sis_events').update({**fields, 'updated_at': datetime.utcnow().isoformat()})
           .eq('id', event_id).execute()).data
    return row[0] if row else None


def delete_event(org_id: str, event_id: str) -> bool:
    """Delete, or False when the event is not this org's."""
    if not get_event(org_id, event_id):
        return False
    _delete(org_id, id=event_id)
    return True


def _delete(org_id: str, since: Optional[str] = None, **match) -> List[Dict[str, Any]]:
    """The one delete from sis_events, always inside one org. `since` keeps
    only rows starting at or after that stamp ("this and following")."""
    q = _admin().table('sis_events').delete().eq('organization_id', org_id)
    for col, val in match.items():
        q = q.eq(col, val)
    if since:
        q = q.gte('start_at', since)
    return (q.execute()).data or []


# ── Repeating events ─────────────────────────────────────────────────────────
# A repeating event is one ROW PER OCCURRENCE sharing a series_id, not a rule
# expanded at read time. Each Friday excursion has its own location, its own
# RSVP list and its own "Full"; a rule would make every one of those an
# exception to the rule. The cost is that changing the time of all of them is
# an edit per row, which is the rarer job.
#
# Repeats, as the office picks them in Add event:
#   'weekly'   every 7 days            } until a date or for a count
#   '2weeks'   every 14 days           }
#   'monthly'  the same weekday of the month as the first date ("3rd Friday";
#              a 5th weekday means the last one), until a date or for a count
#   'dates'    exactly the dates picked -- the answer to "two chosen Fridays a
#              month" (Apogee NoCo's SPARK excursions): the 1st and 3rd
#              Friday drift from every-2-weeks in a 5-Friday month, and holidays
#              move them anyway, so the office lists the days.

MAX_OCCURRENCES = 60
REPEATS = ('weekly', '2weeks', 'monthly', 'dates')


class RepeatError(ValueError):
    """A repeat the office asked for that cannot be built; the message is shown."""


def _nth_weekday(year: int, month: int, weekday: int, nth: int):
    """The nth (1-4) weekday of a month, or the last one when nth is 5."""
    import calendar
    from datetime import date
    days = [d for d in range(1, calendar.monthrange(year, month)[1] + 1)
            if date(year, month, d).weekday() == weekday]
    return date(year, month, days[min(nth, len(days)) - 1])


def occurrence_dates(first, repeat: Dict[str, Any]):
    """Every date the event happens on, first date included, at most
    MAX_OCCURRENCES. `first` is a datetime.date."""
    from datetime import date, timedelta
    every = (repeat or {}).get('every')
    if every not in REPEATS:
        raise RepeatError('Pick how often the event repeats')

    if every == 'dates':
        picked = set()
        for raw in (repeat.get('dates') or []):
            try:
                picked.add(date.fromisoformat(str(raw)[:10]))
            except ValueError:
                raise RepeatError(f'{raw} is not a date')
        picked.add(first)
        out = sorted(picked)
        if len(out) > MAX_OCCURRENCES:
            raise RepeatError(f'An event can repeat at most {MAX_OCCURRENCES} times')
        return out

    until = None
    if repeat.get('until'):
        try:
            until = date.fromisoformat(str(repeat['until'])[:10])
        except ValueError:
            raise RepeatError('The end date for the repeat is not a date')
        if until < first:
            raise RepeatError('The repeat cannot end before the first date')
    count = None
    if repeat.get('count') not in (None, ''):
        try:
            count = int(repeat['count'])
        except (TypeError, ValueError):
            raise RepeatError('How many times must be a number')
        if count < 1:
            raise RepeatError('How many times must be at least 1')
    if until is None and count is None:
        raise RepeatError('Say when the repeat ends: an end date or how many times')
    limit = min(count or MAX_OCCURRENCES, MAX_OCCURRENCES)
    if count and count > MAX_OCCURRENCES:
        raise RepeatError(f'An event can repeat at most {MAX_OCCURRENCES} times')

    out = []
    if every in ('weekly', '2weeks'):
        step = timedelta(days=7 if every == 'weekly' else 14)
        d = first
        while len(out) < limit and (until is None or d <= until):
            out.append(d)
            d += step
    else:  # monthly, on the same weekday of the month
        nth = (first.day - 1) // 7 + 1
        y, m = first.year, first.month
        while len(out) < limit:
            d = _nth_weekday(y, m, first.weekday(), nth)
            if until is not None and d > until:
                break
            out.append(d)
            m += 1
            if m > 12:
                y, m = y + 1, 1
    if until is not None and count is None and len(out) == MAX_OCCURRENCES:
        # The cap cut the series short of the end date the office asked for.
        nxt = out[-1] + timedelta(days=1)
        if nxt <= until:
            raise RepeatError(f'An event can repeat at most {MAX_OCCURRENCES} times. '
                              'Pick an earlier end date.')
    return out


def _shift_stamp(stamp: Optional[str], days: int) -> Optional[str]:
    """Move a wall-clock stamp ('2026-10-02T09:00:00Z') by whole days, keeping
    the time exactly as typed -- no timezone math, the same rule as the rest of
    this module."""
    if not stamp:
        return stamp
    from datetime import date, timedelta
    s = str(stamp)
    return (date.fromisoformat(s[:10]) + timedelta(days=days)).isoformat() + s[10:]


def create_series(org_id: str, user_id: str, fields: Dict[str, Any],
                  repeat: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Create one row per occurrence, linked by a new series_id. The end time
    and "replies close" move with each occurrence, so every Friday closes its
    own replies the same number of days ahead."""
    import uuid
    from datetime import date
    first = date.fromisoformat(str(fields['start_at'])[:10])
    dates = occurrence_dates(first, repeat)
    if len(dates) == 1:
        row = create_event(org_id, user_id, fields)
        return [row] if row else []
    series_id = str(uuid.uuid4())
    rows = []
    for d in dates:
        shift = (d - first).days
        rows.append({
            **fields,
            'start_at': _shift_stamp(fields.get('start_at'), shift),
            'end_at': _shift_stamp(fields.get('end_at'), shift),
            'rsvp_closes_at': _shift_stamp(fields.get('rsvp_closes_at'), shift),
            'series_id': series_id,
            'organization_id': org_id,
            'created_by': user_id,
        })
    return _insert(rows)


def delete_following(org_id: str, event_id: str) -> int:
    """Delete this occurrence and every later one in its series. Returns how
    many went; 0 when the event is not this org's. An event outside a series
    deletes alone."""
    ev = get_event(org_id, event_id)
    if not ev:
        return 0
    if not ev.get('series_id'):
        delete_event(org_id, event_id)
        return 1
    gone = _delete(org_id, since=ev['start_at'], series_id=ev['series_id'])
    return len(gone) or 1
