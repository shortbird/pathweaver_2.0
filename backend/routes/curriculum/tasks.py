"""AI task generation + activate + link/unlink + create curriculum tasks.

Split from routes/curriculum.py on 2026-04-14 (Q1).
"""

"""
Curriculum API endpoints for quest curriculum builder.

Handles curriculum content management and file attachments.
Only accessible by school admins and advisors.

ADMIN CLIENT USAGE: Every endpoint in this file uses get_supabase_admin_client()
because curriculum content is org-scoped and edit permission is gated by
CurriculumPermissionService, which is invoked at the top of each endpoint via
_check_read_permission / _check_edit_permission / _check_lesson_edit_permission.
The permission service performs cross-row checks (quest -> course -> course_quests
-> organization, plus user role + org membership) that would require many overlapping
RLS policies to express. Each call site below is annotated `# admin client justified`
to satisfy the H1 audit; the actual access control lives in the permission helpers
above.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.roles import get_effective_role  # A2: org_managed users have actual role in org_role
from middleware.error_handler import ValidationError, AuthorizationError, NotFoundError
from middleware.rate_limiter import rate_limit
from services.curriculum_service import CurriculumService
from services.curriculum_lesson_service import CurriculumLessonService
from services.curriculum_permission_service import CurriculumPermissionService
from services.file_upload_service import FileUploadService
from utils.logger import get_logger
from utils.ai_access import require_ai_access

logger = get_logger(__name__)



from routes.curriculum import (
    bp,
    _check_read_permission,
    _check_edit_permission,
    _check_lesson_edit_permission,
)


@bp.route('/<quest_id>/curriculum/lessons/<lesson_id>/generate-tasks', methods=['POST'])
@require_auth
@rate_limit(limit=100, per=3600)  # 100 AI generations per hour (increased for bulk operations)
def generate_ai_tasks(user_id: str, quest_id: str, lesson_id: str):
    """
    Generate task suggestions from lesson content using AI with curriculum context.

    Body:
        lesson_content (str): Lesson content text
        num_tasks (int, optional): Number of tasks to generate (default 5)
        lesson_title (str, optional): Lesson title for context
        curriculum_context (str, optional): Additional curriculum context
        focus_pillar (str, optional): Pillar to focus tasks on
        custom_prompt (str, optional): Custom instructions for task generation
        existing_tasks_context (str, optional): Context about existing tasks

    Returns:
        200: Generated tasks
        400: Validation error
        403: Permission denied
        503: AI not available
    """
    try:
        # Check AI access before proceeding
        ai_access_error = require_ai_access(user_id)
        if ai_access_error:
            return ai_access_error

        # admin client justified: see file docstring; CurriculumPermissionService gates access
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        _check_edit_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data or 'lesson_content' not in data:
            return jsonify({'error': 'lesson_content is required'}), 400

        quest_result = supabase.table('quests').select('title, description').eq('id', quest_id).execute()
        quest_title = quest_result.data[0].get('title') if quest_result.data else None
        quest_description = quest_result.data[0].get('description') if quest_result.data else None

        tasks = service.generate_ai_tasks(
            lesson_id=lesson_id,
            lesson_content=data.get('lesson_content'),
            num_tasks=data.get('num_tasks', 5),
            lesson_title=data.get('lesson_title'),
            quest_title=quest_title,
            quest_description=quest_description,
            curriculum_context=data.get('curriculum_context'),
            focus_pillar=data.get('focus_pillar'),
            custom_prompt=data.get('custom_prompt'),
            existing_tasks_context=data.get('existing_tasks_context')
        )

        return jsonify({
            'success': True,
            'tasks': tasks,
            'message': f'Generated {len(tasks)} task suggestions'
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error generating AI tasks: {str(e)}")
        return jsonify({'error': 'Failed to generate AI tasks'}), 500


@bp.route('/<quest_id>/tasks', methods=['GET'])
@require_auth
def get_quest_tasks(user_id: str, quest_id: str):
    """
    Get all tasks for a quest (for curriculum task linking).
    Includes completion status for the current user.

    This endpoint handles the case where lessons link to "template" tasks (owned by course creator)
    but each student has their own copy of tasks. It matches tasks by title to determine completion.

    Returns:
        200: List of quest tasks with is_completed field
        403: Permission denied
    """
    try:
        # admin client justified: see file docstring; CurriculumPermissionService gates access
        supabase = get_supabase_admin_client()

        _check_read_permission(user_id, quest_id, supabase)

        # Get all tasks linked to lessons for this quest (template tasks)
        linked_tasks_result = supabase.table('curriculum_lesson_tasks')\
            .select('task_id')\
            .eq('quest_id', quest_id)\
            .execute()

        linked_task_ids = list(set(t['task_id'] for t in (linked_tasks_result.data or [])))

        # Get template tasks (tasks linked to lessons - may be owned by course creator)
        template_tasks = []
        if linked_task_ids:
            template_result = supabase.table('user_quest_tasks')\
                .select('id, title, description, pillar, xp_value, order_index, approval_status, is_required')\
                .in_('id', linked_task_ids)\
                .order('order_index')\
                .execute()
            template_tasks = template_result.data or []

        # Get the current user's tasks for this quest
        user_tasks_result = supabase.table('user_quest_tasks')\
            .select('id, title, description, pillar, xp_value, order_index, approval_status, is_required')\
            .eq('quest_id', quest_id)\
            .eq('user_id', user_id)\
            .order('order_index')\
            .execute()

        user_tasks = user_tasks_result.data or []

        # Build a map of user's tasks by title for matching
        user_tasks_by_title = {t['title']: t for t in user_tasks}

        # Get completions for the current user
        completions_result = supabase.table('quest_task_completions')\
            .select('task_id, user_quest_task_id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        completed_task_ids = set()
        for comp in (completions_result.data or []):
            if comp.get('task_id'):
                completed_task_ids.add(comp['task_id'])
            if comp.get('user_quest_task_id'):
                completed_task_ids.add(comp['user_quest_task_id'])

        # Build result: Use template task IDs (for lesson linking) but with user's completion status
        tasks = []
        for template_task in template_tasks:
            task = dict(template_task)

            # Check if user has completed this task (by matching their task with same title)
            user_task = user_tasks_by_title.get(template_task['title'])
            if user_task:
                # User has this task - check if completed
                task['is_completed'] = user_task['id'] in completed_task_ids
                # Use user's XP value if different
                task['xp_value'] = user_task.get('xp_value', template_task.get('xp_value', 0))
            else:
                # User doesn't have this task yet
                task['is_completed'] = False

            tasks.append(task)

        # Also include any user tasks not linked to lessons (user-created tasks)
        template_titles = {t['title'] for t in template_tasks}
        for user_task in user_tasks:
            if user_task['title'] not in template_titles:
                task = dict(user_task)
                task['is_completed'] = user_task['id'] in completed_task_ids
                tasks.append(task)

        return jsonify({
            'success': True,
            'tasks': tasks
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error fetching quest tasks: {str(e)}")
        return jsonify({'error': 'Failed to fetch quest tasks'}), 500


@bp.route('/<quest_id>/activate-task/<template_task_id>', methods=['POST'])
@require_auth
@rate_limit(limit=30, per=60)
def activate_task(user_id: str, quest_id: str, template_task_id: str):
    """
    Activate (copy) a template task to the user's quest tasks.

    This creates a copy of a lesson-linked "template" task for the user,
    allowing them to work on and complete it.

    Returns:
        201: Task activated successfully
        400: Task already activated or validation error
        403: Permission denied
        404: Template task not found
    """
    try:
        # admin client justified: see file docstring; CurriculumPermissionService gates access
        supabase = get_supabase_admin_client()

        _check_read_permission(user_id, quest_id, supabase)

        # Get the template task
        template_result = supabase.table('user_quest_tasks')\
            .select('id, title, description, pillar, xp_value, order_index, is_required, diploma_subjects, subject_xp_distribution')\
            .eq('id', template_task_id)\
            .execute()

        if not template_result.data:
            return jsonify({'error': 'Template task not found'}), 404

        template_task = template_result.data[0]

        # Check if user already has this task (by title match)
        existing_task = supabase.table('user_quest_tasks')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('title', template_task['title'])\
            .execute()

        if existing_task.data:
            # Task already exists for user - return it
            return jsonify({
                'success': True,
                'task': existing_task.data[0],
                'message': 'Task already activated',
                'already_existed': True
            }), 200

        # Get user's quest enrollment
        user_quest_result = supabase.table('user_quests')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        user_quest_id = user_quest_result.data[0]['id'] if user_quest_result.data else None

        # Create the task copy for the user
        new_task = {
            'user_id': user_id,
            'quest_id': quest_id,
            'user_quest_id': user_quest_id,
            'title': template_task['title'],
            'description': template_task.get('description', ''),
            'pillar': template_task['pillar'],
            'xp_value': template_task.get('xp_value', 100),
            'order_index': template_task.get('order_index', 0),
            'is_required': template_task.get('is_required', False),
            'is_manual': False,
            'approval_status': 'approved',
            'diploma_subjects': template_task.get('diploma_subjects', ['Electives']),
            'subject_xp_distribution': template_task.get('subject_xp_distribution'),
            'source_task_id': template_task['id']
        }

        result = supabase.table('user_quest_tasks').insert(new_task).execute()

        if not result.data:
            return jsonify({'error': 'Failed to activate task'}), 500

        logger.info(f"User {user_id} activated task '{template_task['title']}' in quest {quest_id}")

        return jsonify({
            'success': True,
            'task': result.data[0],
            'message': 'Task activated successfully',
            'already_existed': False
        }), 201

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error activating task: {str(e)}")
        return jsonify({'error': 'Failed to activate task'}), 500


@bp.route('/<quest_id>/curriculum/lessons/<lesson_id>/link-task', methods=['POST'])
@require_auth
@rate_limit(limit=30, per=60)
def link_task_to_lesson(user_id: str, quest_id: str, lesson_id: str):
    """
    Link an existing quest task to a lesson.

    Body:
        task_id (str): Task ID to link

    Returns:
        201: Task linked successfully
        400: Validation error
        403: Permission denied
        404: Task or lesson not found
    """
    try:
        # admin client justified: see file docstring; CurriculumPermissionService gates access
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        _check_edit_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data or 'task_id' not in data:
            return jsonify({'error': 'task_id is required'}), 400

        link = service.link_task_to_lesson(lesson_id, data.get('task_id'), quest_id)

        return jsonify({
            'success': True,
            'link': link,
            'message': 'Task linked to lesson successfully'
        }), 201

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error linking task to lesson: {str(e)}")
        return jsonify({'error': 'Failed to link task to lesson'}), 500


@bp.route('/<quest_id>/curriculum/lessons/<lesson_id>/link-task/<task_id>', methods=['DELETE'])
@require_auth
def unlink_task_from_lesson(user_id: str, quest_id: str, lesson_id: str, task_id: str):
    """
    Unlink a task from a lesson.

    Returns:
        200: Task unlinked successfully
        403: Permission denied
    """
    try:
        # admin client justified: see file docstring; CurriculumPermissionService gates access
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        _check_edit_permission(user_id, quest_id, supabase)

        service.unlink_task_from_lesson(lesson_id, task_id)

        return jsonify({
            'success': True,
            'message': 'Task unlinked from lesson successfully'
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error unlinking task from lesson: {str(e)}")
        return jsonify({'error': 'Failed to unlink task from lesson'}), 500


@bp.route('/<quest_id>/curriculum/lessons/<lesson_id>/create-tasks', methods=['POST'])
@require_auth
@rate_limit(limit=200, per=3600)  # Increased for bulk operations
def create_curriculum_tasks(user_id: str, quest_id: str, lesson_id: str):
    """
    Create tasks from AI-generated suggestions and optionally link them to the lesson.

    Body:
        tasks (list): Array of task objects with title, description, pillar, xp_value
        link_to_lesson (bool, optional): Whether to link created tasks to the lesson (default True)

    Returns:
        201: Tasks created successfully
        400: Validation error
        403: Permission denied
    """
    try:
        # admin client justified: see file docstring; CurriculumPermissionService gates access
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        _check_edit_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data or 'tasks' not in data:
            return jsonify({'error': 'tasks array is required'}), 400

        tasks = data.get('tasks', [])
        if not tasks:
            return jsonify({'error': 'At least one task is required'}), 400

        created_tasks = service.create_tasks_from_suggestions(
            quest_id=quest_id,
            lesson_id=lesson_id,
            user_id=user_id,
            tasks=tasks,
            link_to_lesson=data.get('link_to_lesson', True)
        )

        return jsonify({
            'success': True,
            'tasks': created_tasks,
            'message': f'Created {len(created_tasks)} tasks'
        }), 201

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error creating curriculum tasks: {str(e)}")
        return jsonify({'error': 'Failed to create tasks'}), 500


# ========================================
# Organization Curriculum Projects Endpoint
# ========================================

