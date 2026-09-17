"""
SIS events — staff-managed org events shown on the SIS Calendar page.

The calendar shows EVENTS (field trips, showcases, closures), not class
meetings; the weekly class grid lives on the Classes/Schedule surfaces.
Staff-gated like the rest of /api/sis; sis_events is deny-all RLS (service
role only).
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from utils.validation import sanitize_text
from utils.validation.sanitizers import PostgrestFilterError
from database import get_supabase_admin_client
from routes.sis import STAFF_ROLES, ADMIN_ROLES
from services import sis_audiences, sis_service
from services import sis_events_service as events

logger = get_logger(__name__)

bp = Blueprint('sis_events', __name__, url_prefix='/api/sis')

EVENT_FIELDS = ('title', 'description', 'location', 'start_at', 'end_at', 'all_day',
                'category', 'categories', 'audience',
                # RSVP: whether families are asked to reply, what it costs, and
                # when replies close (9cf78e9a).
                'rsvp_enabled', 'rsvp_fee_cents', 'rsvp_closes_at')
# The calendar's audience words live with the board's and the send's in
# services/sis_audiences.py (M12); this name is kept for the readers of it.
AUDIENCES = sis_audiences.EVENT_AUDIENCES
MAX_CATEGORIES = 8


def _clean(data):
    """Whitelist + sanitize an event payload; returns (fields, error_message)."""
    fields = {}
    for k in EVENT_FIELDS:
        if k not in data:
            continue
        v = data[k]
        if k in ('all_day', 'rsvp_enabled'):
            fields[k] = bool(v)
        elif k == 'rsvp_fee_cents':
            # NULL is "free", which is not zero: a zero would render a payment
            # line for nothing. A negative fee is not a refund, it is a typo.
            try:
                cents = int(v) if v not in (None, '') else None
            except (TypeError, ValueError):
                cents = None
            fields[k] = cents if cents and cents > 0 else None
        elif k == 'audience':
            fields[k] = sis_audiences.event_audience(v)
        elif k == 'categories':
            # An event can sit in several categories ("Field trip" AND "No school").
            # The first one is also written to `category`, which stays the event's
            # primary: it drives the colour and the per-category ICS feeds.
            seen, cats = set(), []
            for c in (v or []):
                label = sanitize_text(str(c or '')).strip()
                if label and label.lower() not in seen:
                    seen.add(label.lower())
                    cats.append(label)
            fields['categories'] = cats[:MAX_CATEGORIES]
            fields['category'] = fields['categories'][0] if fields['categories'] else None
        elif k in ('title', 'description', 'location', 'category'):
            # Text fields are rendered AS TEXT (React escapes; ICS has its own
            # escaper), so store raw — html-escaping here shows entities literally
            # and double-escapes on re-save ("&amp;amp"). See sanitize_text docs.
            fields[k] = sanitize_text(str(v or '')).strip() or None
        elif v is None:
            # An explicit null must STAY null: str(None) is the string "None",
            # which Postgres rejects as a timestamp. This made any event without
            # an end time — including every all-day event — impossible to save.
            fields[k] = None
        else:  # start_at / end_at — ISO timestamps (Postgres validates)
            fields[k] = str(v).strip() or None
    # A caller that only knows about the single `category` (an older client, the
    # ICS importer) still gets a consistent array — the two never disagree.
    if 'category' in fields and 'categories' not in fields:
        fields['categories'] = [fields['category']] if fields['category'] else []
    return fields


@bp.route('/events/<event_id>/rsvps', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_event_rsvps(user_id, event_id):
    """Who has said they are coming — the office's headcount (9cf78e9a)."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    from services import sis_event_rsvp_service as rsvps
    if not rsvps.get_event(org_id, event_id):
        return jsonify({'success': False, 'error': 'Event not found'}), 404
    rows = rsvps.rsvps_for(org_id, event_id)
    coming = [r for r in rows if r.get('attending')]
    return jsonify({
        'success': True,
        'rsvps': rows,
        'families': len(coming),
        'people': sum(r.get('party_size') or 1 for r in coming),
    })


def _org_calendar_settings(org_id):
    """(feature_flags, sis_settings) for the org — calendar categories live here.
    The feed TOKEN does not: it is a credential and lives in organization_secrets."""
    # admin client justified: reads organizations.feature_flags for calendar settings; callers are staff-gated routes with org_id already resolved
    org = (get_supabase_admin_client().table('organizations')
           .select('feature_flags').eq('id', org_id).single().execute()).data or {}
    flags = org.get('feature_flags') or {}
    return flags, (flags.get('sis_settings') or {})


@bp.route('/events', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_events(user_id):
    """Org events, optionally windowed with ?from=ISO&to=ISO. The window keeps
    any event that OVERLAPS it (a multi-day event that starts before the window
    still shows), and the response carries the org's category list so the
    calendar UI needs a single request."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    # One reader, one audience rule: admins see everything; teachers and
    # coordinators see school and teacher events, never admin-only ones.
    # (Families use a separate endpoint, through the same reader.)
    try:
        rows = events.list_events(
            org_id, events.viewer_for_user(user_id),
            from_iso=request.args.get('from') or None, to_iso=request.args.get('to') or None)
    except PostgrestFilterError:
        return jsonify({'error': 'from must be an ISO-8601 date or timestamp'}), 400
    # How many have said yes, on the events that asked. The office plans the
    # event on this grid, so the headcount belongs here rather than on a screen
    # somebody has to know to open (9cf78e9a). One query for the whole month.
    from services import sis_event_rsvp_service as rsvp_service
    asked = [e['id'] for e in rows if e.get('rsvp_enabled')]
    counts = rsvp_service.summary_for(org_id, asked)
    for e in rows:
        if e.get('rsvp_enabled'):
            e['rsvp_summary'] = counts.get(e['id']) or {'families': 0, 'people': 0}
    _, settings = _org_calendar_settings(org_id)
    return jsonify({'success': True, 'events': rows,
                    'categories': settings.get('calendar_categories') or []})


@bp.route('/events', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_event(user_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    fields = _clean(request.json or {})
    if not fields.get('title'):
        return jsonify({'success': False, 'error': 'A title is required'}), 400
    if not fields.get('start_at'):
        return jsonify({'success': False, 'error': 'A start date/time is required'}), 400
    try:
        row = events.create_event(org_id, user_id, fields)
    except Exception as e:  # noqa: BLE001
        logger.error(f'sis_events: create failed: {e}')
        return jsonify({'success': False, 'error': 'Could not create the event — check the dates'}), 400
    return jsonify({'success': True, 'event': row}), 201


@bp.route('/events/<event_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_event(user_id, event_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    if not events.get_event(org_id, event_id):
        return jsonify({'success': False, 'error': 'Event not found'}), 404
    fields = _clean(request.json or {})
    if 'title' in fields and not fields['title']:
        return jsonify({'success': False, 'error': 'A title is required'}), 400
    if not fields:
        return jsonify({'success': False, 'error': 'Nothing to update'}), 400
    try:
        row = events.update_event(org_id, event_id, fields)
    except Exception as e:  # noqa: BLE001
        logger.error(f'sis_events: update failed for {event_id}: {e}')
        return jsonify({'success': False, 'error': 'Could not update the event — check the dates'}), 400
    return jsonify({'success': True, 'event': row})


@bp.route('/events/<event_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_event(user_id, event_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    if not events.delete_event(org_id, event_id):
        return jsonify({'success': False, 'error': 'Event not found'}), 404
    return jsonify({'success': True})


# ── ICS feed — subscribe from Google Calendar / Outlook / iPhone ─────────────
# The feed is a public GET (calendar apps can't authenticate), protected by a
# per-org random token stored in organization_secrets (name='calendar_feed_token').
# Staff fetch the subscribe URLs (token generated lazily) from /events/feed.

def _ics_escape(v):
    return (str(v or '').replace('\\', '\\\\').replace(';', '\\;')
            .replace(',', '\\,').replace('\r\n', '\\n').replace('\n', '\\n'))


def _ics_stamp(iso, all_day, end=False):
    """Wall-clock ICS stamp from our stored ISO string (no timezone math).
    All-day events use VALUE=DATE; the DTEND date is exclusive per RFC 5545."""
    from datetime import date, timedelta
    s = str(iso or '')
    if all_day:
        d = date.fromisoformat(s[:10])
        if end:
            d = d + timedelta(days=1)
        return d.strftime('%Y%m%d')
    return f"{s[:10].replace('-', '')}T{(s[11:19] or '00:00:00').replace(':', '')}"


def build_ics(org_name, events):
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0',
             'PRODID:-//Optio//SIS Calendar//EN', 'CALSCALE:GREGORIAN',
             f'X-WR-CALNAME:{_ics_escape(org_name)}']
    for e in events:
        all_day = bool(e.get('all_day'))
        start = e.get('start_at')
        if not start:
            continue
        # For all-day, the exclusive DTEND is the day AFTER the last day.
        end = e.get('end_at') or (start if all_day else None)
        lines += ['BEGIN:VEVENT',
                  f"UID:{e['id']}@optioeducation.com",
                  f"DTSTAMP:{_ics_stamp(e.get('updated_at') or e.get('created_at') or start, False)}Z",
                  (f'DTSTART;VALUE=DATE:{_ics_stamp(start, True)}' if all_day
                   else f'DTSTART:{_ics_stamp(start, False)}'),
                  ]
        if end:
            lines.append(f'DTEND;VALUE=DATE:{_ics_stamp(end, True, end=True)}' if all_day
                         else f'DTEND:{_ics_stamp(end, False)}')
        lines.append(f"SUMMARY:{_ics_escape(e.get('title'))}")
        if e.get('description'):
            lines.append(f"DESCRIPTION:{_ics_escape(e['description'])}")
        if e.get('location'):
            lines.append(f"LOCATION:{_ics_escape(e['location'])}")
        cats = e.get('categories') or ([e['category']] if e.get('category') else [])
        if cats:
            lines.append('CATEGORIES:' + ','.join(_ics_escape(c) for c in cats))
        lines.append('END:VEVENT')
    lines.append('END:VCALENDAR')
    return '\r\n'.join(lines) + '\r\n'


@bp.route('/events/feed', methods=['GET'])
@require_role(*STAFF_ROLES)
def feed_info(user_id):
    """Subscribe URLs for the org's calendar feed (token generated on first use)."""
    import secrets
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    from utils.org_secrets import get_org_secret, set_org_secret, CALENDAR_FEED_TOKEN
    _, settings = _org_calendar_settings(org_id)
    # The token is the ONLY credential on the public .ics feed, so it lives in
    # organization_secrets rather than feature_flags -- the latter is anon-readable
    # by row policy and echoed to clients, which leaked this token (AUDIT.md C1).
    token = get_org_secret(org_id, CALENDAR_FEED_TOKEN)
    if not token:
        token = secrets.token_urlsafe(24)
        set_org_secret(org_id, CALENDAR_FEED_TOKEN, token, updated_by=user_id)
    base = request.host_url.rstrip('/')
    url = f'{base}/api/sis/calendar/{org_id}.ics?token={token}'
    categories = settings.get('calendar_categories') or []
    return jsonify({'success': True, 'feed_url': url,
                    'category_feeds': [
                        {'category': c, 'url': f'{url}&category={c}'} for c in categories
                    ]})


@bp.route('/calendar/<org_id>.ics', methods=['GET'])
def calendar_ics(org_id):
    """Public tokenized ICS feed. Calendar apps poll this URL — no auth cookies,
    so access is the per-org token alone. Optional ?category= narrows the feed."""
    import secrets as _secrets
    token = (request.args.get('token') or '').strip()
    from utils.org_secrets import (get_org_secret, CALENDAR_FEED_TOKEN,
                                   CALENDAR_FEED_TOKEN_FAMILY)
    # admin client justified: public unauthenticated ICS feed (calendar apps can't log in); access is enforced by the per-org token compare below
    org = (get_supabase_admin_client().table('organizations')
           .select('name, feature_flags').eq('id', org_id).single().execute()).data
    if not org:
        return 'Not found', 404

    def _match(name):
        expected = get_org_secret(org_id, name)
        return bool(expected and token and _secrets.compare_digest(str(expected), token))

    # Two tokens open this feed: the staff one (school + teacher events) and the
    # family one (school events only — the same rule the in-app calendar
    # enforces). Which token arrived decides how much the feed shows.
    is_staff_token = _match(CALENDAR_FEED_TOKEN)
    if not is_staff_token and not _match(CALENDAR_FEED_TOKEN_FAMILY):
        return 'Not authorized', 403
    # The token can be shared, so the feed never carries an admins-only event;
    # the family token narrows to school events (the same rule the in-app
    # calendar enforces, from the same reader).
    rows = events.list_events(org_id, 'shared' if is_staff_token else 'family')
    # A per-category feed keeps every event that CARRIES that category, not only
    # the ones where it happens to be primary.
    wanted = (request.args.get('category') or '').strip()
    if wanted:
        rows = [e for e in rows
                if wanted in (e.get('categories') or [])
                or e.get('category') == wanted]
    from flask import Response
    return Response(build_ics(org.get('name') or 'School calendar', rows),
                    mimetype='text/calendar',
                    headers={'Content-Disposition': 'inline; filename=calendar.ics',
                             'Cache-Control': 'public, max-age=300'})
