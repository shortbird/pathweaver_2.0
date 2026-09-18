"""Messaging several staff at once from the SIS console.

ADMIN_ROLES: this is the office writing to its teachers. A teacher who wants a
group already has one -- their class chats, and the "New group" button in the
learning app -- so nothing is taken away here; what is added is the set of
presets only the office has a use for ("everyone teaching Thursday").

The service (services/sis_messaging_service.py) explains the two modes and why
these messages are sent by the staff member personally rather than by the
school-inbox account.

Families are the other half (services/sis_family_messaging_service.py): the
audience is a set of students -- everyone, one class, an age range -- and the
recipients are their guardians, each in a private thread from the school, so
replies land in the School Inbox and no family sees another.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_family_messaging_service as families
from services import sis_messaging_service as messaging
from utils.sis_roles import ADMIN_ROLES

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


@bp.route('/compose', methods=['POST'])
@require_role(*ADMIN_ROLES)
def compose(user_id):
    """Send to several staff: one group thread, or one DM each.

    Body: {recipient_ids: [], group_keys: [], mode: 'group'|'separate',
           subject?, body, name?, attachments?}
    """
    org_id, err = sis_service.org_or_error(user_id)
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


def _int_arg(name):
    """An optional whole-number query arg, or None; anything else is a 400."""
    raw = (request.args.get(name) or '').strip()
    if not raw:
        return None
    if not raw.isdigit() or int(raw) > 120:
        raise ValueError(f'{name} has to be a whole number of years')
    return int(raw)


@bp.route('/family-audience', methods=['GET'])
@require_role(*ADMIN_ROLES)
def family_audience(user_id):
    """The guardians a family message would reach, for a filter.

    ?class_id= narrows to one class's students; ?age_min= and ?age_max= to an
    age range (the SIS's one age, as of the first day of school). The class
    list rides along for the picker so the composer is one request per filter.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    try:
        result = families.family_audience(
            org_id,
            class_id=(request.args.get('class_id') or '').strip() or None,
            age_min=_int_arg('age_min'), age_max=_int_arg('age_max'),
        )
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    return jsonify({'success': True, **result})


@bp.route('/compose-families', methods=['POST'])
@require_role(*ADMIN_ROLES)
def compose_families(user_id):
    """One private message from the school to each guardian named.

    Body: {recipient_ids: [], subject?, body, attachments?, email?: bool}.
    No mode: families never share a thread.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    try:
        result = families.compose(
            org_id, user_id,
            body=data.get('body') or '',
            recipient_ids=data.get('recipient_ids') or [],
            subject=data.get('subject'),
            attachments=data.get('attachments') or [],
            email=bool(data.get('email')),
        )
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:  # noqa: BLE001
        logger.error(f'family compose failed for org {str(org_id)[:8]}: {e}',
                     exc_info=True)
        return jsonify({'success': False, 'error': 'Could not send the message'}), 500
    return jsonify({'success': True, **result})
