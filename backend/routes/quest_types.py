"""
Quest Type-Specific API Routes
===============================

Handles quest task templates (unified required + optional tasks).
The quest_type distinction is being phased out in favor of a unified model
where any quest can have both required tasks AND optional suggestions.

REPOSITORY MIGRATION: COMPLETED
- Uses QuestTemplateTaskRepository for unified template task operations
- Legacy functions maintained for backward compatibility during migration
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from datetime import datetime
import random

from utils.logger import get_logger
from repositories.quest_template_task_repository import QuestTemplateTaskRepository

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

    DEPRECATED: Use get_template_tasks() instead. This function remains
    for backward compatibility during the unified quest migration.
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


def get_template_tasks(quest_id: str, filter_type: str = 'all', randomize_optional: bool = False):
    """
    UNIFIED: Get template tasks for any quest type.

    This is the new unified function that replaces the quest_type-specific
    functions (get_sample_tasks_for_quest and get_course_tasks_for_quest).

    Args:
        quest_id: Quest ID
        filter_type: 'all', 'required', or 'optional'
        randomize_optional: If True, shuffle optional tasks for variety

    Returns:
        List of template task records from quest_template_tasks table.
        Falls back to legacy tables if no template tasks exist.
    """
    try:
        repo = QuestTemplateTaskRepository()
        tasks = repo.get_template_tasks(quest_id, filter_type=filter_type, randomize=randomize_optional)

        if tasks:
            logger.info(f"Found {len(tasks)} template tasks for quest {quest_id[:8]} (filter: {filter_type})")
            return tasks

        # Fallback to legacy tables during migration period
        logger.info(f"No template tasks found, falling back to legacy tables for quest {quest_id[:8]}")
        return _get_legacy_tasks(quest_id, filter_type, randomize_optional)

    except Exception as e:
        logger.error(f"Error getting template tasks for quest {quest_id}: {str(e)}")
        # Fallback to legacy
        return _get_legacy_tasks(quest_id, filter_type, randomize_optional)


def _get_legacy_tasks(quest_id: str, filter_type: str, randomize_optional: bool):
    """
    Fallback to legacy task tables during migration.
    Checks both course_quest_tasks (required) and quest_sample_tasks (optional).
    """
    supabase = get_supabase_admin_client()
    tasks = []

    try:
        # Get course tasks (treated as required)
        if filter_type in ['all', 'required']:
            course_tasks = supabase.table('course_quest_tasks')\
                .select('*')\
                .eq('quest_id', quest_id)\
                .order('order_index')\
                .execute()

            if course_tasks.data:
                for task in course_tasks.data:
                    task['is_required'] = task.get('is_required', True)  # Default to required
                tasks.extend(course_tasks.data)

        # Get sample tasks (treated as optional)
        if filter_type in ['all', 'optional']:
            sample_tasks = supabase.table('quest_sample_tasks')\
                .select('*')\
                .eq('quest_id', quest_id)\
                .execute()

            if sample_tasks.data:
                optional_tasks = []
                for task in sample_tasks.data:
                    task['is_required'] = False  # Sample tasks are optional
                    optional_tasks.append(task)

                if randomize_optional:
                    random.shuffle(optional_tasks)

                tasks.extend(optional_tasks)

        return tasks

    except Exception as e:
        logger.error(f"Error getting legacy tasks: {str(e)}")
        return []


def get_quest_task_summary(quest_id: str):
    """
    Get a summary of template tasks for a quest.
    Useful for determining enrollment behavior.

    Returns:
        Dictionary with task counts and requirement info
    """
    try:
        repo = QuestTemplateTaskRepository()
        return repo.get_quest_task_summary(quest_id)
    except Exception as e:
        logger.error(f"Error getting task summary for quest {quest_id}: {str(e)}")
        return {
            'total_tasks': 0,
            'required_count': 0,
            'optional_count': 0,
            'has_required': False,
            'has_optional': False
        }


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
