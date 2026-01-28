"""
Admin Course Refinement Routes
==============================

AI-powered course-wide refinement endpoints.
Available to superadmins, org_admins, and advisors for making conversational bulk changes to course content.

Flow:
1. Start session - User describes change, AI asks clarifying questions
2. Process answers - User answers, AI generates change preview
3. Apply changes - Apply selected changes to database
4. Generate prompt update - Optionally create reusable prompt modifier

Endpoints:
- POST /api/admin/curriculum/refine/<course_id>/start - Start refinement session
- POST /api/admin/curriculum/refine/<course_id>/answer - Answer clarifying questions
- POST /api/admin/curriculum/refine/<course_id>/apply - Apply selected changes
- POST /api/admin/curriculum/refine/<course_id>/generate-prompt-update - Generate prompt modifier
- GET /api/admin/curriculum/refine/<course_id>/session/<session_id> - Get session details
- DELETE /api/admin/curriculum/refine/<course_id>/session/<session_id> - Cancel session
- GET /api/admin/curriculum/refine/categories - Get refinement category suggestions
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_role
from services.course_refine_service import CourseRefineService
from services.base_ai_service import AIGenerationError

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_course_refine', __name__, url_prefix='/api/admin/curriculum/refine')


# =============================================================================
# REFINEMENT CATEGORIES
# =============================================================================

@bp.route('/categories', methods=['GET'])
@require_role('superadmin', 'org_admin', 'advisor')
def get_refinement_categories(user_id):
    """
    Get suggested refinement categories.

    Returns predefined categories with examples to help users
    understand what refinements are possible.

    Returns:
    {
        "success": true,
        "categories": [
            {
                "id": "tone",
                "label": "Adjust tone and language",
                "description": "...",
                "examples": [...]
            },
            ...
        ]
    }
    """
    from prompts.course_refine import get_refinement_categories

    categories = get_refinement_categories()

    return jsonify({
        'success': True,
        'categories': categories
    }), 200


# =============================================================================
# SESSION MANAGEMENT
# =============================================================================

@bp.route('/<course_id>/start', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def start_refine_session(user_id, course_id):
    """
    Start a refinement session for a course.

    Analyzes the user's request and generates clarifying questions
    with suggested answers.

    Request body:
    {
        "request": "Make all task descriptions more action-oriented"
    }

    Returns:
    {
        "success": true,
        "session_id": "uuid",
        "analysis": {
            "understood_request": "...",
            "scope_assessment": "...",
            "potential_impact": "..."
        },
        "questions": [
            {
                "id": "q1",
                "question": "Which areas should this apply to?",
                "context": "Why this matters...",
                "suggestions": [
                    {"id": "q1_a", "label": "All tasks", "description": "..."},
                    ...
                ]
            },
            ...
        ]
    }
    """
    try:
        data = request.get_json()
        user_request = data.get('request', '').strip()

        if not user_request:
            return jsonify({
                'success': False,
                'error': 'Refinement request is required'
            }), 400

        service = CourseRefineService(user_id)
        result = service.start_session(course_id, user_request)

        return jsonify({
            'success': True,
            **result
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404

    except AIGenerationError as e:
        logger.error(f"AI generation error in start_refine_session: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'AI analysis failed: {str(e)}'
        }), 500

    except Exception as e:
        logger.error(f"Error starting refine session: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<course_id>/answer', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def process_answers(user_id, course_id):
    """
    Process answers to clarifying questions.

    Generates a change preview with before/after diffs.

    Request body:
    {
        "session_id": "uuid",
        "answers": [
            {
                "question_id": "q1",
                "question": "Which areas should this apply to?",
                "answer": "All tasks and lesson descriptions"
            },
            ...
        ]
    }

    Returns:
    {
        "success": true,
        "preview": {
            "summary": {
                "total_changes": 15,
                "projects_affected": 3,
                "lessons_affected": 8,
                "tasks_affected": 12,
                "description": "..."
            },
            "changes": [
                {
                    "id": "change_001",
                    "type": "task_description",
                    "location": {...},
                    "field": "description",
                    "before": "...",
                    "after": "...",
                    "reason": "..."
                },
                ...
            ]
        }
    }
    """
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        answers = data.get('answers', [])

        if not session_id:
            return jsonify({
                'success': False,
                'error': 'Session ID is required'
            }), 400

        if not answers:
            return jsonify({
                'success': False,
                'error': 'Answers are required'
            }), 400

        service = CourseRefineService(user_id)
        result = service.process_answers(session_id, answers)

        return jsonify({
            'success': True,
            **result
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404

    except AIGenerationError as e:
        logger.error(f"AI generation error in process_answers: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'AI generation failed: {str(e)}'
        }), 500

    except Exception as e:
        logger.error(f"Error processing answers: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<course_id>/apply', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def apply_changes(user_id, course_id):
    """
    Apply selected changes to the course.

    Request body:
    {
        "session_id": "uuid",
        "change_ids": ["change_001", "change_002", ...]
    }

    Returns:
    {
        "success": true,
        "applied_count": 10,
        "failed_count": 0,
        "errors": []
    }
    """
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        change_ids = data.get('change_ids', [])

        if not session_id:
            return jsonify({
                'success': False,
                'error': 'Session ID is required'
            }), 400

        if not change_ids:
            return jsonify({
                'success': False,
                'error': 'At least one change ID is required'
            }), 400

        service = CourseRefineService(user_id)
        result = service.apply_changes(session_id, change_ids)

        return jsonify({
            'success': True,
            **result
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404

    except Exception as e:
        logger.error(f"Error applying changes: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<course_id>/generate-prompt-update', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def generate_prompt_update(user_id, course_id):
    """
    Generate a prompt modifier based on the refinement session.

    Creates reusable instructions that can be added to course
    generation prompts to apply similar preferences in the future.

    Request body:
    {
        "session_id": "uuid"
    }

    Returns:
    {
        "success": true,
        "modifier": {
            "title": "Action-oriented task titles",
            "instruction": "Use action verbs at the start of all task titles...",
            "applies_to": ["tasks"],
            "example_before": "...",
            "example_after": "..."
        },
        "file_suggestions": [
            {
                "file": "course_generation.py",
                "section": "TASK_GENERATION_PROMPT",
                "where_to_add": "After the TASK NAMING section"
            }
        ]
    }
    """
    try:
        data = request.get_json()
        session_id = data.get('session_id')

        if not session_id:
            return jsonify({
                'success': False,
                'error': 'Session ID is required'
            }), 400

        service = CourseRefineService(user_id)
        result = service.generate_prompt_update(session_id)

        return jsonify({
            'success': True,
            **result
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404

    except AIGenerationError as e:
        logger.error(f"AI generation error in generate_prompt_update: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'AI generation failed: {str(e)}'
        }), 500

    except Exception as e:
        logger.error(f"Error generating prompt update: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<course_id>/session/<session_id>', methods=['GET'])
@require_role('superadmin', 'org_admin', 'advisor')
def get_session(user_id, course_id, session_id):
    """
    Get details of a refinement session.

    Returns:
    {
        "success": true,
        "session": {
            "id": "uuid",
            "course_id": "uuid",
            "status": "active",
            "initial_request": "...",
            "conversation_history": [...],
            "proposed_changes": [...],
            "applied_changes": [...],
            "created_at": "...",
            "updated_at": "..."
        }
    }
    """
    try:
        service = CourseRefineService(user_id)
        session = service.get_session(session_id)

        if not session:
            return jsonify({
                'success': False,
                'error': 'Session not found'
            }), 404

        # Verify session belongs to this course
        if session.get('course_id') != course_id:
            return jsonify({
                'success': False,
                'error': 'Session not found for this course'
            }), 404

        return jsonify({
            'success': True,
            'session': session
        }), 200

    except Exception as e:
        logger.error(f"Error getting session: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<course_id>/session/<session_id>', methods=['DELETE'])
@require_role('superadmin', 'org_admin', 'advisor')
def cancel_session(user_id, course_id, session_id):
    """
    Cancel an active refinement session.

    Returns:
    {
        "success": true
    }
    """
    try:
        service = CourseRefineService(user_id)

        # Verify session exists and belongs to this course
        session = service.get_session(session_id)
        if not session or session.get('course_id') != course_id:
            return jsonify({
                'success': False,
                'error': 'Session not found'
            }), 404

        success = service.cancel_session(session_id)

        if not success:
            return jsonify({
                'success': False,
                'error': 'Failed to cancel session'
            }), 500

        return jsonify({
            'success': True
        }), 200

    except Exception as e:
        logger.error(f"Error cancelling session: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
