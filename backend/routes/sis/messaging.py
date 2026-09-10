"""Messaging several staff at once from the SIS console.

ADMIN_ROLES: this is the office writing to its teachers. A teacher who wants a
group already has one -- their class chats, and the "New group" button in the
learning app -- so nothing is taken away here; what is added is the set of
presets only the office has a use for ("everyone teaching Thursday").

The service (services/sis_messaging_service.py) explains the two modes and why
these messages are sent by the staff member personally rather than by the
school-inbox account.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_messaging_service as messaging
from utils.sis_roles import ADMIN_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_messaging', __name__, url_prefix='/api/sis/messaging')


def _org(user_id):
    """(org_id, error_response). Superadmins must name the org."""
    org_id = sis_service.resolve_org_id(user_id, request.args.get('organization_id'))
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


@bp.route('/recipients', methods=['GET'])
@require_role(*ADMIN_ROLES)
def recipients(user_id):
    """Who can be messaged, and the named sets worth one click.

    Preset member ids come back with the list so the composer can show a count
    and let one person be removed before sending -- "all teachers except Sam" is
    the common case.
    """
    org_id, err = _org(user_id)
    if err:
        return err
    return jsonify({
        'success': True,
        'people': messaging.staff_recipients(org_id),
        'presets': messaging.preset_groups(org_id),
    })


@bp.route('/compose', methods=['POST'])
@require_role(*ADMIN_ROLES)
def compose(user_id):
    """Send to several staff: one group thread, or one DM each.

    Body: {recipient_ids: [], group_keys: [], mode: 'group'|'separate',
           subject?, body, name?, attachments?}
    """
    org_id, err = _org(user_id)
    if err:
        return err
    data = request.get_json() or {}
    try:
        result = messaging.compose(
            org_id, user_id,
            body=data.get('body') or '',
            recipient_ids=data.get('recipient_ids') or [],
            group_keys=data.get('group_keys') or [],
            mode=(data.get('mode') or 'group'),
            subject=data.get('subject'),
            name=data.get('name'),
            attachments=data.get('attachments') or [],
        )
    except ValueError as e:
        # Everything the sender can fix: no recipients, a stranger in the list,
        # an empty body, an unknown preset.
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:  # noqa: BLE001
        logger.error(f'staff compose failed for org {str(org_id)[:8]}: {e}',
                     exc_info=True)
        return jsonify({'success': False, 'error': 'Could not send the message'}), 500
    return jsonify({'success': True, **result})
