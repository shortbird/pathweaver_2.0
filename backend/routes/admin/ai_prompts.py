"""
AI Prompts Management Routes
=============================

Admin routes for managing AI prompt components, viewing metrics,
and testing AI generation.

All routes require superadmin role.

Endpoints:
    GET  /api/admin/ai/prompts/components          - List all components
    GET  /api/admin/ai/prompts/components/<name>   - Get single component
    PUT  /api/admin/ai/prompts/components/<name>   - Update component
    POST /api/admin/ai/prompts/components/<name>/reset - Reset to default
    GET  /api/admin/ai/metrics/summary             - Get metrics summary
    POST /api/admin/ai/generate/test               - Test generation
    GET  /api/admin/ai/health                      - AI service health check
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_superadmin
from services.prompt_management_service import PromptManagementService
from database import get_supabase_admin_client
from utils.logger import get_logger
import os

logger = get_logger(__name__)

ai_prompts_bp = Blueprint('ai_prompts', __name__)


# =============================================================================
# Prompt Component Endpoints
# =============================================================================

@ai_prompts_bp.route('/prompts/components', methods=['GET'])
@require_superadmin
def get_all_components(user_id):
    """
    Get all prompt components.

    Query params:
        - category: Optional filter by category (core, tutor, lesson, quest)

    Returns:
        List of all prompt components with metadata
    """
    try:
        category = request.args.get('category')

        service = PromptManagementService()
        components = service.get_all_components(category=category)

        # Also get category summary
        categories = service.get_categories()

        return jsonify({
            'success': True,
            'components': components,
            'categories': categories,
            'total_count': len(components)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching components: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch components',
            'details': str(e)
        }), 500


@ai_prompts_bp.route('/prompts/components/<name>', methods=['GET'])
@require_superadmin
def get_component(user_id, name):
    """
    Get a single prompt component by name.

    Args:
        name: Component name (e.g., 'CORE_PHILOSOPHY')

    Returns:
        Component data including content, source, and modification status
    """
    try:
        service = PromptManagementService()
        component = service.get_component(name)

        if not component:
            return jsonify({
                'success': False,
                'error': f"Component '{name}' not found"
            }), 404

        return jsonify({
            'success': True,
            'component': component
        }), 200

    except Exception as e:
        logger.error(f"Error fetching component {name}: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch component',
            'details': str(e)
        }), 500


@ai_prompts_bp.route('/prompts/components/<name>', methods=['PUT'])
@require_superadmin
def update_component(user_id, name):
    """
    Update a prompt component's content.

    Args:
        name: Component name

    Request body:
        {
            "content": "New content...",
            "description": "Optional new description"
        }

    Returns:
        Updated component data
    """
    try:
        data = request.get_json()

        if not data or 'content' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: content'
            }), 400

        service = PromptManagementService()

        # Validate content first
        validation = service.validate_component_content(data['content'])
        if not validation['is_valid']:
            return jsonify({
                'success': False,
                'error': 'Content validation failed',
                'issues': validation['issues']
            }), 400

        component = service.update_component(
            name=name,
            content=data['content'],
            user_id=user_id,
            description=data.get('description')
        )

        return jsonify({
            'success': True,
            'component': component,
            'validation': validation,
            'message': f"Component '{name}' updated successfully"
        }), 200

    except Exception as e:
        error_type = type(e).__name__
        status_code = 400 if error_type in ['ValidationError', 'NotFoundError'] else 500

        logger.error(f"Error updating component {name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), status_code


@ai_prompts_bp.route('/prompts/components/<name>/reset', methods=['POST'])
@require_superadmin
def reset_component(user_id, name):
    """
    Reset a component to its Python default value.

    Args:
        name: Component name

    Returns:
        Reset component data
    """
    try:
        service = PromptManagementService()
        component = service.reset_component(name=name, user_id=user_id)

        return jsonify({
            'success': True,
            'component': component,
            'message': f"Component '{name}' reset to default"
        }), 200

    except Exception as e:
        error_type = type(e).__name__
        status_code = 404 if error_type == 'NotFoundError' else 500

        logger.error(f"Error resetting component {name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), status_code


@ai_prompts_bp.route('/prompts/components/<name>/validate', methods=['POST'])
@require_superadmin
def validate_component_content(user_id, name):
    """
    Validate content before saving.

    Request body:
        {
            "content": "Content to validate..."
        }

    Returns:
        Validation results
    """
    try:
        data = request.get_json()

        if not data or 'content' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: content'
            }), 400

        service = PromptManagementService()
        validation = service.validate_component_content(data['content'])

        return jsonify({
            'success': True,
            'validation': validation
        }), 200

    except Exception as e:
        logger.error(f"Error validating content: {e}")
        return jsonify({
            'success': False,
            'error': 'Validation failed',
            'details': str(e)
        }), 500


# =============================================================================
# Metrics Endpoints
# =============================================================================

@ai_prompts_bp.route('/metrics/summary', methods=['GET'])
@require_superadmin
def get_metrics_summary(user_id):
    """
    Get AI metrics summary for dashboard KPIs.

    Returns:
        Metrics summary including quality scores, approval rates, generation counts
    """
    try:
        supabase = get_supabase_admin_client()

        # Get review queue stats
        pending_response = supabase.table('ai_quest_review_queue')\
            .select('id', count='exact')\
            .eq('status', 'pending_review')\
            .execute()

        approved_response = supabase.table('ai_quest_review_queue')\
            .select('id', count='exact')\
            .eq('status', 'approved')\
            .execute()

        rejected_response = supabase.table('ai_quest_review_queue')\
            .select('id', count='exact')\
            .eq('status', 'rejected')\
            .execute()

        total_response = supabase.table('ai_quest_review_queue')\
            .select('id', count='exact')\
            .execute()

        pending_count = pending_response.count or 0
        approved_count = approved_response.count or 0
        rejected_count = rejected_response.count or 0
        total_count = total_response.count or 0

        # Calculate approval rate
        reviewed_count = approved_count + rejected_count
        approval_rate = (approved_count / reviewed_count * 100) if reviewed_count > 0 else 0

        # Get recent generations (last 24 hours)
        from datetime import datetime, timedelta
        yesterday = (datetime.utcnow() - timedelta(hours=24)).isoformat()

        recent_response = supabase.table('ai_quest_review_queue')\
            .select('id', count='exact')\
            .gte('submitted_at', yesterday)\
            .execute()

        generations_today = recent_response.count or 0

        # Get AI model info
        ai_model = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash-lite')

        return jsonify({
            'success': True,
            'metrics': {
                'pending_reviews': pending_count,
                'approved_count': approved_count,
                'rejected_count': rejected_count,
                'total_generations': total_count,
                'approval_rate': round(approval_rate, 1),
                'generations_today': generations_today,
                'ai_model': ai_model,
                'ai_status': 'healthy'  # Could add actual health check
            }
        }), 200

    except Exception as e:
        logger.error(f"Error fetching metrics summary: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch metrics',
            'details': str(e)
        }), 500


@ai_prompts_bp.route('/metrics/trends', methods=['GET'])
@require_superadmin
def get_metrics_trends(user_id):
    """
    Get AI metrics trends over time.

    Query params:
        - days: Number of days to include (default: 7)

    Returns:
        Time-series metrics data
    """
    try:
        days = int(request.args.get('days', 7))
        supabase = get_supabase_admin_client()

        from datetime import datetime, timedelta

        # Get data for each day
        trends = []
        for i in range(days - 1, -1, -1):
            day_start = (datetime.utcnow() - timedelta(days=i)).replace(hour=0, minute=0, second=0).isoformat()
            day_end = (datetime.utcnow() - timedelta(days=i)).replace(hour=23, minute=59, second=59).isoformat()

            # Count generations for this day
            day_response = supabase.table('ai_quest_review_queue')\
                .select('id, status', count='exact')\
                .gte('submitted_at', day_start)\
                .lte('submitted_at', day_end)\
                .execute()

            day_data = day_response.data or []

            approved = sum(1 for d in day_data if d.get('status') == 'approved')
            rejected = sum(1 for d in day_data if d.get('status') == 'rejected')
            pending = sum(1 for d in day_data if d.get('status') == 'pending_review')

            total = len(day_data)
            reviewed = approved + rejected
            rate = (approved / reviewed * 100) if reviewed > 0 else 0

            trends.append({
                'date': (datetime.utcnow() - timedelta(days=i)).strftime('%Y-%m-%d'),
                'generations': total,
                'approved': approved,
                'rejected': rejected,
                'pending': pending,
                'approval_rate': round(rate, 1)
            })

        return jsonify({
            'success': True,
            'trends': trends,
            'days': days
        }), 200

    except Exception as e:
        logger.error(f"Error fetching metrics trends: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch trends',
            'details': str(e)
        }), 500


# =============================================================================
# Testing & Health Endpoints
# =============================================================================

@ai_prompts_bp.route('/generate/test', methods=['POST'])
@require_superadmin
def test_generation(user_id):
    """
    Test AI generation with current prompts.

    Request body:
        {
            "prompt_type": "quest" | "task" | "tutor",
            "context": {
                // Context data for the generation
            }
        }

    Returns:
        Test generation result
    """
    try:
        data = request.get_json() or {}
        prompt_type = data.get('prompt_type', 'quest')

        # Import the appropriate service
        if prompt_type == 'quest':
            from services.quest_ai_service import QuestAIService
            service = QuestAIService()

            # Generate a test quest concept
            test_idea = data.get('context', {}).get('idea', 'Explore local ecosystems')
            result = service.generate_quest_concept(test_idea)

            return jsonify({
                'success': True,
                'result': result,
                'prompt_type': prompt_type,
                'message': 'Test generation completed successfully'
            }), 200

        elif prompt_type == 'task':
            from services.sample_task_generator import generate_sample_tasks
            tasks = generate_sample_tasks(
                quest_title=data.get('context', {}).get('quest_title', 'Test Quest'),
                quest_description=data.get('context', {}).get('quest_description', 'Test description'),
                count=3
            )

            return jsonify({
                'success': True,
                'result': tasks,
                'prompt_type': prompt_type,
                'message': 'Test generation completed successfully'
            }), 200

        else:
            return jsonify({
                'success': False,
                'error': f"Unknown prompt_type: {prompt_type}"
            }), 400

    except Exception as e:
        logger.error(f"Error in test generation: {e}")
        return jsonify({
            'success': False,
            'error': 'Test generation failed',
            'details': str(e)
        }), 500


@ai_prompts_bp.route('/health', methods=['GET'])
@require_superadmin
def ai_health_check(user_id):
    """
    Check AI service health.

    Returns:
        Health status including model availability and configuration
    """
    try:
        health = {
            'status': 'healthy',
            'model': os.getenv('GEMINI_MODEL', 'gemini-2.5-flash-lite'),
            'api_key_configured': bool(os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')),
            'prompt_service': 'available',
            'database': 'available'
        }

        # Check if Gemini model can be initialized
        try:
            from services.base_ai_service import get_gemini_model
            model = get_gemini_model()
            health['model_initialized'] = model is not None
        except Exception as e:
            health['model_initialized'] = False
            health['model_error'] = str(e)
            health['status'] = 'degraded'

        # Check database connection
        try:
            supabase = get_supabase_admin_client()
            supabase.table('ai_prompt_components').select('id').limit(1).execute()
            health['database'] = 'connected'
        except Exception as e:
            health['database'] = 'error'
            health['database_error'] = str(e)
            health['status'] = 'degraded'

        status_code = 200 if health['status'] == 'healthy' else 503

        return jsonify({
            'success': True,
            'health': health
        }), status_code

    except Exception as e:
        logger.error(f"Error in health check: {e}")
        return jsonify({
            'success': False,
            'health': {
                'status': 'unhealthy',
                'error': str(e)
            }
        }), 503
