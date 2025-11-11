"""
Tutorial Quest Routes

API endpoints for the tutorial quest system with programmatic verification.
"""

from flask import Blueprint, jsonify, request
from utils.auth.decorators import require_auth
from services.tutorial_verification_service import tutorial_verification_service
from database import get_supabase_admin_client
import logging

logger = logging.getLogger(__name__)

tutorial_bp = Blueprint('tutorial', __name__)


@tutorial_bp.route('/check-progress', methods=['POST'])
@require_auth
def check_tutorial_progress(current_user):
    """
    Check and update tutorial progress for the authenticated user

    Returns verification results and auto-completes any verified tasks
    """
    try:
        user_id = current_user['id']

        # Run verification service
        result = tutorial_verification_service.verify_user_tutorial_progress(user_id)

        if not result['success']:
            return jsonify({
                'error': 'Failed to verify tutorial progress',
                'details': result.get('error')
            }), 500

        return jsonify({
            'success': True,
            'newly_completed': result['newly_completed'],
            'newly_completed_count': len(result['newly_completed']),
            'already_completed_count': result['already_completed_count'],
            'tutorial_complete': result['tutorial_complete']
        }), 200

    except Exception as e:
        logger.error(f"Error in check_tutorial_progress: {str(e)}")
        return jsonify({'error': str(e)}), 500


@tutorial_bp.route('/status', methods=['GET'])
@require_auth
def get_tutorial_status(current_user):
    """
    Get the current status of the tutorial quest for the authenticated user

    Returns:
        - tutorial_started: boolean
        - tutorial_completed: boolean
        - completed_tasks_count: int
        - total_tasks_count: int
        - tutorial_quest_id: UUID (if exists)
    """
    try:
        user_id = current_user['id']
        supabase = get_supabase_admin_client()

        # Get tutorial quest
        tutorial_quest_response = supabase.table('quests').select('id, title').eq(
            'is_tutorial', True
        ).eq('is_active', True).execute()

        if not tutorial_quest_response.data:
            return jsonify({
                'tutorial_exists': False,
                'tutorial_started': False,
                'tutorial_completed': False
            }), 200

        tutorial_quest = tutorial_quest_response.data[0]
        tutorial_quest_id = tutorial_quest['id']

        # Check if user has started tutorial
        user_quest_response = supabase.table('user_quests').select(
            'id, started_at, completed_at, is_active'
        ).eq('user_id', user_id).eq('quest_id', tutorial_quest_id).execute()

        if not user_quest_response.data:
            return jsonify({
                'tutorial_exists': True,
                'tutorial_started': False,
                'tutorial_completed': False,
                'tutorial_quest_id': tutorial_quest_id,
                'tutorial_title': tutorial_quest['title']
            }), 200

        user_quest = user_quest_response.data[0]
        user_quest_id = user_quest['id']

        # Get task counts
        all_tasks_response = supabase.table('user_quest_tasks').select(
            'id', count='exact'
        ).eq('user_quest_id', user_quest_id).execute()

        total_tasks = all_tasks_response.count

        # Get completed tasks count
        if total_tasks > 0:
            task_ids = [t['id'] for t in all_tasks_response.data]

            completed_response = supabase.table('quest_task_completions').select(
                'id', count='exact'
            ).eq('user_id', user_id).in_('task_id', task_ids).execute()

            completed_tasks = completed_response.count
        else:
            completed_tasks = 0

        return jsonify({
            'tutorial_exists': True,
            'tutorial_started': True,
            'tutorial_completed': bool(user_quest.get('completed_at')),
            'tutorial_quest_id': tutorial_quest_id,
            'tutorial_title': tutorial_quest['title'],
            'user_quest_id': user_quest_id,
            'completed_tasks_count': completed_tasks,
            'total_tasks_count': total_tasks,
            'progress_percentage': round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0
        }), 200

    except Exception as e:
        logger.error(f"Error in get_tutorial_status: {str(e)}")
        return jsonify({'error': str(e)}), 500


@tutorial_bp.route('/start', methods=['POST'])
@require_auth
def start_tutorial(current_user):
    """
    Start the tutorial quest for the authenticated user

    Creates user_quests record and user_quest_tasks records with auto_complete enabled
    """
    try:
        user_id = current_user['id']
        supabase = get_supabase_admin_client()

        # Get tutorial quest
        tutorial_quest_response = supabase.table('quests').select('id').eq(
            'is_tutorial', True
        ).eq('is_active', True).execute()

        if not tutorial_quest_response.data:
            return jsonify({'error': 'Tutorial quest not found'}), 404

        tutorial_quest_id = tutorial_quest_response.data[0]['id']

        # Check if already started
        existing_response = supabase.table('user_quests').select('id').eq(
            'user_id', user_id
        ).eq('quest_id', tutorial_quest_id).execute()

        if existing_response.data:
            return jsonify({
                'success': True,
                'message': 'Tutorial already started',
                'user_quest_id': existing_response.data[0]['id']
            }), 200

        # Create user_quests record
        from datetime import datetime
        user_quest_data = {
            'user_id': user_id,
            'quest_id': tutorial_quest_id,
            'started_at': datetime.utcnow().isoformat(),
            'is_active': True
        }

        user_quest_response = supabase.table('user_quests').insert(user_quest_data).execute()

        if not user_quest_response.data:
            return jsonify({'error': 'Failed to create user_quests record'}), 500

        user_quest_id = user_quest_response.data[0]['id']

        # Create tutorial tasks from template
        from services.tutorial_task_templates import get_tutorial_tasks
        tutorial_tasks = get_tutorial_tasks()

        task_records = []
        for task_template in tutorial_tasks:
            task_record = {
                'user_id': user_id,
                'quest_id': tutorial_quest_id,
                'user_quest_id': user_quest_id,
                'title': task_template['title'],
                'description': task_template['description'],
                'pillar': task_template['pillar'],
                'xp_value': task_template['xp_value'],
                'order_index': task_template['order_index'],
                'is_required': task_template['is_required'],
                'auto_complete': task_template['auto_complete'],
                'verification_query': task_template['verification_query'],
                'diploma_subjects': task_template['diploma_subjects'],
                'is_manual': False
            }
            task_records.append(task_record)

        # Insert all tasks
        supabase.table('user_quest_tasks').insert(task_records).execute()

        # Run initial verification check
        tutorial_verification_service.verify_user_tutorial_progress(user_id)

        return jsonify({
            'success': True,
            'message': 'Tutorial quest started successfully',
            'user_quest_id': user_quest_id,
            'task_count': len(task_records)
        }), 201

    except Exception as e:
        logger.error(f"Error in start_tutorial: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@tutorial_bp.route('/tasks', methods=['GET'])
@require_auth
def get_tutorial_tasks(current_user):
    """
    Get all tutorial tasks with completion status for the authenticated user

    Returns list of tasks with verification status
    """
    try:
        user_id = current_user['id']
        supabase = get_supabase_admin_client()

        # Get tutorial quest
        tutorial_quest_response = supabase.table('quests').select('id').eq(
            'is_tutorial', True
        ).eq('is_active', True).execute()

        if not tutorial_quest_response.data:
            return jsonify({'error': 'Tutorial quest not found'}), 404

        tutorial_quest_id = tutorial_quest_response.data[0]['id']

        # Get user's tutorial quest
        user_quest_response = supabase.table('user_quests').select('id').eq(
            'user_id', user_id
        ).eq('quest_id', tutorial_quest_id).execute()

        if not user_quest_response.data:
            return jsonify({
                'tutorial_started': False,
                'tasks': []
            }), 200

        user_quest_id = user_quest_response.data[0]['id']

        # Get all tutorial tasks for this user
        tasks_response = supabase.table('user_quest_tasks').select(
            'id, title, description, pillar, xp_value, order_index, auto_complete, verification_query'
        ).eq('user_quest_id', user_quest_id).order('order_index').execute()

        tasks = tasks_response.data if tasks_response.data else []

        # Get completion status for each task
        task_ids = [t['id'] for t in tasks]

        if task_ids:
            completions_response = supabase.table('quest_task_completions').select(
                'task_id, completed_at, xp_awarded'
            ).eq('user_id', user_id).in_('task_id', task_ids).execute()

            completions_map = {
                c['task_id']: c for c in completions_response.data
            } if completions_response.data else {}
        else:
            completions_map = {}

        # Enrich tasks with completion data
        enriched_tasks = []
        for task in tasks:
            task_id = task['id']
            completion = completions_map.get(task_id)

            enriched_tasks.append({
                'id': task_id,
                'title': task['title'],
                'description': task['description'],
                'pillar': task['pillar'],
                'xp_value': task['xp_value'],
                'order_index': task['order_index'],
                'auto_complete': task['auto_complete'],
                'is_completed': bool(completion),
                'completed_at': completion['completed_at'] if completion else None,
                'xp_awarded': completion['xp_awarded'] if completion else 0
            })

        return jsonify({
            'tutorial_started': True,
            'user_quest_id': user_quest_id,
            'tasks': enriched_tasks
        }), 200

    except Exception as e:
        logger.error(f"Error in get_tutorial_tasks: {str(e)}")
        return jsonify({'error': str(e)}), 500
