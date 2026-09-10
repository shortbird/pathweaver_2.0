"""Attaching files, links and videos to a quest and to its individual tasks.

Who may write: an org admin of the quest's own org, or a teacher who moderates a
class the quest is attached to. That is the same gate class_quests.py applies to
editing the quest's tasks -- attaching a worksheet to a task is the same act as
writing the task, so it should not be a different permission.

Who may read: anyone who may read the quest. Students and their guardians get
these inside the quest detail payload (routes/quest/detail.py) rather than here;
this GET is for the editor.

`quest_id` is not one of the ID_PARAMS names, so no relationship decorator is
required (tests/unit/test_id_routes_declare_relationship.py) -- a quest is not a
person and the gate below is per-quest, not per-student.
"""

from flask import Blueprint, request, jsonify

from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.logger import get_logger
from services import quest_resource_service as resources

logger = get_logger(__name__)

bp = Blueprint('sis_quest_resources', __name__, url_prefix='/api/sis/quests')


def _load_quest(admin, quest_id):
    rows = (admin.table('quests').select('id, organization_id, title')
            .eq('id', quest_id).limit(1).execute()).data
    return rows[0] if rows else None


def _authorize(user_id, quest_id):
    """(quest, admin, None) for someone who may edit, else (None, None, err)."""
    # admin client justified: loads the quest and runs the per-quest editor gate
    # over deny-all-RLS tables before any resource is written.
    admin = get_supabase_admin_client()
    quest = _load_quest(admin, quest_id)
    if not quest:
        return None, None, (jsonify({'success': False, 'error': 'Quest not found'}), 404)
    if not resources.can_edit_quest(user_id, quest, admin=admin):
        return None, None, (jsonify({'success': False, 'error': 'Not allowed'}), 403)
    return quest, admin, None


@bp.route('/<quest_id>/resources', methods=['GET'])
@require_auth
def list_resources(user_id, quest_id):
    """Everything attached to this quest, grouped by task. Editors only."""
    quest, admin, err = _authorize(user_id, quest_id)
    if err:
        return err
    return jsonify({'success': True, **resources.list_for_quest(quest['id'], admin=admin)})


@bp.route('/<quest_id>/resources', methods=['POST'])
@require_auth
def add_resource(user_id, quest_id):
    """Attach a link or a video. Body: {task_id?, kind, title, url}."""
    quest, admin, err = _authorize(user_id, quest_id)
    if err:
        return err
    data = request.get_json() or {}
    try:
        row = resources.add_link(
            quest,
            task_id=data.get('task_id'),
            kind=(data.get('kind') or 'link'),
            title=data.get('title') or '',
            url=data.get('url') or '',
            user_id=user_id,
            admin=admin,
        )
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:  # noqa: BLE001
        logger.error(f'quest resource add failed for {quest_id}: {e}', exc_info=True)
        return jsonify({'success': False, 'error': 'Could not attach that'}), 500
    return jsonify({'success': True, 'resource': row})


@bp.route('/<quest_id>/resources/upload', methods=['POST'])
@require_auth
def upload_resource(user_id, quest_id):
    """Attach an uploaded document. Multipart: file, title?, task_id?."""
    quest, admin, err = _authorize(user_id, quest_id)
    if err:
        return err
    file = request.files.get('file')
    if not file:
        return jsonify({'success': False, 'error': 'No file was sent'}), 400
    try:
        row = resources.upload(
            quest,
            task_id=request.form.get('task_id') or None,
            file=file,
            title=request.form.get('title') or '',
            user_id=user_id,
            admin=admin,
        )
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:  # noqa: BLE001
        logger.error(f'quest resource upload failed for {quest_id}: {e}', exc_info=True)
        return jsonify({'success': False, 'error': 'Could not upload that file'}), 500
    return jsonify({'success': True, 'resource': row})


@bp.route('/<quest_id>/resources/<resource_id>', methods=['DELETE'])
@require_auth
def delete_resource(user_id, quest_id, resource_id):
    quest, admin, err = _authorize(user_id, quest_id)
    if err:
        return err
    if not resources.remove(quest['id'], resource_id, admin=admin):
        return jsonify({'success': False, 'error': 'Not found'}), 404
    return jsonify({'success': True})


@bp.route('/<quest_id>/resources/order', methods=['PATCH'])
@require_auth
def reorder_resources(user_id, quest_id):
    """Body: {task_id?, ordered_ids: []}. Every write carries a body (CSRF)."""
    quest, admin, err = _authorize(user_id, quest_id)
    if err:
        return err
    data = request.get_json() or {}
    moved = resources.reorder(quest['id'], data.get('task_id'),
                              data.get('ordered_ids') or [], admin=admin)
    return jsonify({'success': True, 'reordered': moved})
