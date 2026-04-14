"""Task CRUD endpoints (update + drop).

Split from ``routes/tasks.py`` on 2026-04-14.
"""

from datetime import datetime

from flask import jsonify, request

from database import get_supabase_admin_client
from repositories.base_repository import NotFoundError
from routes.tasks import bp
from utils.auth.decorators import require_auth
from utils.logger import get_logger

logger = get_logger(__name__)


@bp.route('/<task_id>', methods=['PUT'])
@require_auth
def update_task(user_id: str, task_id: str):
    """
    Update a task's details (title, description, pillar, xp_value, evidence_prompt).

    Permission check:
    - Superadmins can edit any task
    - Users can edit tasks they created (user_id matches)
    - Org admins/advisors can edit tasks in quests belonging to their organization
    """
    try:
        from repositories.task_repository import TaskRepository
        from utils.roles import get_effective_role
        from utils.pillar_utils import is_valid_pillar

        # admin client justified: task reads scoped to caller (self) under @require_auth
        supabase = get_supabase_admin_client()
        task_repo = TaskRepository()

        # Get task data
        try:
            task_data = task_repo.find_by_id(task_id)
        except NotFoundError:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404

        if not task_data:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404

        # Get user data for permission check
        user_result = supabase.table('users')\
            .select('role, org_role, organization_id')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user_result.data:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404

        user = user_result.data
        user_role = get_effective_role(user)
        user_org = user.get('organization_id')

        # Check permission to edit this task
        can_edit = False

        if user_role == 'superadmin':
            can_edit = True
        elif task_data.get('user_id') == user_id:
            can_edit = True
        elif user_role in ('org_admin', 'advisor') and user_org:
            # Org admin/advisor can edit tasks in their organization's quests
            quest_id = task_data.get('quest_id')
            if quest_id:
                quest_result = supabase.table('quests')\
                    .select('organization_id')\
                    .eq('id', quest_id)\
                    .single()\
                    .execute()

                if quest_result.data:
                    quest_org = quest_result.data.get('organization_id')
                    if quest_org == user_org:
                        can_edit = True

        if not can_edit:
            logger.warning(f"User {user_id} denied permission to edit task {task_id}")
            return jsonify({
                'success': False,
                'error': 'You do not have permission to edit this task'
            }), 403

        # Get and validate update data
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400

        # Build update payload with only allowed fields
        update_payload = {}

        if 'title' in data:
            title = data['title'].strip() if data['title'] else ''
            if not title:
                return jsonify({
                    'success': False,
                    'error': 'Task title cannot be empty'
                }), 400
            update_payload['title'] = title

        if 'description' in data:
            update_payload['description'] = data['description'].strip() if data['description'] else ''

        if 'pillar' in data:
            pillar = data['pillar'].lower().strip() if data['pillar'] else 'stem'
            if not is_valid_pillar(pillar):
                return jsonify({
                    'success': False,
                    'error': f'Invalid pillar: {pillar}. Valid pillars are: stem, wellness, communication, civics, art'
                }), 400
            update_payload['pillar'] = pillar

        if 'xp_value' in data:
            try:
                xp_value = int(data['xp_value'])
                if xp_value < 1 or xp_value > 1000:
                    return jsonify({
                        'success': False,
                        'error': 'XP value must be between 1 and 1000'
                    }), 400
                update_payload['xp_value'] = xp_value
            except (ValueError, TypeError):
                return jsonify({
                    'success': False,
                    'error': 'XP value must be a valid number'
                }), 400

        if 'is_required' in data:
            update_payload['is_required'] = bool(data['is_required'])

        if not update_payload:
            return jsonify({
                'success': False,
                'error': 'No valid fields to update'
            }), 400

        update_payload['updated_at'] = datetime.utcnow().isoformat()

        result = supabase.table('user_quest_tasks')\
            .update(update_payload)\
            .eq('id', task_id)\
            .execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to update task'
            }), 500

        updated_task = result.data[0]
        logger.info(f"User {user_id} updated task {task_id}: {list(update_payload.keys())}")

        return jsonify({
            'success': True,
            'task': updated_task,
            'message': 'Task updated successfully'
        }), 200

    except Exception as e:
        logger.error(f"Error updating task {task_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update task'
        }), 500


@bp.route('/<task_id>', methods=['DELETE'])
@require_auth
def drop_task(user_id: str, task_id: str):
    """
    Drop/remove a task from user's active quest.
    Allows users to deactivate tasks and re-add them later from the task library.
    """
    try:
        from repositories.task_repository import TaskRepository, TaskCompletionRepository
        task_repo = TaskRepository()
        completion_repo = TaskCompletionRepository()

        # Verify task belongs to user
        try:
            task_data = task_repo.find_by_id(task_id)
            if not task_data or task_data.get('user_id') != user_id:
                logger.warning(f"Task {task_id} not found for user {user_id}")
                return jsonify({
                    'success': False,
                    'error': 'Task not found or not owned by you'
                }), 404
        except NotFoundError:
            logger.warning(f"Task {task_id} not found for user {user_id}")
            return jsonify({
                'success': False,
                'error': 'Task not found or not owned by you'
            }), 404

        # Check if task is already completed
        if completion_repo.check_existing_completion(user_id, task_id):
            logger.warning(f"Cannot drop completed task {task_id} for user {user_id}")
            return jsonify({
                'success': False,
                'error': 'Cannot remove completed tasks'
            }), 400

        logger.info(f"Deleting task {task_id} ({task_data['title']}) for user {user_id}")
        task_repo.delete_task(task_id)

        logger.info(f"User {user_id} dropped task {task_id} ({task_data['title']}) from quest {task_data['quest_id']}")

        return jsonify({
            'success': True,
            'message': f"Task '{task_data['title']}' removed from your quest"
        }), 200

    except Exception as e:
        logger.error(f"Error dropping task {task_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to remove task'
        }), 500
