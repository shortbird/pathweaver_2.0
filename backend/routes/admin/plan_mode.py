"""
Admin Plan Mode Routes
======================

Iterative AI-assisted course design through natural language conversation.
Teachers describe what they want, refine the outline through dialogue, then generate.

Endpoints:
- POST /api/admin/curriculum/plan/start - Start new plan session
- POST /api/admin/curriculum/plan/<id>/refine - Refine outline with new request
- GET /api/admin/curriculum/plan/<id> - Get session state
- GET /api/admin/curriculum/plan/sessions - List user's sessions
- PUT /api/admin/curriculum/plan/<id> - Update session (save draft, abandon)
- POST /api/admin/curriculum/plan/<id>/approve - Approve and generate course
- GET /api/admin/curriculum/plan/<id>/progress - Get generation progress
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_role
from utils.validation import validate_uuid
from services.course_plan_mode_service import CoursePlanModeService
from services.base_ai_service import AIGenerationError

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_plan_mode', __name__, url_prefix='/api/admin/curriculum/plan')


def get_user_org_context(user_id: str) -> tuple:
    """
    Get organization context for user.

    Returns:
        tuple: (organization_id, is_authorized)
    """
    supabase = get_supabase_admin_client()
    user = supabase.table('users').select('organization_id, role, org_role').eq('id', user_id).execute()

    if not user.data:
        return None, False

    user_data = user.data[0]
    role = user_data.get('role')
    org_role = user_data.get('org_role')

    # Superadmin creates platform-level courses
    if role == 'superadmin':
        return None, True

    # Org admin creates org-level courses
    if role == 'org_managed' and org_role == 'org_admin':
        return user_data.get('organization_id'), True

    # Advisor can create courses
    if role == 'advisor' or (role == 'org_managed' and org_role == 'advisor'):
        return user_data.get('organization_id'), True

    return None, False


# =============================================================================
# SESSION MANAGEMENT
# =============================================================================

@bp.route('/start', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def start_plan_session(user_id):
    """
    Start a new plan mode session.

    Request body:
    {
        "prompt": "Create a math course for a student who loves piano"
    }

    Returns:
    {
        "success": true,
        "session": { "id": "...", "status": "drafting", ... },
        "outline": { "title": "...", "projects": [...] },
        "message": "I've created an initial outline...",
        "suggestions": ["Add hands-on project", ...]
    }
    """
    try:
        data = request.get_json()
        prompt = data.get('prompt', '').strip()

        if not prompt:
            return jsonify({
                'success': False,
                'error': 'Prompt is required'
            }), 400

        if len(prompt) < 10:
            return jsonify({
                'success': False,
                'error': 'Please provide a more detailed course description'
            }), 400

        organization_id, is_authorized = get_user_org_context(user_id)

        if not is_authorized:
            return jsonify({
                'success': False,
                'error': 'You do not have permission to create courses'
            }), 403

        service = CoursePlanModeService(user_id, organization_id)
        result = service.start_session(prompt)

        return jsonify({
            'success': True,
            **result
        }), 200

    except AIGenerationError as e:
        logger.error(f"AI generation error in start_plan_session: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to generate outline: {str(e)}'
        }), 500

    except Exception as e:
        logger.error(f"Error starting plan session: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<session_id>/refine', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def refine_outline(user_id, session_id):
    """
    Refine the outline with a new request.

    Request body:
    {
        "message": "Make project 2 focus more on geometry in sound waves"
    }

    Returns:
    {
        "success": true,
        "outline": { updated outline },
        "changes": [{ "id": "chg_1", "type": "modified", ... }],
        "message": "I've updated project 2...",
        "suggestions": ["Add capstone project", ...]
    }
    """
    try:
        if not validate_uuid(session_id):
            return jsonify({
                'success': False,
                'error': 'Invalid session ID'
            }), 400

        data = request.get_json()
        message = data.get('message', '').strip()

        if not message:
            return jsonify({
                'success': False,
                'error': 'Message is required'
            }), 400

        organization_id, _ = get_user_org_context(user_id)
        service = CoursePlanModeService(user_id, organization_id)
        result = service.refine_outline(session_id, message)

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
        logger.error(f"AI generation error in refine_outline: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to refine outline: {str(e)}'
        }), 500

    except Exception as e:
        logger.error(f"Error refining outline: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<session_id>', methods=['GET'])
@require_role('superadmin', 'org_admin', 'advisor')
def get_session(user_id, session_id):
    """
    Get session state for UI.

    Returns:
    {
        "success": true,
        "session": { "id": "...", "status": "...", ... },
        "outline": { ... },
        "conversation": [{ "role": "user", "content": "..." }, ...]
    }
    """
    try:
        if not validate_uuid(session_id):
            return jsonify({
                'success': False,
                'error': 'Invalid session ID'
            }), 400

        organization_id, _ = get_user_org_context(user_id)
        service = CoursePlanModeService(user_id, organization_id)
        result = service.get_session(session_id)

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
        logger.error(f"Error getting session: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/sessions', methods=['GET'])
@require_role('superadmin', 'org_admin', 'advisor')
def list_sessions(user_id):
    """
    List user's plan sessions.

    Query params:
    - status: Filter by status (drafting, approved, generating, completed, abandoned)

    Returns:
    {
        "success": true,
        "sessions": [{ "id": "...", "title": "...", "status": "...", ... }]
    }
    """
    try:
        status = request.args.get('status')
        organization_id, _ = get_user_org_context(user_id)
        service = CoursePlanModeService(user_id, organization_id)
        sessions = service.list_sessions(status)

        return jsonify({
            'success': True,
            'sessions': sessions
        }), 200

    except Exception as e:
        logger.error(f"Error listing sessions: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<session_id>', methods=['PUT'])
@require_role('superadmin', 'org_admin', 'advisor')
def update_session(user_id, session_id):
    """
    Update session (save draft title or abandon).

    Request body:
    {
        "status": "abandoned"  // Optional: set to 'abandoned' to discard
    }

    Returns:
    {
        "success": true,
        "session": { updated session }
    }
    """
    try:
        if not validate_uuid(session_id):
            return jsonify({
                'success': False,
                'error': 'Invalid session ID'
            }), 400

        data = request.get_json()
        status = data.get('status')

        if status:
            organization_id, _ = get_user_org_context(user_id)
            service = CoursePlanModeService(user_id, organization_id)
            session = service.update_session_status(session_id, status)

            return jsonify({
                'success': True,
                'session': session
            }), 200

        return jsonify({
            'success': True,
            'message': 'No changes made'
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

    except Exception as e:
        logger.error(f"Error updating session: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# =============================================================================
# COURSE GENERATION
# =============================================================================

@bp.route('/<session_id>/approve', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def approve_and_generate(user_id, session_id):
    """
    Approve outline and create draft course.

    Returns:
    {
        "success": true,
        "course_id": "...",
        "status": "generating",
        "message": "Course created. You can now generate lessons..."
    }
    """
    try:
        if not validate_uuid(session_id):
            return jsonify({
                'success': False,
                'error': 'Invalid session ID'
            }), 400

        organization_id, _ = get_user_org_context(user_id)
        service = CoursePlanModeService(user_id, organization_id)
        result = service.approve_and_generate(session_id)

        return jsonify({
            'success': True,
            **result
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

    except Exception as e:
        logger.error(f"Error approving session: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<session_id>/progress', methods=['GET'])
@require_role('superadmin', 'org_admin', 'advisor')
def get_progress(user_id, session_id):
    """
    Get generation progress.

    Returns:
    {
        "success": true,
        "status": "generating",
        "progress": 45,
        "current_step": "Generating lessons...",
        "course_id": "..."  // When available
    }
    """
    try:
        if not validate_uuid(session_id):
            return jsonify({
                'success': False,
                'error': 'Invalid session ID'
            }), 400

        organization_id, _ = get_user_org_context(user_id)
        service = CoursePlanModeService(user_id, organization_id)
        result = service.get_generation_progress(session_id)

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
        logger.error(f"Error getting progress: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
