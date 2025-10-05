"""
Quest Personalization API Routes
=================================

Handles the personalized quest creation workflow where students work with AI
to generate custom learning paths aligned with their interests.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth, require_paid_tier
from services.personalization_service import personalization_service
from datetime import datetime

bp = Blueprint('quest_personalization', __name__, url_prefix='/api/quests')

@bp.route('/<quest_id>/start-personalization', methods=['POST'])
@require_auth
@require_paid_tier
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
        print(f"Error starting personalization: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to start personalization'
        }), 500

@bp.route('/<quest_id>/generate-tasks', methods=['POST'])
@require_auth
@require_paid_tier
def generate_tasks(user_id: str, quest_id: str):
    """
    Generate AI task suggestions based on student inputs.

    Request body:
    {
        "session_id": "uuid",
        "approach": "real_world_project|traditional_class|hybrid",
        "interests": ["basketball", "piano", "..."],
        "cross_curricular_subjects": ["math", "science", "..."]
    }
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

        if not approach:
            return jsonify({
                'success': False,
                'error': 'approach is required'
            }), 400

        # Validate approach
        valid_approaches = ['real_world_project', 'traditional_class', 'hybrid']
        if approach not in valid_approaches:
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
        print(f"Error generating tasks: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Failed to generate tasks'
        }), 500

@bp.route('/<quest_id>/refine-tasks', methods=['POST'])
@require_auth
@require_paid_tier
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
        print(f"Error refining tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to refine tasks'
        }), 500

@bp.route('/<quest_id>/edit-task', methods=['POST'])
@require_auth
@require_paid_tier
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
        print(f"Error editing task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to edit task'
        }), 500

@bp.route('/<quest_id>/add-manual-task', methods=['POST'])
@require_auth
@require_paid_tier
def add_manual_task(user_id: str, quest_id: str):
    """
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
        print(f"Error adding manual task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to add manual task'
        }), 500

@bp.route('/<quest_id>/finalize-tasks', methods=['POST'])
@require_auth
@require_paid_tier
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
            .select('id, is_active, personalization_completed')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .execute()

        # Allow adding more tasks to existing enrollment (removed personalization_completed check)
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
                    'is_active': True,
                    'personalization_completed': False
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
        print(f"Error finalizing tasks: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Failed to finalize tasks'
        }), 500

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
        print(f"Error checking personalization status: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to check status'
        }), 500
