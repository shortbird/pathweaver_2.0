"""The school's Student Chat switch (org admin), at /api/messages/student-chat.

Split out of routes/direct_messages.py, which sits at the route-file size cap.
Ticket 81cc92e6; the rule itself lives in services/student_chat_service.py.
"""

from flask import Blueprint, request

from utils.api_response import error_response, success_response
from utils.auth.decorators import require_org_admin

bp = Blueprint('student_chat_settings', __name__, url_prefix='/api/messages')


def _switch_org_id(organization_id, is_superadmin, requested):
    """The org this switch call is about: the caller's own, or for a
    superadmin the one the console has selected."""
    return (requested if is_superadmin and requested else None) or organization_id


@bp.route('/student-chat/settings', methods=['GET'])
@require_org_admin
def get_student_chat_settings(user_id, organization_id, is_superadmin):
    """Is Student Chat on for this school? Org admins only: a campus
    coordinator's read is a 403 and the Settings card renders nothing.

    Ticket 81cc92e6, from Horizon: "An option to turn off in-app chat would
    help, because it can pull students away from their work and bury teacher
    feedback." A superadmin names the org with ?organization_id=.
    """
    from services import student_chat_service
    org_id = _switch_org_id(organization_id, is_superadmin,
                            request.args.get('organization_id'))
    if not org_id:
        return error_response('organization_id is required', status_code=400)
    return success_response(student_chat_service.settings(org_id))


@bp.route('/student-chat/settings', methods=['PUT'])
@require_org_admin
def put_student_chat_settings(user_id, organization_id, is_superadmin):
    """Body: {"enabled": bool}. Off hides class Student Chats and friend DMs
    from the school's students; nothing is deleted, and on brings them back."""
    from modules.toggle import ModuleChangeError
    from services import student_chat_service
    data = request.get_json(silent=True) or {}
    enabled = data.get('enabled')
    if not isinstance(enabled, bool):
        return error_response('enabled must be true or false', status_code=400,
                              error_code='validation_error')
    org_id = _switch_org_id(organization_id, is_superadmin, data.get('organization_id'))
    if not org_id:
        return error_response('organization_id is required', status_code=400)
    try:
        return success_response(
            student_chat_service.set_enabled(org_id, enabled, actor_id=user_id))
    except LookupError as e:
        return error_response(str(e), status_code=404, error_code='not_found')
    except ModuleChangeError as e:
        return error_response(e.message, status_code=e.status)
