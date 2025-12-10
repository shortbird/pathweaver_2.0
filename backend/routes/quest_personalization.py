"""
Quest Personalization API Routes
=================================

Handles the personalized quest creation workflow where students work with AI
to generate custom learning paths aligned with their interests.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from services.personalization_service import personalization_service
from services.task_quality_service import TaskQualityService
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('quest_personalization', __name__, url_prefix='/api/quests')

# CORS headers are set globally in app.py - do not duplicate here

# Using repository pattern for database access
@bp.route('/<quest_id>/start-personalization', methods=['POST'])
@require_auth
def start_personalization(user_id: str, quest_id: str):
    """
    Begin the personalization flow for a quest.
    Creates or resumes a personalization session.
    """

    try:
        result = personalization_service.start_personalization_session(
            user_id=user_id,
            quest_id=quest_id
        )

        if not result['success']:
            return jsonify(result), 400

        return jsonify({
            'success': True,
            'session_id': result['session']['id'],
            'session': result['session'],
            'resumed': result.get('resumed', False),
            'message': 'Personalization session started' if not result.get('resumed') else 'Resuming personalization session'
        })

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
        data = request.get_json()

        session_id = data.get('session_id')
        approach = data.get('approach', 'hybrid')  # Default to hybrid if not provided
        interests = data.get('interests', [])
        cross_curricular_subjects = data.get('cross_curricular_subjects', [])

        if not session_id:
            return jsonify({
                'success': False,
                'error': 'session_id is required'
            }), 400

        # Validate approach (optional now)
        valid_approaches = ['real_world_project', 'traditional_class', 'hybrid']
        if approach and approach not in valid_approaches:
            return jsonify({
                'success': False,
                'error': f'Invalid approach. Must be one of: {", ".join(valid_approaches)}'
            }), 400

        # Get optional parameters
        exclude_tasks = data.get('exclude_tasks', [])
        additional_feedback = data.get('additional_feedback', '')

        # Generate tasks
        result = personalization_service.generate_task_suggestions(
            session_id=session_id,
            quest_id=quest_id,
            approach=approach,
            interests=interests,
            cross_curricular_subjects=cross_curricular_subjects,
            exclude_tasks=exclude_tasks,
            additional_feedback=additional_feedback
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
        import traceback
        traceback.print_exc()

        # Check for rate limiting errors from Gemini API
        error_str = str(e).lower()
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

        session_id = data.get('session_id')
        task_index = data.get('task_index')
        student_edits = data.get('student_edits')

        if not session_id or task_index is None or not student_edits:
            return jsonify({
                'success': False,
                'error': 'session_id, task_index, and student_edits are required'
            }), 400

        result = personalization_service.refine_task(
            session_id=session_id,
            task_index=task_index,
            student_edits=student_edits
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
        if not title or len(title) < 3:
            return jsonify({
                'success': False,
                'error': 'Task title must be at least 3 characters'
            }), 400

        if not description or len(description.strip()) == 0:
            return jsonify({
                'success': False,
                'error': 'Task description is required'
            }), 400

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
        from utils.pillar_mapping import normalize_pillar_name
        from services.subject_classification_service import SubjectClassificationService

        supabase = get_supabase_admin_client()
        subject_service = SubjectClassificationService()
        data = request.get_json()

        tasks = data.get('tasks', [])

        if not tasks:
            return jsonify({
                'success': False,
                'error': 'No tasks provided'
            }), 400

        # Check if already enrolled, if not create enrollment
        existing_enrollment = supabase.table('user_quests')\
            .select('id, is_active')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .execute()

        if existing_enrollment.data:
            user_quest_id = existing_enrollment.data[0]['id']
        else:
            enrollment = supabase.table('user_quests')\
                .insert({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'started_at': datetime.utcnow().isoformat(),
                    'is_active': True
                })\
                .execute()

            if not enrollment.data:
                return jsonify({
                    'success': False,
                    'error': 'Failed to create quest enrollment'
                }), 500

            user_quest_id = enrollment.data[0]['id']

        # Get next order_index
        existing_tasks = supabase.table('user_quest_tasks')\
            .select('order_index')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        max_order = max(
            [t.get('order_index', -1) for t in existing_tasks.data],
            default=-1
        ) if existing_tasks.data else -1

        # Create user_quest_tasks entries
        created_tasks = []

        for idx, task in enumerate(tasks):
            # Normalize pillar name
            try:
                pillar_key = normalize_pillar_name(task.get('pillar', 'stem'))
            except ValueError:
                pillar_key = 'stem'

            # Ensure diploma_subjects is a dict
            diploma_subjects = task.get('diploma_subjects', {})
            if not isinstance(diploma_subjects, dict):
                diploma_subjects = {'Electives': task.get('xp_value', 100)}

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
                # Continue without subject distribution - it will be null

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
                'order_index': max_order + idx + 1,
                'is_required': True,
                'is_manual': True,
                'approval_status': 'approved',  # All tasks auto-approved
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

@bp.route('/<quest_id>/add-manual-task', methods=['POST'])
@require_auth
def add_manual_task(user_id: str, quest_id: str):
    """
    DEPRECATED: Use add-manual-tasks endpoint instead.

    Student adds a custom task. Requires admin approval.

    Request body:
    {
        "user_quest_id": "uuid",
        "title": "My custom task",
        "description": "What I want to do...",
        "pillar": "STEM & Logic",
        "xp_value": 100
    }
    """
    try:
        supabase = get_supabase_admin_client()
        data = request.get_json()

        user_quest_id = data.get('user_quest_id')
        title = data.get('title')
        description = data.get('description', '')
        pillar = data.get('pillar')
        xp_value = data.get('xp_value', 100)

        if not user_quest_id or not title or not pillar:
            return jsonify({
                'success': False,
                'error': 'user_quest_id, title, and pillar are required'
            }), 400

        # Validate pillar
        valid_pillars = [
            'STEM & Logic',
            'Life & Wellness',
            'Language & Communication',
            'Society & Culture',
            'Arts & Creativity'
        ]

        if pillar not in valid_pillars:
            return jsonify({
                'success': False,
                'error': f'Invalid pillar. Must be one of: {", ".join(valid_pillars)}'
            }), 400

        # Get current task count for order_index
        existing_tasks = supabase.table('user_quest_tasks')\
            .select('order_index')\
            .eq('user_quest_id', user_quest_id)\
            .execute()

        max_order = max([t['order_index'] for t in existing_tasks.data], default=-1) if existing_tasks.data else -1

        # Create manual task (pending approval)
        manual_task = {
            'user_id': user_id,
            'quest_id': quest_id,
            'user_quest_id': user_quest_id,
            'title': title,
            'description': description,
            'pillar': pillar,
            'xp_value': min(max(xp_value, 50), 200),  # Clamp 50-200
            'order_index': max_order + 1,
            'is_required': True,
            'is_manual': True,
            'approval_status': 'pending',
            'created_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('user_quest_tasks')\
            .insert(manual_task)\
            .execute()

        return jsonify({
            'success': True,
            'task': result.data[0],
            'message': 'Custom task submitted for approval. An advisor will review it soon.'
        })

    except Exception as e:
        logger.error(f"Error adding manual task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to add manual task'
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
        supabase = get_supabase_admin_client()
        data = request.get_json()

        session_id = data.get('session_id')
        selected_tasks = data.get('tasks', [])

        if not session_id:
            return jsonify({
                'success': False,
                'error': 'session_id is required'
            }), 400

        if not selected_tasks:
            return jsonify({
                'success': False,
                'error': 'No tasks selected'
            }), 400

        # Check if already enrolled
        existing_enrollment = supabase.table('user_quests')\
            .select('id, is_active')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .execute()

        # Allow adding more tasks to existing enrollment
        # Users can add tasks multiple times to customize their quest further

        # Create or update enrollment
        if existing_enrollment.data:
            user_quest_id = existing_enrollment.data[0]['id']
        else:
            enrollment = supabase.table('user_quests')\
                .insert({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'started_at': datetime.utcnow().isoformat(),
                    'is_active': True
                })\
                .execute()

            if not enrollment.data:
                return jsonify({
                    'success': False,
                    'error': 'Failed to create enrollment'
                }), 500

            user_quest_id = enrollment.data[0]['id']

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
        import traceback
        traceback.print_exc()
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
        from utils.pillar_mapping import normalize_pillar_name
        from services.subject_classification_service import SubjectClassificationService

        supabase = get_supabase_admin_client()
        subject_service = SubjectClassificationService()
        data = request.get_json()

        session_id = data.get('session_id')
        task = data.get('task')

        if not session_id or not task:
            return jsonify({
                'success': False,
                'error': 'session_id and task are required'
            }), 400

        # Check if already enrolled, if not create enrollment
        existing_enrollment = supabase.table('user_quests')\
            .select('id, is_active')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .execute()

        if existing_enrollment.data:
            user_quest_id = existing_enrollment.data[0]['id']
        else:
            enrollment = supabase.table('user_quests')\
                .insert({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'started_at': datetime.utcnow().isoformat(),
                    'is_active': True
                })\
                .execute()

            if not enrollment.data:
                return jsonify({
                    'success': False,
                    'error': 'Failed to create enrollment'
                }), 500

            user_quest_id = enrollment.data[0]['id']

        # Normalize pillar name
        try:
            pillar_key = normalize_pillar_name(task.get('pillar', 'stem'))
        except ValueError:
            pillar_key = 'stem'

        # Handle diploma_subjects format
        diploma_subjects = task.get('diploma_subjects', {})
        if isinstance(diploma_subjects, list):
            total_xp = task.get('xp_value', 100)
            xp_per = (total_xp // len(diploma_subjects) // 25) * 25
            remainder = total_xp - (xp_per * len(diploma_subjects))
            diploma_subjects = {s: xp_per + (remainder if i == 0 else 0) for i, s in enumerate(diploma_subjects)}
        elif not isinstance(diploma_subjects, dict):
            diploma_subjects = {'Electives': task.get('xp_value', 100)}

        # Get next order_index
        existing_tasks = supabase.table('user_quest_tasks')\
            .select('order_index')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        max_order = max([t.get('order_index', -1) for t in existing_tasks.data], default=-1) if existing_tasks.data else -1

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
            # Continue without subject distribution - it will be null

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
            'order_index': max_order + 1,
            'is_required': True,
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

        # Save task to library and sanitize
        library_service = TaskLibraryService()
        library_task_data = {
            'title': task['title'],
            'description': task.get('description', ''),
            'pillar': pillar_key,
            'xp_value': task.get('xp_value', 100),
            'diploma_subjects': diploma_subjects,
            'ai_generated': True
        }

        # Run AI sanitization on the library (deduplicates, generalizes, removes low-quality)
        sanitization_result = library_service.sanitize_library(quest_id, [library_task_data])
        if sanitization_result.get('success'):
            logger.info(f"Library sanitized for quest {quest_id}: "
                       f"{sanitization_result.get('removed_count', 0)} removed, "
                       f"{sanitization_result.get('deduplicated_count', 0)} deduplicated")

        logger.info(f"User {user_id} accepted task '{task['title']}' for quest {quest_id}")

        return jsonify({
            'success': True,
            'task': result.data[0],
            'message': 'Task added to your quest'
        })

    except Exception as e:
        logger.error(f"Error accepting task: {str(e)}")
        import traceback
        traceback.print_exc()
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
        from utils.pillar_mapping import normalize_pillar_name

        data = request.get_json()

        session_id = data.get('session_id')
        task = data.get('task')

        if not session_id or not task:
            return jsonify({
                'success': False,
                'error': 'session_id and task are required'
            }), 400

        # Normalize pillar name
        try:
            pillar_key = normalize_pillar_name(task.get('pillar', 'stem'))
        except ValueError:
            pillar_key = 'stem'

        # Handle diploma_subjects format
        diploma_subjects = task.get('diploma_subjects', {})
        if isinstance(diploma_subjects, list):
            total_xp = task.get('xp_value', 100)
            xp_per = (total_xp // len(diploma_subjects) // 25) * 25
            remainder = total_xp - (xp_per * len(diploma_subjects))
            diploma_subjects = {s: xp_per + (remainder if i == 0 else 0) for i, s in enumerate(diploma_subjects)}
        elif not isinstance(diploma_subjects, dict):
            diploma_subjects = {'Electives': task.get('xp_value', 100)}

        # Save task to library and sanitize
        library_service = TaskLibraryService()
        library_task_data = {
            'title': task['title'],
            'description': task.get('description', ''),
            'pillar': pillar_key,
            'xp_value': task.get('xp_value', 100),
            'diploma_subjects': diploma_subjects,
            'ai_generated': True
        }

        # Run AI sanitization on the library (deduplicates, generalizes, removes low-quality)
        sanitization_result = library_service.sanitize_library(quest_id, [library_task_data])
        if sanitization_result.get('success'):
            logger.info(f"Library sanitized for quest {quest_id}: "
                       f"{sanitization_result.get('removed_count', 0)} removed, "
                       f"{sanitization_result.get('deduplicated_count', 0)} deduplicated")

        logger.info(f"User {user_id} skipped task '{task['title']}' - saved to library for quest {quest_id}")

        return jsonify({
            'success': True,
            'message': 'Task saved to library for other students'
        })

    except Exception as e:
        logger.error(f"Error saving skipped task to library: {str(e)}")
        import traceback
        traceback.print_exc()
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
