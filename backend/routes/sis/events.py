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

EVENT_FIELDS = ('title', 'description', 'location', 'start_at', 'end_at', 'all_day')


def _clean(data):
    """Whitelist + sanitize an event payload; returns (fields, error_message)."""
    fields = {}
    for k in EVENT_FIELDS:
        if k not in data:
            continue
        v = data[k]
        if k == 'all_day':
            fields[k] = bool(v)
        elif k in ('title', 'description', 'location'):
            fields[k] = sanitize_input(str(v or '')).strip() or None
        else:  # start_at / end_at — ISO timestamps (Postgres validates)
            fields[k] = str(v).strip() or None
    return fields


@bp.route('/events', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_events(user_id):
    """Org events, optionally windowed with ?from=ISO&to=ISO (on start_at)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    q = (get_supabase_admin_client().table('sis_events').select('*')
         .eq('organization_id', org_id))
    if request.args.get('from'):
        q = q.gte('start_at', request.args['from'])
    if request.args.get('to'):
        q = q.lt('start_at', request.args['to'])
    rows = (q.order('start_at').execute()).data or []
    return jsonify({'success': True, 'events': rows})


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
