"""
Quest Type-Specific API Routes
===============================

Handles quest type differentiation (Optio vs Course quests).
Provides sample tasks for Optio quests and preset tasks for Course quests.

REPOSITORY MIGRATION: MIGRATION CANDIDATE
- Multiple direct database calls (7+ supabase.table() calls)
- Task operations should use TaskRepository
- Quest enrollment checks should use QuestRepository
- Helper functions get_sample_tasks_for_quest and get_course_tasks_for_quest are good migration targets
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from datetime import datetime
import random

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('quest_types', __name__, url_prefix='/api/quests')


@bp.route('/<quest_id>/add-sample-task', methods=['POST'])
@require_auth
def add_sample_task_to_user_quest(user_id, quest_id):
    """
    Add a sample task to a user's personalized quest.

    Request body:
    {
        "sample_task_id": "uuid"
    }
    """
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        if not data.get('sample_task_id'):
            return jsonify({
                'success': False,
                'error': 'sample_task_id is required'
            }), 400

        sample_task_id = data['sample_task_id']

        # Get the sample task
        sample_task = supabase.table('quest_sample_tasks')\
            .select('*')\
            .eq('id', sample_task_id)\
            .eq('quest_id', quest_id)\
            .single()\
            .execute()

        if not sample_task.data:
            return jsonify({
                'success': False,
                'error': 'Sample task not found'
            }), 404

        # Get user's active enrollment for this quest
        enrollment = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .order('created_at', desc=True)\
            .limit(1)\
            .execute()

        if not enrollment.data or len(enrollment.data) == 0:
            return jsonify({
                'success': False,
                'error': 'You must be enrolled in this quest to add tasks'
            }), 400

        user_quest_id = enrollment.data[0]['id']

        # Check if task already exists for this user
        existing = supabase.table('user_quest_tasks')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('title', sample_task.data['title'])\
            .execute()

        if existing.data and len(existing.data) > 0:
            return jsonify({
                'success': False,
                'error': 'You already have this task in your quest'
            }), 400

        # Get current max order_index for this user's quest
        max_order = supabase.table('user_quest_tasks')\
            .select('order_index')\
            .eq('user_quest_id', user_quest_id)\
            .order('order_index', desc=True)\
            .limit(1)\
            .execute()

        next_order = (max_order.data[0]['order_index'] + 1) if max_order.data else 0

        # Copy sample task to user's personalized tasks
        user_task_data = {
            'user_id': user_id,
            'quest_id': quest_id,
            'user_quest_id': user_quest_id,
            'title': sample_task.data['title'],
            'description': sample_task.data.get('description', ''),
            'pillar': sample_task.data['pillar'],
            'xp_value': sample_task.data.get('xp_value', 100),
            'order_index': next_order,
            'is_required': False,  # Sample tasks are optional additions
            'is_manual': False,  # Not manually created, from sample
            'approval_status': 'approved',  # Auto-approved since from vetted samples
            'diploma_subjects': sample_task.data.get('diploma_subjects', ['Electives']),
            'subject_xp_distribution': sample_task.data.get('subject_xp_distribution', {}),
            'created_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('user_quest_tasks').insert(user_task_data).execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to add task'
            }), 500

        logger.info(f"User {user_id[:8]} added sample task '{sample_task.data['title']}' to quest {quest_id[:8]}")

        return jsonify({
            'success': True,
            'message': 'Task added to your quest!',
            'task': result.data[0]
        })

    except Exception as e:
        logger.error(f"Error adding sample task: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to add sample task: {str(e)}'
        }), 500


def get_sample_tasks_for_quest(quest_id: str, randomize: bool = True):
    """
    Helper function to get sample tasks for an Optio quest.
    Returns randomized order for inspiration.
    """
    supabase = get_supabase_admin_client()

    try:
        tasks = supabase.table('quest_sample_tasks')\
            .select('*')\
            .eq('quest_id', quest_id)\
            .execute()

        sample_tasks = tasks.data or []

        # Randomize order for variety
        if randomize and sample_tasks:
            random.shuffle(sample_tasks)

        return sample_tasks

    except Exception as e:
        logger.error(f"Error getting sample tasks: {str(e)}")
        return []


def get_course_tasks_for_quest(quest_id: str):
    """
    Helper function to get preset tasks for a course quest.
    Returns ordered by order_index.

    Note: Course tasks are ONLY stored in course_quest_tasks table.
    This is different from Optio quests which use quest_sample_tasks.
    """
    supabase = get_supabase_admin_client()

    try:
        # Course quests ONLY use course_quest_tasks table
        course_tasks = supabase.table('course_quest_tasks')\
            .select('*')\
            .eq('quest_id', quest_id)\
            .order('order_index')\
            .execute()

        if course_tasks.data and len(course_tasks.data) > 0:
            logger.info(f"Found {len(course_tasks.data)} course tasks for quest {quest_id[:8]}")
            return course_tasks.data

        logger.warning(f"No preset tasks found in course_quest_tasks for quest {quest_id[:8]}")
        return []

    except Exception as e:
        logger.error(f"Error getting course tasks: {str(e)}")
        return []


@bp.route('/similar', methods=['GET'])
@require_auth
def search_similar_quests(user_id):
    """
    Search for similar quests for autocomplete during quest creation.
    Respects organization visibility policies. Accessible to all authenticated users.

    Query Parameters:
    - search: Search term (quest title, minimum 3 characters)
    - limit: Maximum results (default: 10, max: 20)

    Returns:
    {
        "success": true,
        "quests": [...],
        "total": N
    }
    """
    try:
        search_term = request.args.get('search', '').strip()
        limit = min(int(request.args.get('limit', 10)), 20)

        # Require minimum 3 characters
        if len(search_term) < 3:
            return jsonify({
                'success': True,
                'quests': [],
                'message': 'Search term must be at least 3 characters'
            })

        # Use repository to search with organization awareness
        from repositories.quest_repository import QuestRepository
        quest_repo = QuestRepository()

        quests = quest_repo.search_similar_quests(
            user_id=user_id,
            search_term=search_term,
            limit=limit
        )

        return jsonify({
            'success': True,
            'quests': quests,
            'total': len(quests)
        })

    except Exception as e:
        logger.error(f"Error searching similar quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to search similar quests'
        }), 500
