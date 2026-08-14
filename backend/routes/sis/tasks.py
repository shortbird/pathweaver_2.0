"""
The unified task inbox — one endpoint answering "what does this person owe?".

Reads only. Every task in the response carries a `link` to the page that
completes it (a request to the forms queue, a checklist item or signature to
onboarding, an acknowledgment to the resource library), so this endpoint never
has to grow a write path that competes with the source's own.

The one exception is acknowledgments: reading a policy and ticking that you read
it is the entire interaction, and bouncing someone to another page to click one
button is worse than doing it here. The ack still goes through the same
sis_resource_acks row the resource library writes.

Deliberately NOT /api/sis/teacher/tasks — that rule already belongs to
routes/sis/staff_portal.py (the "requests assigned to me" list that fuels the
coordinator dashboard). Flask dispatches a duplicate rule to whichever blueprint
registered first and tells nobody, so the new surface gets its own path.
"""

from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_tasks_service as tasks
from database import get_supabase_admin_client
from utils.sis_roles import STAFF_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_tasks', __name__, url_prefix='/api/sis')


def _org_or_error(user_id):
    body = request.get_json(silent=True) or {}
    requested = request.args.get('organization_id') or body.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


@bp.route('/my-tasks', methods=['GET'])
@require_role(*STAFF_ROLES)
def my_tasks(user_id):
    """This staff member's inbox. Always the caller's own — there is no
    ?teacher_id preview here, because a task list is also a to-do list and
    reading someone else's is not a thing the console needs to do.

    ?include_done=1 keeps finished items in the list (the "show completed"
    toggle); by default they are counted and dropped.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    include_done = str(request.args.get('include_done', '')).lower() in ('1', 'true', 'yes')
    result = tasks.list_my_tasks(org_id, user_id, audience='staff',
                                 include_done=include_done)
    return jsonify({'success': True, **result})


@bp.route('/my-tasks/acknowledge', methods=['POST'])
@require_role(*STAFF_ROLES)
def acknowledge_resource(user_id):
    """Acknowledge a resource from the inbox.

    Writes the same sis_resource_acks row the resource library writes, stamped
    with the version acknowledged — an ack is for the version that was read, so
    re-versioning a policy re-opens the task for everyone.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    resource_id = (data.get('resource_id') or '').strip()
    if not resource_id:
        return jsonify({'success': False, 'error': 'resource_id is required'}), 400

    # admin client justified: org_resources + sis_resource_acks are service-role-only; gated by @require_role(STAFF_ROLES), resource confirmed in the caller's org below
    supabase = get_supabase_admin_client()
    rows = (supabase.table('org_resources').select('id, organization_id, version_date, audience, visible_to_roles')
            .eq('id', resource_id).limit(1).execute()).data or []
    resource = rows[0] if rows else None
    if not resource or resource.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Document not found'}), 404
    # Same visibility rule the library applies: a resource narrowed away from
    # this person is not one they can acknowledge.
    if not sis_service.filter_role_visible(user_id, [resource]):
        return jsonify({'success': False, 'error': 'Document not found'}), 404

    try:
        supabase.table('sis_resource_acks').upsert({
            'resource_id': resource_id,
            'user_id': user_id,
            'version_date': resource.get('version_date'),
            'acknowledged_at': datetime.now(timezone.utc).isoformat(),
        }, on_conflict='resource_id,user_id').execute()
    except Exception as e:
        logger.error(f'Resource acknowledgment failed for {resource_id}: {e}')
        return jsonify({'success': False, 'error': 'Could not record that'}), 500
    return jsonify({'success': True})
