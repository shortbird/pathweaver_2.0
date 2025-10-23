"""
Admin AI Performance Analytics Routes
API endpoints for AI quest performance tracking and A/B testing.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_admin
from services.ai_performance_analytics_service import AIPerformanceAnalyticsService
from utils.validation.sanitizers import sanitize_integer

bp = Blueprint('admin_ai_performance_analytics', __name__, url_prefix='/api/admin/ai-analytics')


@bp.route('/quest-performance', methods=['GET'])
@require_admin
def get_quest_performance(user_id):
    """
    Get performance data for AI-generated quests.

    Query params:
        - limit: Max items to return (default: 50, max: 100)
        - offset: Pagination offset (default: 0)
        - date_from: Filter quests created after this date (ISO format)
        - date_to: Filter quests created before this date (ISO format)
        - quality_score_min: Minimum quality score filter
        - generation_source: Filter by source (manual, batch, student_idea, badge_aligned)
        - sort_by: Field to sort by (default: created_at)
        - sort_direction: asc or desc (default: desc)
    """
    try:
        limit = min(sanitize_integer(request.args.get('limit', 50), default=50), 100)
        offset = sanitize_integer(request.args.get('offset', 0), default=0)

        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        quality_score_min = request.args.get('quality_score_min')
        generation_source = request.args.get('generation_source')
        sort_by = request.args.get('sort_by', 'created_at')
        sort_direction = request.args.get('sort_direction', 'desc')

        # Validate sort_by field
        allowed_sort_fields = ['created_at', 'completion_rate', 'average_rating', 'engagement_score', 'quality_score']
        if sort_by not in allowed_sort_fields:
            sort_by = 'created_at'

        # Validate sort_direction
        if sort_direction not in ['asc', 'desc']:
            sort_direction = 'desc'

        # Convert quality_score_min to float if provided
        if quality_score_min:
            try:
                quality_score_min = float(quality_score_min)
            except ValueError:
                quality_score_min = None

        result = AIPerformanceAnalyticsService.get_quest_performance_data(
            limit=limit,
            offset=offset,
            date_from=date_from,
            date_to=date_to,
            quality_score_min=quality_score_min,
            generation_source=generation_source,
            sort_by=sort_by,
            sort_direction=sort_direction
        )

        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/ai-vs-human', methods=['GET'])
@require_admin
def get_ai_vs_human_comparison(user_id):
    """
    Compare performance of AI-generated vs human-created quests.

    Query params:
        - days_back: Number of days to analyze (default: 30)
    """
    try:
        days_back = sanitize_integer(request.args.get('days_back', 30), default=30)

        # Limit to reasonable range
        days_back = max(1, min(days_back, 365))

        result = AIPerformanceAnalyticsService.get_ai_vs_human_comparison(
            days_back=days_back
        )

        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/prompt-performance', methods=['GET'])
@require_admin
def get_prompt_performance(user_id):
    """
    Get performance comparison across different prompt versions (A/B testing).

    Returns:
        Prompt version performance data with A/B test results
    """
    try:
        result = AIPerformanceAnalyticsService.get_prompt_performance_comparison()

        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/quality-trends', methods=['GET'])
@require_admin
def get_quality_trends(user_id):
    """
    Get quality score trends over time.

    Query params:
        - days_back: Number of days to analyze (default: 30)
        - granularity: 'daily' or 'weekly' (default: daily)
    """
    try:
        days_back = sanitize_integer(request.args.get('days_back', 30), default=30)
        granularity = request.args.get('granularity', 'daily')

        # Validate granularity
        if granularity not in ['daily', 'weekly']:
            granularity = 'daily'

        # Limit to reasonable range
        days_back = max(1, min(days_back, 365))

        result = AIPerformanceAnalyticsService.get_quality_trends(
            days_back=days_back,
            granularity=granularity
        )

        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/refresh-metrics', methods=['POST'])
@require_admin
def refresh_metrics(user_id):
    """
    Manually trigger performance metrics refresh for all AI-generated quests.
    Updates completion rates, ratings, and engagement scores.

    Returns:
        Number of records updated
    """
    try:
        result = AIPerformanceAnalyticsService.refresh_performance_metrics()

        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
