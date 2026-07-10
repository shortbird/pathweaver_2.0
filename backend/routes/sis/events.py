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
from utils.validation import sanitize_input
from database import get_supabase_admin_client
from routes.sis import _org_or_error, STAFF_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_events', __name__, url_prefix='/api/sis')

EVENT_FIELDS = ('title', 'description', 'location', 'start_at', 'end_at', 'all_day', 'category')


def _clean(data):
    """Whitelist + sanitize an event payload; returns (fields, error_message)."""
    fields = {}
    for k in EVENT_FIELDS:
        if k not in data:
            continue
        v = data[k]
        if k == 'all_day':
            fields[k] = bool(v)
        elif k in ('title', 'description', 'location', 'category'):
            fields[k] = sanitize_input(str(v or '')).strip() or None
        elif v is None:
            # An explicit null must STAY null: str(None) is the string "None",
            # which Postgres rejects as a timestamp. This made any event without
            # an end time — including every all-day event — impossible to save.
            fields[k] = None
        else:  # start_at / end_at — ISO timestamps (Postgres validates)
            fields[k] = str(v).strip() or None
    return fields


def _org_calendar_settings(org_id):
    """(feature_flags, sis_settings) for the org — categories + feed token live here."""
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
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    q = (get_supabase_admin_client().table('sis_events').select('*')
         .eq('organization_id', org_id))
    if request.args.get('from'):
        f = request.args['from']
        q = q.or_(f'start_at.gte.{f},end_at.gte.{f}')
    if request.args.get('to'):
        q = q.lt('start_at', request.args['to'])
    rows = (q.order('start_at').execute()).data or []
    _, settings = _org_calendar_settings(org_id)
    return jsonify({'success': True, 'events': rows,
                    'categories': settings.get('calendar_categories') or []})


@bp.route('/events', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_event(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    fields = _clean(request.json or {})
    if not fields.get('title'):
        return jsonify({'success': False, 'error': 'A title is required'}), 400
    if not fields.get('start_at'):
        return jsonify({'success': False, 'error': 'A start date/time is required'}), 400
    fields.update({'organization_id': org_id, 'created_by': user_id})
    try:
        row = (get_supabase_admin_client().table('sis_events').insert(fields).execute()).data
    except Exception as e:  # noqa: BLE001
        logger.error(f'sis_events: create failed: {e}')
        return jsonify({'success': False, 'error': 'Could not create the event — check the dates'}), 400
    return jsonify({'success': True, 'event': row[0] if row else None}), 201


def _owned_event(event_id, org_id):
    rows = (get_supabase_admin_client().table('sis_events').select('id, organization_id')
            .eq('id', event_id).limit(1).execute()).data or []
    return rows[0] if rows and rows[0].get('organization_id') == org_id else None


@bp.route('/events/<event_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_event(user_id, event_id):
    from datetime import datetime
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not _owned_event(event_id, org_id):
        return jsonify({'success': False, 'error': 'Event not found'}), 404
    fields = _clean(request.json or {})
    if 'title' in fields and not fields['title']:
        return jsonify({'success': False, 'error': 'A title is required'}), 400
    if not fields:
        return jsonify({'success': False, 'error': 'Nothing to update'}), 400
    fields['updated_at'] = datetime.utcnow().isoformat()
    try:
        row = (get_supabase_admin_client().table('sis_events').update(fields)
               .eq('id', event_id).execute()).data
    except Exception as e:  # noqa: BLE001
        logger.error(f'sis_events: update failed for {event_id}: {e}')
        return jsonify({'success': False, 'error': 'Could not update the event — check the dates'}), 400
    return jsonify({'success': True, 'event': row[0] if row else None})


@bp.route('/events/<event_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def delete_event(user_id, event_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not _owned_event(event_id, org_id):
        return jsonify({'success': False, 'error': 'Event not found'}), 404
    get_supabase_admin_client().table('sis_events').delete().eq('id', event_id).execute()
    return jsonify({'success': True})


# ── ICS feed — subscribe from Google Calendar / Outlook / iPhone ─────────────
# The feed is a public GET (calendar apps can't authenticate), protected by a
# per-org random token stored in feature_flags.sis_settings.calendar_feed_token.
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
        if e.get('category'):
            lines.append(f"CATEGORIES:{_ics_escape(e['category'])}")
        lines.append('END:VEVENT')
    lines.append('END:VCALENDAR')
    return '\r\n'.join(lines) + '\r\n'


@bp.route('/events/feed', methods=['GET'])
@require_role(*STAFF_ROLES)
def feed_info(user_id):
    """Subscribe URLs for the org's calendar feed (token generated on first use)."""
    import secrets
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    flags, settings = _org_calendar_settings(org_id)
    token = settings.get('calendar_feed_token')
    if not token:
        token = secrets.token_urlsafe(24)
        get_supabase_admin_client().table('organizations').update({
            'feature_flags': {**flags,
                              'sis_settings': {**settings, 'calendar_feed_token': token}},
        }).eq('id', org_id).execute()
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
    org = (get_supabase_admin_client().table('organizations')
           .select('name, feature_flags').eq('id', org_id).single().execute()).data
    if not org:
        return 'Not found', 404
    settings = ((org.get('feature_flags') or {}).get('sis_settings') or {})
    expected = settings.get('calendar_feed_token')
    if not expected or not token or not _secrets.compare_digest(str(expected), token):
        return 'Not authorized', 403
    q = (get_supabase_admin_client().table('sis_events').select('*')
         .eq('organization_id', org_id))
    if request.args.get('category'):
        q = q.eq('category', request.args['category'])
    events = (q.order('start_at').execute()).data or []
    from flask import Response
    return Response(build_ics(org.get('name') or 'School calendar', events),
                    mimetype='text/calendar',
                    headers={'Content-Disposition': 'inline; filename=calendar.ics',
                             'Cache-Control': 'public, max-age=300'})
