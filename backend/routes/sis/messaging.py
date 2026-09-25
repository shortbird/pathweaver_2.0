"""Messaging several staff at once from the SIS console.

ADMIN_ROLES: this is the office writing to its teachers. A teacher who wants a
group already has one -- their class chats, and the "New group" button in the
learning app -- so nothing is taken away here; what is added is the set of
presets only the office has a use for ("everyone teaching Thursday").

The service (services/sis_messaging_service.py) explains the two modes and why
these messages are sent by the staff member personally rather than by the
school-inbox account.

Since 2026-09-23 (iCreate, bf8b754d / 8ee000b6 / 9b46c748) the console has ONE
Compose (services/message_compose_service.py): staff, families and students in
one picker, one send, push and email as toggles, and every send recorded so the
Sent view can say who read it. The staff-only /compose, and the families-only
/family-audience and /compose-families, went with the two composers that called
them. /recipients stays: the announcement composer's "only some staff" picker
reads it.

/audience and /send are STAFF_ROLES since 2026-09-25: a teacher composes too,
to staff and to their own classes' students and families, always in their own
name (message_compose_service explains the narrower rules).
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import message_compose_service as compose_service
from services import sis_messaging_service as messaging
from utils.sis_roles import ADMIN_ROLES, STAFF_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_messaging', __name__, url_prefix='/api/sis/messaging')


@bp.route('/recipients', methods=['GET'])
@require_role(*ADMIN_ROLES)
def recipients(user_id):
    """Who can be messaged, and the named sets worth one click.

    Preset member ids come back with the list so the composer can show a count
    and let one person be removed before sending -- "all teachers except Sam" is
    the common case.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    return jsonify({
        'success': True,
        'people': messaging.staff_recipients(org_id),
        'presets': messaging.preset_groups(org_id),
    })


@bp.route('/audience', methods=['GET'])
@require_role(*STAFF_ROLES)
def audience(user_id):
    """Everybody Compose can write to, with the class split (teachers, aides,
    students) and the staff quick picks. The client filters by role, class and
    age over this one answer. A teacher gets their own audience."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    teacher_id = None if sis_service.caller_is_admin(user_id) else user_id
    return jsonify({'success': True, **compose_service.audience(org_id, teacher_id=teacher_id)})


@bp.route('/send', methods=['POST'])
@require_role(*STAFF_ROLES)
def send(user_id):
    """One Compose send.

    Body: {recipient_ids: [], body, subject?, mode: 'group'|'separate',
           name?, push?: bool (default true), email?: bool, as_school?: bool,
           attachments?}
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    recipient_ids = data.get('recipient_ids') or []
    if not isinstance(recipient_ids, list):
        return jsonify({'success': False, 'error': 'recipient_ids has to be a list'}), 400
    try:
        result = compose_service.compose(
            org_id, user_id,
            body=data.get('body') or '',
            recipient_ids=recipient_ids,
            mode=(data.get('mode') or 'separate'),
            subject=data.get('subject'),
            name=data.get('name'),
            # Push is on unless the sender turned it off; email is off unless
            # they turned it on (a send is an app message first).
            push=data.get('push') is not False,
            email=data.get('email') is True,
            as_school=data.get('as_school') is True,
            attachments=data.get('attachments') or [],
            as_teacher=not sis_service.caller_is_admin(user_id),
        )
    except ValueError as e:
        # Everything the sender can fix: nobody chosen, a stranger in the list,
        # an empty body.
        return jsonify({'success': False, 'error': str(e)}), 400
    return jsonify({'success': True, **result})


@bp.route('/sends', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_sends(user_id):
    """Recent Compose sends, newest first, each with "read by N of M"."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    try:
        limit = max(1, min(int(request.args.get('limit', 30)), 100))
        offset = max(0, int(request.args.get('offset', 0)))
    except ValueError:
        return jsonify({'success': False, 'error': 'limit and offset have to be numbers'}), 400
    sends = compose_service.list_sends(org_id, limit=limit, offset=offset)
    return jsonify({'success': True, 'sends': sends})


@bp.route('/sends/<send_id>', methods=['GET'])
@require_role(*ADMIN_ROLES)
def send_detail(user_id, send_id):
    """One send with every recipient and when they read it. Scoped to the
    caller's org by the read itself."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    detail = compose_service.send_detail(org_id, send_id)
    if not detail:
        return jsonify({'success': False, 'error': 'Send not found'}), 404
    return jsonify({'success': True, 'send': detail})
