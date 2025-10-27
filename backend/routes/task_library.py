"""
Task Library Routes
API endpoints for browsing and selecting tasks from the shared library.
"""

from flask import Blueprint, jsonify, request
from utils.auth.decorators import require_auth
from services.task_library_service import TaskLibraryService
from database import get_user_client
import logging

task_library_bp = Blueprint('task_library', __name__)
logger = logging.getLogger(__name__)


@task_library_bp.route('/api/quests/<quest_id>/task-library', methods=['GET'])
@require_auth
def get_task_library(user_id, quest_id):
    """
    Get library tasks for a quest.
    Returns up to 20 most-used tasks, or 5 recent per pillar if insufficient data.
    """
    try:
        logger.info(f"User {user_id} requesting task library for quest {quest_id}")

        library_service = TaskLibraryService()
        tasks = library_service.get_library_tasks(quest_id, limit=20)

        return jsonify({
            'success': True,
            'tasks': tasks,
            'count': len(tasks)
        }), 200

    except Exception as e:
        logger.error(f"Error getting task library: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to load task library'
        }), 500


@task_library_bp.route('/api/quests/<quest_id>/task-library/count', methods=['GET'])
@require_auth
def get_task_library_count(user_id, quest_id):
    """
    Get count of available library tasks for a quest.
    Used to determine if quest has any tasks to show.
    """
    try:
        logger.info(f"User {user_id} getting task library count for quest {quest_id}")

        library_service = TaskLibraryService()
        count = library_service.get_library_count(quest_id)

        return jsonify({
            'success': True,
            'count': count
        }), 200

    except Exception as e:
        logger.error(f"Error getting task library count: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get library count'
        }), 500


@task_library_bp.route('/api/quests/<quest_id>/task-library/select', methods=['POST'])
@require_auth
def select_library_task(quest_id):
    """
    Select a task from the library and add it to user's quest.
    Increments usage_count and creates user_quest_tasks entry.
    """
    try:
        user_id = request.user_id
        data = request.get_json()

        sample_task_id = data.get('sample_task_id')
        if not sample_task_id:
            return jsonify({
                'success': False,
                'error': 'sample_task_id is required'
            }), 400

        logger.info(f"User {user_id} selecting library task {sample_task_id} for quest {quest_id}")

        # Get the library task details
        library_service = TaskLibraryService()
        supabase = get_user_client(user_id)

        # Fetch the sample task
        sample_task_response = supabase.table('quest_sample_tasks') \
            .select('*') \
            .eq('id', sample_task_id) \
            .single() \
            .execute()

        if not sample_task_response.data:
            return jsonify({
                'success': False,
                'error': 'Library task not found'
            }), 404

        sample_task = sample_task_response.data

        # Verify task belongs to this quest
        if sample_task['quest_id'] != quest_id:
            return jsonify({
                'success': False,
                'error': 'Task does not belong to this quest'
            }), 400

        # Check if user is enrolled in quest
        user_quest_response = supabase.table('user_quests') \
            .select('id') \
            .eq('user_id', user_id) \
            .eq('quest_id', quest_id) \
            .eq('is_active', True) \
            .execute()

        if not user_quest_response.data or len(user_quest_response.data) == 0:
            # Enroll user in quest first
            enrollment = supabase.table('user_quests').insert({
                'user_id': user_id,
                'quest_id': quest_id,
                'is_active': True
            }).execute()

            if not enrollment.data:
                return jsonify({
                    'success': False,
                    'error': 'Failed to enroll in quest'
                }), 500

            user_quest_id = enrollment.data[0]['id']
        else:
            user_quest_id = user_quest_response.data[0]['id']

        # Check if task already exists for this user
        existing_task = supabase.table('user_quest_tasks') \
            .select('id') \
            .eq('user_id', user_id) \
            .eq('quest_id', quest_id) \
            .eq('title', sample_task['title']) \
            .execute()

        if existing_task.data and len(existing_task.data) > 0:
            return jsonify({
                'success': False,
                'error': 'You have already added this task'
            }), 400

        # Get next order_index
        max_order_response = supabase.table('user_quest_tasks') \
            .select('order_index') \
            .eq('user_id', user_id) \
            .eq('quest_id', quest_id) \
            .order('order_index', desc=True) \
            .limit(1) \
            .execute()

        next_order = 0
        if max_order_response.data and len(max_order_response.data) > 0:
            max_order = max_order_response.data[0].get('order_index', -1)
            next_order = max_order + 1 if max_order is not None else 0

        # Create user_quest_tasks entry
        user_task_data = {
            'user_id': user_id,
            'quest_id': quest_id,
            'user_quest_id': user_quest_id,
            'title': sample_task['title'],
            'description': sample_task['description'],
            'pillar': sample_task['pillar'],
            'xp_value': sample_task['xp_value'],
            'diploma_subjects': sample_task.get('diploma_subjects'),
            'subject_xp_distribution': sample_task.get('subject_xp_distribution'),
            'order_index': next_order,
            'is_required': False,
            'is_manual': False,
            'approval_status': 'approved'
        }

        task_response = supabase.table('user_quest_tasks') \
            .insert(user_task_data) \
            .execute()

        if not task_response.data:
            return jsonify({
                'success': False,
                'error': 'Failed to add task to your quest'
            }), 500

        # Increment usage count
        library_service.increment_usage(sample_task_id)

        created_task = task_response.data[0]

        logger.info(f"Successfully added library task to user's quest: {created_task['id']}")

        return jsonify({
            'success': True,
            'task': created_task,
            'message': 'Task added to your quest'
        }), 201

    except Exception as e:
        logger.error(f"Error selecting library task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to add task to quest'
        }), 500


@task_library_bp.route('/api/quests/<quest_id>/task-library/<task_id>/flag', methods=['POST'])
@require_auth
def flag_library_task(quest_id, task_id):
    """
    Flag a library task as inappropriate or low-quality.
    Auto-flags for admin review if 3+ flags received.
    """
    try:
        user_id = request.user_id
        data = request.get_json()

        reason = data.get('reason', None)

        logger.info(f"User {user_id} flagging task {task_id}")

        library_service = TaskLibraryService()
        success = library_service.flag_task(task_id, user_id, reason)

        if success:
            return jsonify({
                'success': True,
                'message': 'Task flagged for review. Thank you for your feedback.'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to flag task'
            }), 500

    except Exception as e:
        logger.error(f"Error flagging task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to flag task'
        }), 500
