"""
Public embeddable widget endpoints (prefix /api/embed).

PUBLIC / UNAUTHENTICATED by design: an org's class catalog and weekly schedule
are already public on their marketing site, so these endpoints let that org drop
a live, org-scoped-by-slug widget onto an external website (e.g. iCreate embeds
its catalog + schedule on icreatecollab.com via an <iframe>).

Hard rules for this surface:
- NO student PII is ever returned — only class-level catalog info (name, teacher
  name, schedule, ages, price, seat availability). Enrollment/waitlist are exposed
  only as aggregate counts, never as identities.
- Org scoping is resolved from the URL slug; there is no auth context to trust.
- Permissive CORS (`Access-Control-Allow-Origin: *`, GET/OPTIONS) so any external
  site can fetch the JSON. `@cross_origin` also marks the response CORS-evaluated,
  so the app-wide credentialed Flask-CORS layer skips it (no duplicate headers).

Read assembly reuses services.sis_catalog_service.list_classes (the same composed
read the SIS console uses) and then strips it down to the public-safe fields.
"""

from flask import Blueprint, jsonify
from flask_cors import cross_origin

from database import get_supabase_admin_client
from services import sis_catalog_service as catalog
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('embed', __name__, url_prefix='/api/embed')

# Public responses may be cached by the browser / CDN for a short window — the
# catalog changes infrequently and this is read-only public data.
_CACHE_CONTROL = 'public, max-age=300'

# 0=Sunday .. 6=Saturday (matches JS Date.getDay and the class_meetings.day_of_week
# convention). Marketing grids read Monday-first, so order days Mon..Sat then Sun.
_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]


def _resolve_org_id(org_slug):
    """The org id for an active org matching this slug (case-insensitive), or None."""
    if not org_slug:
        return None
    rows = (
        get_supabase_admin_client().table('organizations')
        .select('id, is_active')
        .ilike('slug', org_slug)
        .limit(1)
        .execute()
    ).data or []
    if not rows or rows[0].get('is_active') is False:
        return None
    return rows[0]['id']


def _hhmm(value):
    """"13:00:00" -> "13:00"; passes through empty/None. Frontend renders am/pm."""
    if not value:
        return None
    return str(value)[:5]


def _to_dollars(cents):
    """Integer cents -> a dollars number (365.0), or None when unset."""
    if cents is None:
        return None
    try:
        return round(int(cents) / 100, 2)
    except (TypeError, ValueError):
        return None


def _to_number(value):
    """supply_fee arrives as a numeric string ("35.00"); normalize to a float or None."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _public_class(c):
    """Strip an assembled SIS class down to public, PII-free catalog fields."""
    meetings = c.get('meetings') or []
    dated = [m for m in meetings if m.get('day_of_week') is not None]
    days = sorted({m['day_of_week'] for m in dated})

    # A class can meet more than once; represent the catalog row by its earliest
    # meeting time (marketing widget — a single representative time is enough).
    start_time = end_time = None
    if dated:
        primary = min(dated, key=lambda m: (m.get('start_time') or ''))
        start_time = _hhmm(primary.get('start_time'))
        end_time = _hhmm(primary.get('end_time'))

    time_label = f"{start_time}-{end_time}" if start_time and end_time else (start_time or None)

    instructor = c.get('primary_instructor') or {}
    capacity = c.get('capacity')

    return {
        'id': c.get('id'),
        'name': c.get('name'),
        'teacher_name': instructor.get('name'),
        'days': days,
        'time_label': time_label,
        'start_time': start_time,
        'end_time': end_time,
        'min_age': c.get('min_age'),
        'max_age': c.get('max_age'),
        'description': c.get('description'),
        'supply_fee': _to_number(c.get('supply_fee')),
        'tuition': _to_dollars(c.get('price_cents')),
        'capacity': capacity,
        'enrolled_count': c.get('enrolled_count', 0),
        # spots_left is already max(capacity - enrolled, 0), or None when unlimited.
        'open_seats': c.get('spots_left'),
        'waitlist_count': c.get('waitlist_count', 0),
        'location': c.get('location'),
    }


def _public_classes(org_id):
    """All active, non-archived classes for the org as public catalog dicts."""
    classes = catalog.list_classes(org_id, include_archived=False)
    return [_public_class(c) for c in classes]


def _with_cors_cache(payload, status=200):
    resp = jsonify(payload)
    resp.headers['Cache-Control'] = _CACHE_CONTROL
    return resp, status


@bp.route('/<org_slug>/catalog', methods=['GET', 'OPTIONS'])
@cross_origin(origins='*', methods=['GET', 'OPTIONS'])
def catalog_widget(org_slug):
    """Public class catalog for an org (by slug). Active, non-archived classes."""
    org_id = _resolve_org_id(org_slug)
    if not org_id:
        return jsonify({'error': 'Organization not found'}), 404
    try:
        classes = _public_classes(org_id)
    except Exception:
        logger.exception("embed catalog failed for slug=%s", org_slug)
        return jsonify({'error': 'Failed to load catalog'}), 500
    return _with_cors_cache({'classes': classes})


@bp.route('/<org_slug>/schedule', methods=['GET', 'OPTIONS'])
@cross_origin(origins='*', methods=['GET', 'OPTIONS'])
def schedule_widget(org_slug):
    """Public weekly schedule for an org (by slug): classes that have recurring
    meetings, grouped by day_of_week then start_time. Only classes with meetings."""
    org_id = _resolve_org_id(org_slug)
    if not org_id:
        return jsonify({'error': 'Organization not found'}), 404
    try:
        classes = _public_classes(org_id)
    except Exception:
        logger.exception("embed schedule failed for slug=%s", org_slug)
        return jsonify({'error': 'Failed to load schedule'}), 500

    # Build day -> sessions. Only classes that actually meet on a weekday appear.
    by_day = {d: [] for d in _DAY_ORDER}
    for c in classes:
        for d in (c.get('days') or []):
            if d in by_day:
                by_day[d].append(c)

    days = []
    for d in _DAY_ORDER:
        sessions = sorted(by_day[d], key=lambda c: (c.get('start_time') or ''))
        if not sessions:
            continue
        days.append({
            'day_of_week': d,
            'day_name': _DAY_NAMES[d],
            'sessions': sessions,
        })

    return _with_cors_cache({'days': days})
