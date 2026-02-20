"""
Family Quests API routes.
Allows parents to create quests and assign them to multiple children at once.

Endpoints:
- POST /api/family/quests/create - Create a quest as a parent
- PUT /api/family/quests/<quest_id>/template-tasks - Save template tasks for a family quest
- POST /api/family/quests/<quest_id>/enroll-children - Enroll selected children in a quest
"""
from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from routes.dependents import verify_parent_role
from utils.auth.decorators import require_auth
from utils.pillar_utils import is_valid_pillar, normalize_pillar_name
from services.image_service import search_quest_image
from datetime import datetime, timezone
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('family_quests', __name__, url_prefix='/api/family')


def verify_parent_has_access_to_child(parent_id: str, child_id: str) -> bool:
    """
    Check if a parent has access to a child via:
    1. managed_by_parent_id (dependent under 13)
    2. parent_student_links with approved status (linked 13+ student)
    """
    supabase = get_supabase_admin_client()

    # Check managed_by_parent_id
    dependent = supabase.table('users').select('id').eq('id', child_id).eq('managed_by_parent_id', parent_id).execute()
    if dependent.data:
        return True

    # Check parent_student_links
    link = supabase.table('parent_student_links').select('id').eq(
        'parent_user_id', parent_id
    ).eq('student_user_id', child_id).eq('status', 'approved').execute()
    if link.data:
        return True

    return False


@bp.route('/quests/create', methods=['POST'])
@require_auth
def create_family_quest(user_id):
    """
    Create a new quest as a parent.
    Always creates a private, active quest owned by the parent.
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        if not data.get('title'):
            return jsonify({'success': False, 'error': 'Title is required'}), 400

        supabase = get_supabase_admin_client()

        # Auto-fetch image if not provided
        image_url = data.get('header_image_url')
        if not image_url:
            quest_desc = data.get('big_idea', '').strip() or data.get('description', '').strip()
            image_url = search_quest_image(data['title'].strip(), quest_desc)

        quest_data = {
            'title': data['title'].strip(),
            'big_idea': data.get('big_idea', '').strip() or data.get('description', '').strip(),
            'description': data.get('big_idea', '').strip() or data.get('description', '').strip(),
            'is_v3': True,
            'is_active': True,
            'is_public': False,
            'quest_type': 'optio',
            'header_image_url': image_url,
            'image_url': image_url,
            'material_link': data.get('material_link', '').strip() if data.get('material_link') else None,
            'allow_custom_tasks': data.get('allow_custom_tasks', True),
            'created_by': user_id,
            'created_at': datetime.now(timezone.utc).isoformat(),
        }

        quest_result = supabase.table('quests').insert(quest_data).execute()

        if not quest_result.data:
            return jsonify({'success': False, 'error': 'Failed to create quest'}), 500

        quest_id = quest_result.data[0]['id']
        logger.info(f"Parent {user_id} created family quest {quest_id}: {quest_data['title']}")

        return jsonify({
            'success': True,
            'message': 'Quest created successfully',
            'quest_id': quest_id,
            'quest': quest_result.data[0]
        })

    except Exception as e:
        logger.error(f"Error creating family quest for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': f'Failed to create quest: {str(e)}'}), 500


@bp.route('/quests/<quest_id>/template-tasks', methods=['PUT'])
@require_auth
def update_family_quest_template_tasks(user_id, quest_id):
    """
    Save template tasks for a family quest.
    Parent must own the quest (created_by == user_id).
    """
    try:
        verify_parent_role(user_id)

        supabase = get_supabase_admin_client()

        # Verify quest ownership
        quest = supabase.table('quests').select('id, created_by').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        if quest.data.get('created_by') != user_id:
            # Allow superadmin
            user_check = supabase.table('users').select('role').eq('id', user_id).single().execute()
            if not user_check.data or user_check.data.get('role') != 'superadmin':
                return jsonify({'success': False, 'error': 'Permission denied'}), 403

        data = request.get_json()
        if not data or not data.get('tasks'):
            return jsonify({'success': False, 'error': 'Tasks array is required'}), 400

        # Validate and prepare tasks
        valid_pillars = ['stem', 'wellness', 'communication', 'civics', 'art']
        tasks_data = []

        for i, task in enumerate(data['tasks']):
            if not task.get('title'):
                continue

            pillar = task.get('pillar', 'stem').lower().strip()
            if pillar not in valid_pillars:
                pillar = 'stem'

            tasks_data.append({
                'quest_id': quest_id,
                'title': task['title'].strip(),
                'description': task.get('description', '').strip(),
                'pillar': pillar,
                'xp_value': int(task.get('xp_value', 100)),
                'order_index': task.get('order_index', i),
                'is_required': task.get('is_required', False),
                'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                'subject_xp_distribution': task.get('subject_xp_distribution', {}),
            })

        if not tasks_data:
            return jsonify({'success': False, 'error': 'No valid tasks provided'}), 400

        # Delete existing template tasks for this quest, then insert new ones
        supabase.table('quest_template_tasks').delete().eq('quest_id', quest_id).execute()
        result = supabase.table('quest_template_tasks').insert(tasks_data).execute()

        created_tasks = result.data or []
        logger.info(f"Parent {user_id} saved {len(created_tasks)} template tasks for quest {quest_id}")

        return jsonify({
            'success': True,
            'message': f'Template tasks updated: {len(created_tasks)} tasks',
            'tasks': created_tasks,
            'total': len(created_tasks)
        })

    except Exception as e:
        logger.error(f"Error updating family quest template tasks: {str(e)}")
        return jsonify({'success': False, 'error': f'Failed to update template tasks: {str(e)}'}), 500


@bp.route('/quests/<quest_id>/enroll-children', methods=['POST'])
@require_auth
def enroll_children_in_family_quest(user_id, quest_id):
    """
    Enroll multiple children in a family quest.
    Copies template tasks to each child's user_quest_tasks.
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data or not data.get('child_ids'):
            return jsonify({'success': False, 'error': 'child_ids array is required'}), 400

        child_ids = data['child_ids']
        if not isinstance(child_ids, list) or len(child_ids) == 0:
            return jsonify({'success': False, 'error': 'child_ids must be a non-empty array'}), 400

        supabase = get_supabase_admin_client()

        # Verify quest exists and parent owns it
        quest = supabase.table('quests').select('id, created_by').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        if quest.data.get('created_by') != user_id:
            user_check = supabase.table('users').select('role').eq('id', user_id).single().execute()
            if not user_check.data or user_check.data.get('role') != 'superadmin':
                return jsonify({'success': False, 'error': 'Permission denied'}), 403

        # Fetch template tasks for this quest
        from routes.quest_types import get_template_tasks
        template_tasks = get_template_tasks(quest_id, filter_type='all')

        enrolled = []
        failed = []

        for child_id in child_ids:
            try:
                # Verify parent has access to this child
                if not verify_parent_has_access_to_child(user_id, child_id):
                    failed.append({'child_id': child_id, 'error': 'No access to this child'})
                    continue

                # Enroll child using QuestRepository (no args = admin client)
                from repositories.quest_repository import QuestRepository
                quest_repo = QuestRepository()
                enrollment = quest_repo.enroll_user(child_id, quest_id)

                enrollment_id = enrollment['id']

                # Copy template tasks to user_quest_tasks
                if template_tasks:
                    tasks_to_insert = []
                    for task in template_tasks:
                        tasks_to_insert.append({
                            'user_id': child_id,
                            'quest_id': quest_id,
                            'user_quest_id': enrollment_id,
                            'title': task['title'],
                            'description': task.get('description', ''),
                            'pillar': task['pillar'],
                            'xp_value': task.get('xp_value', 100),
                            'order_index': task.get('order_index', 0),
                            'is_required': task.get('is_required', False),
                            'is_manual': False,
                            'approval_status': 'approved',
                            'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                            'subject_xp_distribution': task.get('subject_xp_distribution'),
                            'source_template_task_id': task.get('id'),
                            'source_task_id': task.get('id'),
                        })

                    if tasks_to_insert:
                        supabase.table('user_quest_tasks').insert(tasks_to_insert).execute()

                # Mark personalization as complete
                supabase.table('user_quests').update({
                    'personalization_completed': True
                }).eq('id', enrollment_id).execute()

                enrolled.append({'child_id': child_id, 'enrollment_id': enrollment_id})
                logger.info(f"Enrolled child {child_id[:8]} in family quest {quest_id[:8]} with {len(template_tasks)} tasks")

            except Exception as child_error:
                logger.error(f"Failed to enroll child {child_id} in quest {quest_id}: {str(child_error)}")
                failed.append({'child_id': child_id, 'error': str(child_error)})

        return jsonify({
            'success': True,
            'enrolled': enrolled,
            'failed': failed,
            'message': f'Quest assigned to {len(enrolled)} children'
        })

    except Exception as e:
        logger.error(f"Error enrolling children in family quest: {str(e)}")
        return jsonify({'success': False, 'error': f'Failed to enroll children: {str(e)}'}), 500


@bp.route('/quests/<quest_id>/tasks', methods=['POST'])
@require_auth
def create_task_for_dependent(user_id, quest_id):
    """
    Create a task for a dependent child in a quest.
    Only allowed for parents managing under-13 dependents.
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        child_id = data.get('child_id')
        if not child_id:
            return jsonify({'success': False, 'error': 'child_id is required'}), 400

        # Verify parent has access to this child
        if not verify_parent_has_access_to_child(user_id, child_id):
            return jsonify({'success': False, 'error': 'No access to this child'}), 403

        supabase = get_supabase_admin_client()

        # Verify child IS a dependent (managed_by_parent_id == user_id)
        child_check = supabase.table('users').select('managed_by_parent_id').eq('id', child_id).single().execute()
        if not child_check.data or child_check.data.get('managed_by_parent_id') != user_id:
            return jsonify({'success': False, 'error': 'This action is only allowed for managed dependents'}), 403

        # Validate required fields
        if not data.get('title'):
            return jsonify({'success': False, 'error': 'Task title is required'}), 400

        if not data.get('pillar'):
            return jsonify({'success': False, 'error': 'Task pillar is required'}), 400

        pillar = data['pillar'].lower().strip()
        if not is_valid_pillar(pillar):
            pillar = normalize_pillar_name(pillar)

        xp_value = int(data.get('xp_value', 100))
        if xp_value <= 0:
            return jsonify({'success': False, 'error': 'XP value must be greater than 0'}), 400

        # Get user_quest_id for the child's enrollment
        user_quest = supabase.table('user_quests').select('id').eq(
            'user_id', child_id
        ).eq('quest_id', quest_id).execute()

        if not user_quest.data:
            return jsonify({'success': False, 'error': 'Child is not enrolled in this quest'}), 404

        user_quest_id = user_quest.data[0]['id']

        # Get next order_index
        existing_tasks = supabase.table('user_quest_tasks')\
            .select('order_index')\
            .eq('user_quest_id', user_quest_id)\
            .execute()

        max_order = max([t['order_index'] for t in existing_tasks.data], default=-1) if existing_tasks.data else -1

        task_data = {
            'user_id': child_id,
            'quest_id': quest_id,
            'user_quest_id': user_quest_id,
            'title': data['title'].strip(),
            'description': data.get('description', '').strip(),
            'pillar': pillar,
            'xp_value': xp_value,
            'order_index': max_order + 1,
            'is_required': False,
            'is_manual': True,
            'approval_status': 'approved',
            'diploma_subjects': ['Electives'],
            'created_at': datetime.now(timezone.utc).isoformat(),
        }

        result = supabase.table('user_quest_tasks').insert(task_data).execute()

        if not result.data:
            return jsonify({'success': False, 'error': 'Failed to create task'}), 500

        logger.info(f"Parent {user_id[:8]} created task for dependent {child_id[:8]} in quest {quest_id[:8]}")

        return jsonify({
            'success': True,
            'task': result.data[0],
            'message': 'Task created successfully'
        })

    except Exception as e:
        logger.error(f"Error creating task for dependent: {str(e)}")
        return jsonify({'success': False, 'error': f'Failed to create task: {str(e)}'}), 500


@bp.route('/quests/<quest_id>/tasks/<task_id>/uncomplete', methods=['POST'])
@require_auth
def uncomplete_task_for_dependent(user_id, quest_id, task_id):
    """
    Mark a completed task as incomplete for a dependent child.
    Reverses XP awarded. Only allowed for parents managing under-13 dependents.
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        child_id = data.get('child_id')
        if not child_id:
            return jsonify({'success': False, 'error': 'child_id is required'}), 400

        # Verify parent has access to this child
        if not verify_parent_has_access_to_child(user_id, child_id):
            return jsonify({'success': False, 'error': 'No access to this child'}), 403

        supabase = get_supabase_admin_client()

        # Verify child IS a dependent (managed_by_parent_id == user_id)
        child_check = supabase.table('users').select('managed_by_parent_id').eq('id', child_id).single().execute()
        if not child_check.data or child_check.data.get('managed_by_parent_id') != user_id:
            return jsonify({'success': False, 'error': 'This action is only allowed for managed dependents'}), 403

        # Find the completion record
        completion = supabase.table('quest_task_completions').select('id, xp_awarded').eq(
            'user_id', child_id
        ).eq('user_quest_task_id', task_id).execute()

        if not completion.data:
            return jsonify({'success': False, 'error': 'Task completion not found'}), 404

        completion_id = completion.data[0]['id']
        xp_awarded = completion.data[0].get('xp_awarded', 0)

        # Get task details for pillar info
        task = supabase.table('user_quest_tasks').select('pillar, xp_value').eq('id', task_id).single().execute()
        if not task.data:
            return jsonify({'success': False, 'error': 'Task not found'}), 404

        pillar = task.data['pillar']
        xp_to_remove = xp_awarded or task.data.get('xp_value', 0)

        # Reverse pillar XP from user_skill_xp
        if xp_to_remove > 0 and pillar:
            try:
                current_pillar = supabase.table('user_skill_xp').select('id, xp_amount').eq(
                    'user_id', child_id
                ).eq('pillar', pillar).execute()

                if current_pillar.data:
                    current_xp = current_pillar.data[0].get('xp_amount', 0)
                    new_xp = max(0, current_xp - xp_to_remove)
                    supabase.table('user_skill_xp').update({
                        'xp_amount': new_xp
                    }).eq('id', current_pillar.data[0]['id']).execute()
            except Exception as xp_err:
                logger.warning(f"Could not reverse pillar XP for {pillar}: {xp_err}")

            # Subtract from user's total_xp
            try:
                user_data = supabase.table('users').select('total_xp').eq('id', child_id).single().execute()
                if user_data.data:
                    current_total = user_data.data.get('total_xp', 0)
                    new_total = max(0, current_total - xp_to_remove)
                    supabase.table('users').update({
                        'total_xp': new_total
                    }).eq('id', child_id).execute()
            except Exception as total_err:
                logger.warning(f"Could not reverse total XP: {total_err}")

        # Delete the completion record
        from repositories.task_repository import TaskCompletionRepository
        completion_repo = TaskCompletionRepository(client=supabase)
        completion_repo.delete_completion(completion_id)

        logger.info(f"Parent {user_id[:8]} uncompleted task {task_id[:8]} for dependent {child_id[:8]}, reversed {xp_to_remove} XP")

        return jsonify({
            'success': True,
            'message': 'Task marked as incomplete, XP reversed',
            'xp_reversed': xp_to_remove
        })

    except Exception as e:
        logger.error(f"Error uncompleting task for dependent: {str(e)}")
        return jsonify({'success': False, 'error': f'Failed to uncomplete task: {str(e)}'}), 500
