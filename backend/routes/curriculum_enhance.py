"""
Curriculum AI Enhancement API endpoints.

Provides AI-powered content enhancement for lesson building.
RESTRICTED: Only available to superadmin users.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from middleware.rate_limiter import rate_limit
from utils.session_manager import session_manager
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('curriculum_enhance', __name__, url_prefix='/api/curriculum')


@bp.route('/enhance', methods=['POST'])
@require_auth
@rate_limit(limit=10, per=3600)  # 10 enhancements per hour
def enhance_content(user_id: str):
    """
    Enhance lesson content using AI.

    RESTRICTED: Superadmin only.

    Body:
        content (str): Raw lesson content (HTML/text)
        lesson_title (str, optional): Lesson title for context
        suggest_resources (list, optional): Resource types to suggest
            - 'videos': Educational video suggestions
            - 'articles': Article and blog post suggestions
            - 'books': Book recommendations
            - 'files': Downloadable resource suggestions
            - 'links': External website/tool suggestions

    Returns:
        200: Enhanced content with steps array (text, video, file types)
        400: Validation error
        403: Not authorized (non-superadmin)
        500: AI processing error
    """
    try:
        # Get effective user
        effective_user_id = session_manager.get_effective_user_id()
        client = get_supabase_admin_client()

        # Check if user is superadmin
        user_result = client.table('users').select('role').eq('id', effective_user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user_role = user_result.data[0].get('role')
        if user_role != 'superadmin':
            logger.warning(f"Non-superadmin user {effective_user_id} attempted AI enhance")
            return jsonify({
                'error': 'This feature is only available to superadmin users'
            }), 403

        # Parse request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        content = data.get('content')
        if not content or not content.strip():
            return jsonify({'error': 'Content is required'}), 400

        lesson_title = data.get('lesson_title')
        suggest_resources = data.get('suggest_resources', [])

        # Validate suggest_resources is a list
        if not isinstance(suggest_resources, list):
            suggest_resources = []

        # Import and use AI service
        try:
            from services.curriculum_ai_service import get_curriculum_ai_service
            ai_service = get_curriculum_ai_service()
        except ValueError as e:
            logger.error(f"AI service initialization failed: {str(e)}")
            return jsonify({
                'error': 'AI service not available. Please check API key configuration.'
            }), 503

        # Enhance content
        result = ai_service.enhance_lesson_content(
            content=content,
            lesson_title=lesson_title,
            suggest_resources=suggest_resources
        )

        if not result.get('success') or not result.get('steps'):
            return jsonify({
                'error': 'Failed to enhance content. Please try again.'
            }), 500

        logger.info(f"Superadmin {effective_user_id} enhanced content into {len(result['steps'])} steps")

        return jsonify({
            'success': True,
            'steps': result['steps']
        }), 200

    except Exception as e:
        logger.error(f"Error enhancing content: {str(e)}")
        return jsonify({
            'error': f'Enhancement failed: {str(e)}'
        }), 500
