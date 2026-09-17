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

from services import sis_audiences
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
                  'rsvp_enabled, rsvp_fee_cents, rsvp_closes_at')


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


def create_event(org_id: str, user_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    row = (_admin().table('sis_events')
           .insert({**fields, 'organization_id': org_id, 'created_by': user_id})
           .execute()).data
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
    _admin().table('sis_events').delete().eq('id', event_id).execute()
    return True
