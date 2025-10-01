"""
AI Content Generation Routes
API endpoints for AI-powered badge and quest generation.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth, require_admin
from services.ai_badge_generation_service import AIBadgeGenerationService
from services.recommendation_service import RecommendationService
from middleware.error_handler import handle_errors
from database import get_supabase_admin_client

bp = Blueprint('ai_content', __name__, url_prefix='/api/v3/ai-generation')


# Badge Recommendations (User-facing)

@bp.route('/recommendations/badges', methods=['GET'])
@require_auth
@handle_errors
def get_recommended_badges(user_id):
    """
    Get AI-powered badge recommendations for user.

    Query params:
        - limit: Number of recommendations (default: 5)
    """
    limit = request.args.get('limit', default=5, type=int)

    recommendations = RecommendationService.recommend_badges(user_id, limit=limit)

    return jsonify({
        'success': True,
        'recommendations': recommendations,
        'count': len(recommendations)
    }), 200


@bp.route('/recommendations/quests', methods=['GET'])
@require_auth
@handle_errors
def get_recommended_quests(user_id):
    """
    Get AI-powered quest recommendations for user.

    Query params:
        - badge_id: Filter to specific badge (optional)
        - limit: Number of recommendations (default: 3)
    """
    badge_id = request.args.get('badge_id')
    limit = request.args.get('limit', default=3, type=int)

    recommendations = RecommendationService.recommend_quests(
        user_id,
        badge_id=badge_id,
        limit=limit
    )

    return jsonify({
        'success': True,
        'recommendations': recommendations,
        'count': len(recommendations),
        'badge_id': badge_id
    }), 200


@bp.route('/recommendations/next-quest/<badge_id>', methods=['GET'])
@require_auth
@handle_errors
def get_next_quest_recommendation(user_id, badge_id):
    """
    Get single best next quest for badge.

    Path params:
        badge_id: Badge UUID
    """
    next_quest = RecommendationService.get_recommended_next_quest(user_id, badge_id)

    if not next_quest:
        return jsonify({
            'success': True,
            'recommendation': None,
            'message': 'No more quests available for this badge'
        }), 200

    return jsonify({
        'success': True,
        'recommendation': next_quest
    }), 200


@bp.route('/trending/badges', methods=['GET'])
@handle_errors
def get_trending_badges():
    """
    Get currently trending badges.

    Query params:
        - limit: Number of badges (default: 5)
    """
    limit = request.args.get('limit', default=5, type=int)

    trending = RecommendationService.get_trending_badges(limit=limit)

    return jsonify({
        'success': True,
        'trending_badges': trending,
        'count': len(trending)
    }), 200


@bp.route('/analysis/learning-patterns', methods=['GET'])
@require_auth
@handle_errors
def get_learning_patterns(user_id):
    """
    Get detailed learning pattern analysis for user.

    Returns:
        - preferred_pillars: Top pillars by XP
        - completion_rate: Quest completion percentage
        - skill_levels: XP by pillar
        - recent_activity: Last 7 days
    """
    patterns = RecommendationService.analyze_learning_patterns(user_id)

    return jsonify({
        'success': True,
        'learning_patterns': patterns
    }), 200


# Admin Badge Generation

@bp.route('/badges/generate', methods=['POST'])
@require_admin
@handle_errors
def generate_badge(user_id):
    """
    Generate new badge with AI (admin only).

    Request body:
        - target_gap: Content gap to fill (optional)
        - trending_topic: Student interest trend (optional)
        - pillar_focus: Specific pillar (optional)
        - seasonal_context: Time-based context (optional)
    """
    data = request.get_json() or {}

    try:
        badge_data = AIBadgeGenerationService.generate_badge(data)

        return jsonify({
            'success': True,
            'badge': badge_data,
            'quality_score': badge_data.get('quality_score'),
            'message': 'Badge generated successfully'
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/badges/validate', methods=['POST'])
@require_admin
@handle_errors
def validate_badge_quality(user_id):
    """
    Validate badge quality with AI (admin only).

    Request body:
        - badge_data: Badge JSON to validate
    """
    data = request.get_json()

    if 'badge_data' not in data:
        return jsonify({
            'success': False,
            'error': 'Missing required field: badge_data'
        }), 400

    try:
        quality = AIBadgeGenerationService.validate_badge_quality(data['badge_data'])

        return jsonify({
            'success': True,
            'quality_assessment': quality
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/badges/<badge_id>/generate-quests', methods=['POST'])
@require_admin
@handle_errors
def generate_initial_quests(user_id, badge_id):
    """
    Generate starter quests for badge (admin only).

    Path params:
        badge_id: Badge UUID

    Request body:
        - count: Number of quests to generate (default: 12)
    """
    data = request.get_json() or {}
    count = data.get('count', 12)

    try:
        quests = AIBadgeGenerationService.create_initial_quests(badge_id, count=count)

        return jsonify({
            'success': True,
            'quests': quests,
            'count': len(quests),
            'message': f'Generated {len(quests)} quests for badge'
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@bp.route('/metrics/gaps', methods=['GET'])
@require_admin
@handle_errors
def analyze_content_gaps(user_id):
    """
    Identify content library gaps (admin only).

    Returns:
        - pillar_gaps: Missing badges per pillar
        - trending_topics: Current student interests
        - recommendations: Suggested badge topics
    """
    gaps = AIBadgeGenerationService.analyze_content_gaps()

    return jsonify({
        'success': True,
        'content_gaps': gaps
    }), 200


@bp.route('/badges/create-from-generation', methods=['POST'])
@require_admin
@handle_errors
def create_badge_from_generation(user_id):
    """
    Generate badge and immediately create it in database (admin only).

    Request body:
        - generation_params: Parameters for badge generation
        - auto_create_quests: Whether to generate quests too (default: false)
        - quest_count: Number of quests to generate (default: 12)
    """
    data = request.get_json() or {}
    generation_params = data.get('generation_params', {})
    auto_create_quests = data.get('auto_create_quests', False)
    quest_count = data.get('quest_count', 12)

    try:
        # Generate badge
        badge_data = AIBadgeGenerationService.generate_badge(generation_params)

        # Check quality
        if badge_data.get('quality_score', 0) < 0.6:
            return jsonify({
                'success': False,
                'error': 'Generated badge quality too low',
                'quality_score': badge_data.get('quality_score'),
                'feedback': badge_data.get('quality_feedback')
            }), 400

        # Remove quality metadata before inserting
        quality_feedback = badge_data.pop('quality_feedback', None)
        quality_score = badge_data.pop('quality_score', None)

        # Create badge in database
        supabase = get_supabase_admin_client()
        result = supabase.table('badges').insert(badge_data).execute()

        created_badge = result.data[0]
        badge_id = created_badge['id']

        response_data = {
            'success': True,
            'badge': created_badge,
            'quality_score': quality_score,
            'quality_feedback': quality_feedback
        }

        # Generate quests if requested
        if auto_create_quests:
            try:
                quests = AIBadgeGenerationService.create_initial_quests(badge_id, count=quest_count)
                response_data['quests_generated'] = len(quests)
                response_data['quests'] = quests
            except Exception as e:
                response_data['quest_generation_error'] = str(e)

        return jsonify(response_data), 201

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# AI Performance Metrics

@bp.route('/metrics/performance', methods=['GET'])
@require_admin
@handle_errors
def get_ai_performance(user_id):
    """
    Get AI content performance metrics (admin only).

    Query params:
        - content_type: Filter by type (badge/quest/task)
        - min_score: Minimum engagement score
    """
    supabase = get_supabase_admin_client()

    query = supabase.table('ai_content_metrics').select('*').order('last_updated', desc=True)

    content_type = request.args.get('content_type')
    if content_type:
        query = query.eq('content_type', content_type)

    min_score = request.args.get('min_score', type=float)
    if min_score:
        query = query.gte('engagement_score', min_score)

    result = query.limit(100).execute()

    # Calculate summary stats
    metrics = result.data
    total = len(metrics)

    if total > 0:
        avg_engagement = sum(m['engagement_score'] for m in metrics) / total
        avg_completion = sum(m['completion_rate'] for m in metrics) / total
        avg_rating = sum(m.get('student_feedback_avg', 0) for m in metrics) / total
    else:
        avg_engagement = avg_completion = avg_rating = 0

    return jsonify({
        'success': True,
        'metrics': metrics,
        'summary': {
            'total_content': total,
            'avg_engagement_score': round(avg_engagement, 2),
            'avg_completion_rate': round(avg_completion, 2),
            'avg_student_rating': round(avg_rating, 2)
        }
    }), 200
