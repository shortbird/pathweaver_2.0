"""
Quest Personalization API Routes
=================================

Handles the personalized quest creation workflow where students work with AI
to generate custom learning paths aligned with their interests.

REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses personalization_service for AI-driven quest generation (service layer pattern)
- Uses TaskQualityService for task validation
- Uses DependentRepository for parent/dependent workflow
- Service layer is the preferred pattern for complex AI personalization logic
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from services.personalization_service import personalization_service
from services.task_quality_service import TaskQualityService
from datetime import datetime

from utils.logger import get_logger
from utils.ai_access import require_ai_access
from routes.personalization_validators import (
    validate_generate_tasks_request,
    validate_edit_task_request,
    validate_manual_task,
    validate_finalize_tasks_request,
    validate_accept_task_request,
    validate_skip_task_request,
    validate_manual_tasks_batch
)
from utils.personalization_helpers import (
    get_effective_user_id,
    check_and_complete_personalization,
    normalize_diploma_subjects,
    get_or_create_enrollment,
    get_next_order_index
)

logger = get_logger(__name__)

bp = Blueprint('quest_personalization', __name__, url_prefix='/api/quests')

# CORS headers are set globally in app.py - do not duplicate here


@bp.route('/<quest_id>/start-personalization', methods=['POST'])
@require_auth
def start_personalization(user_id: str, quest_id: str):
    """
    Begin the personalization flow for a quest.
    Creates or resumes a personalization session.

    Optional body parameter:
        acting_as_dependent_id: UUID of dependent (if parent is acting on behalf of child)
    """
    try:
        # Get optional acting_as_dependent_id from request body
        data = request.get_json() or {}
        acting_as_dependent_id = data.get('acting_as_dependent_id')

        # Determine effective user ID (handles parent -> dependent delegation)
        effective_user_id = get_effective_user_id(user_id, acting_as_dependent_id)

        result = personalization_service.start_personalization_session(
            user_id=effective_user_id,
            quest_id=quest_id
        )

        if not result['success']:
            return jsonify(result), 400

        return jsonify({
            'success': True,
            'session_id': result['session']['id'],
            'session': result['session'],
            'resumed': result.get('resumed', False),
            'acting_as_dependent': acting_as_dependent_id is not None,
            'message': 'Personalization session started' if not result.get('resumed') else 'Resuming personalization session'
        })

    except PermissionError as e:
        logger.warning(f"Permission denied in start_personalization: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 403
    except Exception as e:
        logger.error(f"Error starting personalization: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to start personalization'
        }), 500


@bp.route('/<quest_id>/generate-tasks', methods=['POST'])
@require_auth
def generate_tasks(user_id: str, quest_id: str):
    """
    Generate AI task suggestions based on student inputs.
    Always generates 10 tasks per request.

    Request body:
    {
        "session_id": "uuid",
        "approach": "real_world_project|traditional_class|hybrid" (optional, defaults to 'hybrid'),
        "interests": ["basketball", "piano", "..."],
        "cross_curricular_subjects": ["math", "science", "..."]
    }
    """
    try:
        # Check AI access before proceeding
        ai_access_error = require_ai_access(user_id)
        if ai_access_error:
            return ai_access_error

        data = request.get_json()

        # Validate request
        is_valid, error = validate_generate_tasks_request(data)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        session_id = data.get('session_id')
        approach = data.get('approach', 'hybrid')
        interests = data.get('interests', [])
        cross_curricular_subjects = data.get('cross_curricular_subjects', [])
        exclude_tasks = data.get('exclude_tasks', [])
        additional_feedback = data.get('additional_feedback', '')

        # Fetch user's learning vision (bio field) for AI context
        vision_statement = ''
        try:
            supabase = get_supabase_admin_client()
            user_result = supabase.table('users').select('bio').eq('id', user_id).single().execute()
            if user_result.data and user_result.data.get('bio'):
                vision_statement = user_result.data['bio']
        except Exception as e:
            logger.warning(f"Could not fetch user vision statement: {e}")

        # Generate tasks
        result = personalization_service.generate_task_suggestions(
            session_id=session_id,
            quest_id=quest_id,
            approach=approach,
            interests=interests,
            cross_curricular_subjects=cross_curricular_subjects,
            exclude_tasks=exclude_tasks,
            additional_feedback=additional_feedback,
            vision_statement=vision_statement
        )

        if not result['success']:
            return jsonify(result), 500

        return jsonify({
            'success': True,
            'tasks': result['tasks'],
            'cached': result.get('cached', False),
            'message': 'Tasks generated successfully' + (' (from cache)' if result.get('cached') else '')
        })

    except Exception as e:
        logger.error(f"Error generating tasks: {str(e)}")
        error_str = str(e).lower()

        # Check for rate limiting errors from Gemini API
        if '429' in error_str or 'too many requests' in error_str or 'quota' in error_str or 'rate limit' in error_str:
            return jsonify({
                'success': False,
                'error': 'AI service rate limit reached. Please wait 30 seconds and try again.'
            }), 429
        elif '403' in error_str or 'api key' in error_str or 'leaked' in error_str:
            return jsonify({
                'success': False,
                'error': 'AI service configuration error. Please contact support.'
            }), 500
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to generate tasks. Please try again.'
            }), 500


@bp.route('/<quest_id>/refine-tasks', methods=['POST'])
@require_auth
def refine_tasks(user_id: str, quest_id: str):
    """
    Regenerate tasks with different interests/subjects.
    """
    try:
        data = request.get_json()

        session_id = data.get('session_id')
        approach = data.get('approach')
        interests = data.get('interests', [])
        cross_curricular_subjects = data.get('cross_curricular_subjects', [])

        if not session_id:
            return jsonify({
                'success': False,
                'error': 'session_id is required'
            }), 400

        # This is essentially the same as generate_tasks, but allows re-generation
        result = personalization_service.generate_task_suggestions(
            session_id=session_id,
            quest_id=quest_id,
            approach=approach or 'real_world_project',
            interests=interests,
            cross_curricular_subjects=cross_curricular_subjects
        )

        if not result['success']:
            return jsonify(result), 500

        return jsonify({
            'success': True,
            'tasks': result['tasks'],
            'message': 'Tasks refined successfully'
        })

    except Exception as e:
        logger.error(f"Error refining tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to refine tasks'
        }), 500


@bp.route('/<quest_id>/edit-task', methods=['POST'])
@require_auth
def edit_task(user_id: str, quest_id: str):
    """
    Student edits a task description. AI reformats and enhances it.

    Request body:
    {
        "session_id": "uuid",
        "task_index": 0,
        "student_edits": "I want to build a basketball stats tracker..."
    }
    """
    try:
        data = request.get_json()

        # Validate request
        is_valid, error = validate_edit_task_request(data)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        result = personalization_service.refine_task(
            session_id=data['session_id'],
            task_index=data['task_index'],
            student_edits=data['student_edits']
        )

        if not result['success']:
            return jsonify(result), 400

        return jsonify({
            'success': True,
            'task': result['task'],
            'message': 'Task refined based on your input'
        })

    except Exception as e:
        logger.error(f"Error editing task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to edit task'
        }), 500


@bp.route('/<quest_id>/analyze-manual-task', methods=['POST'])
@require_auth
def analyze_manual_task(user_id: str, quest_id: str):
    """
    Generate helpful suggestions for a student-created task using AI.
    Returns suggestions, suggested XP, and pillar values.
    """
    try:
        data = request.get_json()

        title = data.get('title', '').strip()
        description = data.get('description', '').strip()
        pillar = data.get('pillar', '').strip()

        # Validate inputs
        is_valid, error = validate_manual_task(title, description)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        # Generate suggestions using AI
        quality_service = TaskQualityService()
        analysis = quality_service.analyze_task_quality(
            title=title,
            description=description,
            pillar=pillar if pillar else None
        )

        logger.info(
            f"Task suggestions generated for user {user_id}: "
            f"{len(analysis.get('suggestions', []))} suggestions"
        )

        return jsonify({
            'success': True,
            **analysis
        })

    except ValueError as e:
        logger.error(f"Validation error in analyze_manual_task: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Error analyzing manual task: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to analyze task. Please try again.'
        }), 500


@bp.route('/<quest_id>/add-manual-tasks', methods=['POST'])
@require_auth
def add_manual_tasks_batch(user_id: str, quest_id: str):
    """
    Add multiple student-created tasks at once.
    All tasks are approved immediately - students have full control of their learning.
    """
    try:
        from utils.pillar_utils import normalize_pillar_name
        from services.subject_classification_service import SubjectClassificationService

        supabase = get_supabase_admin_client()
        subject_service = SubjectClassificationService()
        data = request.get_json()

        tasks = data.get('tasks', [])

        # Validate request
        is_valid, error = validate_manual_tasks_batch(tasks)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        # Get or create enrollment
        user_quest_id = get_or_create_enrollment(user_id, quest_id)

        # Get next order_index
        next_order = get_next_order_index(user_id, quest_id)

        # Create user_quest_tasks entries
        created_tasks = []

        for idx, task in enumerate(tasks):
            # Normalize pillar name
            try:
                pillar_key = normalize_pillar_name(task.get('pillar', 'stem'))
            except ValueError:
                pillar_key = 'stem'

            # Ensure diploma_subjects is a dict
            diploma_subjects = normalize_diploma_subjects(
                task.get('diploma_subjects', {}),
                task.get('xp_value', 100)
            )

            # Generate subject XP distribution using AI
            subject_xp_distribution = {}
            try:
                subject_xp_distribution = subject_service.classify_task_subjects(
                    title=task['title'],
                    description=task.get('description', ''),
                    pillar=pillar_key,
                    xp_value=task.get('xp_value', 100)
                )
                logger.info(f"Generated subject distribution for manual task '{task['title']}': {subject_xp_distribution}")
            except Exception as e:
                logger.error(f"Failed to generate subject distribution for manual task '{task['title']}': {e}")

            user_task = {
                'user_id': user_id,
                'quest_id': quest_id,
                'user_quest_id': user_quest_id,
                'title': task['title'],
                'description': task.get('description', ''),
                'pillar': pillar_key,
                'diploma_subjects': diploma_subjects,
                'subject_xp_distribution': subject_xp_distribution if subject_xp_distribution else None,
                'xp_value': task.get('xp_value', 100),
                'order_index': next_order + idx,
                'is_required': False,
                'is_manual': True,
                'approval_status': 'approved',
                'created_at': datetime.utcnow().isoformat()
            }

            result = supabase.table('user_quest_tasks')\
                .insert(user_task)\
                .execute()

            if result.data:
                created_tasks.append(result.data[0])

        logger.info(
            f"User {user_id} added {len(created_tasks)} manual tasks to quest {quest_id}"
        )

        return jsonify({
            'success': True,
            'tasks': created_tasks,
            'message': f'Added {len(created_tasks)} task(s) to your quest!'
        })

    except Exception as e:
        logger.error(f"Error adding manual tasks: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to add tasks. Please try again.'
        }), 500


@bp.route('/<quest_id>/finalize-tasks', methods=['POST'])
@require_auth
def finalize_tasks(user_id: str, quest_id: str):
    """
    Finalize personalization and create user-specific tasks.
    This enrolls the user in the quest with their personalized tasks.

    Request body:
    {
        "session_id": "uuid"
    }
    """
    try:
        data = request.get_json()

        # Validate request
        is_valid, error = validate_finalize_tasks_request(data)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        session_id = data['session_id']
        selected_tasks = data['tasks']

        # Get or create enrollment
        user_quest_id = get_or_create_enrollment(user_id, quest_id)

        # Finalize personalization with selected tasks only
        result = personalization_service.finalize_personalization(
            session_id=session_id,
            user_id=user_id,
            quest_id=quest_id,
            user_quest_id=user_quest_id,
            selected_tasks=selected_tasks
        )

        if not result['success']:
            return jsonify(result), 500

        return jsonify({
            'success': True,
            'tasks': result['tasks'],
            'user_quest_id': user_quest_id,
            'message': result['message']
        })

    except Exception as e:
        logger.error(f"Error finalizing tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to finalize tasks'
        }), 500


@bp.route('/<quest_id>/personalization/accept-task', methods=['POST'])
@require_auth
def accept_task_immediate(user_id: str, quest_id: str):
    """
    Immediately accept and add a single task during one-at-a-time review.
    Creates user_quest_tasks entry and saves task to library.

    Request body:
    {
        "session_id": "uuid",
        "task": { task object }
    }
    """
    try:
        from services.task_library_service import TaskLibraryService
        from utils.pillar_utils import normalize_pillar_name
        from services.subject_classification_service import SubjectClassificationService

        supabase = get_supabase_admin_client()
        subject_service = SubjectClassificationService()
        data = request.get_json()

        # Validate request
        is_valid, error = validate_accept_task_request(data)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        session_id = data['session_id']
        task = data['task']

        # Get or create enrollment
        user_quest_id = get_or_create_enrollment(user_id, quest_id)

        # Normalize pillar name
        try:
            pillar_key = normalize_pillar_name(task.get('pillar', 'stem'))
        except ValueError:
            pillar_key = 'stem'

        # Handle diploma_subjects format
        diploma_subjects = normalize_diploma_subjects(
            task.get('diploma_subjects', {}),
            task.get('xp_value', 100)
        )

        # Get next order_index
        next_order = get_next_order_index(user_id, quest_id)

        # Generate subject XP distribution using AI
        subject_xp_distribution = {}
        try:
            subject_xp_distribution = subject_service.classify_task_subjects(
                title=task['title'],
                description=task.get('description', ''),
                pillar=pillar_key,
                xp_value=task.get('xp_value', 100)
            )
            logger.info(f"Generated subject distribution for accepted task '{task['title']}': {subject_xp_distribution}")
        except Exception as e:
            logger.error(f"Failed to generate subject distribution for accepted task '{task['title']}': {e}")

        # Create user_quest_tasks entry
        user_task = {
            'user_id': user_id,
            'quest_id': quest_id,
            'user_quest_id': user_quest_id,
            'title': task['title'],
            'description': task.get('description', ''),
            'pillar': pillar_key,
            'diploma_subjects': diploma_subjects,
            'subject_xp_distribution': subject_xp_distribution if subject_xp_distribution else None,
            'xp_value': task.get('xp_value', 100),
            'order_index': next_order,
            'is_required': False,
            'is_manual': False,
            'approval_status': 'approved',
            'created_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('user_quest_tasks')\
            .insert(user_task)\
            .execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to create task'
            }), 500

        # Save task to library for future users
        library_service = TaskLibraryService()
        library_task_data = {
            'title': task['title'],
            'description': task.get('description', ''),
            'pillar': pillar_key,
            'xp_value': task.get('xp_value', 100),
            'diploma_subjects': diploma_subjects,
            'ai_generated': True
        }
        library_service.add_library_task(quest_id, library_task_data)

        logger.info(f"User {user_id} accepted task '{task['title']}' for quest {quest_id}")

        # Check if user has completed personalization (processed all AI tasks)
        check_and_complete_personalization(user_id, quest_id, session_id)

        return jsonify({
            'success': True,
            'task': result.data[0],
            'message': 'Task added to your quest'
        })

    except Exception as e:
        logger.error(f"Error accepting task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to add task'
        }), 500


@bp.route('/<quest_id>/personalization/skip-task', methods=['POST'])
@require_auth
def skip_task_save_to_library(user_id: str, quest_id: str):
    """
    Save a skipped task to the library so other users can find it.
    This ensures AI-generated tasks aren't lost when users skip them.

    Request body:
    {
        "session_id": "uuid",
        "task": { task object }
    }
    """
    try:
        from services.task_library_service import TaskLibraryService
        from utils.pillar_utils import normalize_pillar_name

        data = request.get_json()

        # Validate request
        is_valid, error = validate_skip_task_request(data)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        session_id = data['session_id']
        task = data['task']

        # Normalize pillar name
        try:
            pillar_key = normalize_pillar_name(task.get('pillar', 'stem'))
        except ValueError:
            pillar_key = 'stem'

        # Handle diploma_subjects format
        diploma_subjects = normalize_diploma_subjects(
            task.get('diploma_subjects', {}),
            task.get('xp_value', 100)
        )

        # Save task to library for future users
        library_service = TaskLibraryService()
        library_task_data = {
            'title': task['title'],
            'description': task.get('description', ''),
            'pillar': pillar_key,
            'xp_value': task.get('xp_value', 100),
            'diploma_subjects': diploma_subjects,
            'ai_generated': True
        }
        library_service.add_library_task(quest_id, library_task_data)

        logger.info(f"User {user_id} skipped task '{task['title']}' - saved to library for quest {quest_id}")

        # Check if user has completed personalization (processed all AI tasks)
        check_and_complete_personalization(user_id, quest_id, session_id)

        return jsonify({
            'success': True,
            'message': 'Task saved to library for other students'
        })

    except Exception as e:
        logger.error(f"Error saving skipped task to library: {str(e)}")
        # Don't fail the skip operation - just log the error
        return jsonify({
            'success': True,
            'message': 'Task skipped (library save failed)'
        })


@bp.route('/<quest_id>/personalization-status', methods=['GET'])
@require_auth
def get_personalization_status(user_id: str, quest_id: str):
    """
    Check if user has completed personalization for a quest.
    """
    try:
        supabase = get_supabase_admin_client()

        enrollment = supabase.table('user_quests')\
            .select('*, quest_personalization_sessions(*)')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .execute()

        if not enrollment.data:
            return jsonify({
                'enrolled': False,
                'personalization_completed': False
            })

        enrollment_data = enrollment.data[0]

        return jsonify({
            'enrolled': True,
            'personalization_completed': enrollment_data.get('personalization_completed', False),
            'session': enrollment_data.get('quest_personalization_sessions')
        })

    except Exception as e:
        logger.error(f"Error checking personalization status: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to check status'
        }), 500
