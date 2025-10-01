"""
Badge Routes
API endpoints for badge management and progression tracking.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth, require_admin
from services.badge_service import BadgeService

bp = Blueprint('badges', __name__, url_prefix='/api/badges')


@bp.route('', methods=['GET'])
def list_badges():
    """
    List all available badges (filtered by user level if authenticated).

    Query params:
        - pillar: Filter by pillar (optional)
        - status: Filter by status (optional)
    """
    # Get optional filters from query params
    filters = {}
    if request.args.get('pillar'):
        filters['pillar'] = request.args.get('pillar')
    if request.args.get('status'):
        filters['status'] = request.args.get('status')

    # Check if user is authenticated (optional)
    user_id = request.headers.get('X-User-ID')  # Set by auth middleware if present

    badges = BadgeService.get_available_badges(user_id=user_id, filters=filters if filters else None)

    return jsonify({
        'success': True,
        'badges': badges,
        'count': len(badges)
    }), 200


@bp.route('/<badge_id>', methods=['GET'])
def get_badge_detail(badge_id):
    """
    Get badge details with quest requirements and user progress.

    Path params:
        badge_id: Badge UUID
    """
    # Check if user is authenticated (optional)
    user_id = request.headers.get('X-User-ID')

    badge = BadgeService.get_badge_detail(badge_id, user_id=user_id)

    return jsonify({
        'success': True,
        'badge': badge
    }), 200


@bp.route('/<badge_id>/select', methods=['POST'])
@require_auth
def select_badge(user_id, badge_id):
    """
    Start pursuing this badge.

    Path params:
        badge_id: Badge UUID
    """
    user_badge = BadgeService.select_badge(user_id, badge_id)

    return jsonify({
        'success': True,
        'message': 'Badge selected successfully',
        'user_badge': user_badge
    }), 201


@bp.route('/<badge_id>/pause', methods=['POST'])
@require_auth
def pause_badge(user_id, badge_id):
    """
    Pause pursuit of this badge (doesn't lose progress).

    Path params:
        badge_id: Badge UUID
    """
    user_badge = BadgeService.pause_badge(user_id, badge_id)

    return jsonify({
        'success': True,
        'message': 'Badge paused successfully',
        'user_badge': user_badge
    }), 200


@bp.route('/<badge_id>/progress', methods=['GET'])
@require_auth
def get_badge_progress(user_id, badge_id):
    """
    Check badge completion progress.

    Path params:
        badge_id: Badge UUID
    """
    progress = BadgeService.calculate_badge_progress(user_id, badge_id)

    return jsonify({
        'success': True,
        'progress': progress
    }), 200


@bp.route('/my-badges', methods=['GET'])
@require_auth
def get_user_badges(user_id):
    """
    Get user's active and completed badges.

    Query params:
        - status: 'active' or 'completed' (optional, returns both if not specified)
    """
    status = request.args.get('status')

    if status == 'active':
        badges = BadgeService.get_user_active_badges(user_id)
        return jsonify({
            'success': True,
            'active_badges': badges,
            'count': len(badges)
        }), 200

    elif status == 'completed':
        badges = BadgeService.get_user_completed_badges(user_id)
        return jsonify({
            'success': True,
            'completed_badges': badges,
            'count': len(badges)
        }), 200

    else:
        # Return both
        active = BadgeService.get_user_active_badges(user_id)
        completed = BadgeService.get_user_completed_badges(user_id)

        return jsonify({
            'success': True,
            'active_badges': active,
            'completed_badges': completed,
            'active_count': len(active),
            'completed_count': len(completed)
        }), 200


@bp.route('/<badge_id>/quests', methods=['GET'])
def get_badge_quests(badge_id):
    """
    Get all quests that count toward this badge.

    Path params:
        badge_id: Badge UUID
    """
    # Check if user is authenticated (optional)
    user_id = request.headers.get('X-User-ID')

    quests = BadgeService.get_badge_quests(badge_id, user_id=user_id)

    return jsonify({
        'success': True,
        'quests': quests
    }), 200


@bp.route('/<badge_id>/award', methods=['POST'])
@require_auth
def award_badge_endpoint(user_id, badge_id):
    """
    Award badge to user (admin or automatic when requirements met).

    Path params:
        badge_id: Badge UUID
    """
    try:
        user_badge = BadgeService.award_badge(user_id, badge_id)

        return jsonify({
            'success': True,
            'message': 'Congratulations! Badge earned!',
            'user_badge': user_badge
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


# Admin-only endpoints

@bp.route('/admin/create', methods=['POST'])
@require_admin
def create_badge(user_id):
    """
    Create a new badge (admin only).

    Request body:
        - name: Badge name
        - identity_statement: "I am a...", "I can...", etc.
        - description: Badge description
        - pillar_primary: Primary pillar
        - pillar_weights: JSONB pillar distribution
        - min_quests: Minimum quests required
        - min_xp: Minimum XP required
        - portfolio_requirement: Optional portfolio piece
        - status: 'active', 'beta', or 'archived'
    """
    from database import get_supabase_admin_client

    data = request.get_json()

    # Validate required fields
    required = ['name', 'identity_statement', 'description', 'pillar_primary', 'pillar_weights']
    for field in required:
        if field not in data:
            return jsonify({
                'success': False,
                'error': f'Missing required field: {field}'
            }), 400

    # Set defaults
    badge_data = {
        'name': data['name'],
        'identity_statement': data['identity_statement'],
        'description': data['description'],
        'pillar_primary': data['pillar_primary'],
        'pillar_weights': data['pillar_weights'],
        'min_quests': data.get('min_quests', 5),
        'min_xp': data.get('min_xp', 1500),
        'portfolio_requirement': data.get('portfolio_requirement'),
        'ai_generated': data.get('ai_generated', False),
        'status': data.get('status', 'active')
    }

    supabase = get_supabase_admin_client()
    result = supabase.table('badges').insert(badge_data).execute()

    return jsonify({
        'success': True,
        'message': 'Badge created successfully',
        'badge': result.data[0]
    }), 201


@bp.route('/admin/<badge_id>', methods=['PUT'])
@require_admin
def update_badge(user_id, badge_id):
    """
    Update badge details (admin only).

    Path params:
        badge_id: Badge UUID
    """
    from database import get_supabase_admin_client

    data = request.get_json()

    # Remove fields that shouldn't be updated
    data.pop('id', None)
    data.pop('created_at', None)

    supabase = get_supabase_admin_client()
    result = supabase.table('badges').update(data).eq('id', badge_id).execute()

    if not result.data:
        return jsonify({
            'success': False,
            'error': 'Badge not found'
        }), 404

    return jsonify({
        'success': True,
        'message': 'Badge updated successfully',
        'badge': result.data[0]
    }), 200


@bp.route('/admin/<badge_id>/quests', methods=['POST'])
@require_admin
def link_quest_to_badge(user_id, badge_id):
    """
    Link a quest to a badge (admin only).

    Request body:
        - quest_id: Quest UUID
        - is_required: Boolean (default True)
        - order_index: Integer (default 0)
    """
    from database import get_supabase_admin_client

    data = request.get_json()

    if 'quest_id' not in data:
        return jsonify({
            'success': False,
            'error': 'Missing required field: quest_id'
        }), 400

    link_data = {
        'badge_id': badge_id,
        'quest_id': data['quest_id'],
        'is_required': data.get('is_required', True),
        'order_index': data.get('order_index', 0)
    }

    supabase = get_supabase_admin_client()
    result = supabase.table('badge_quests').insert(link_data).execute()

    return jsonify({
        'success': True,
        'message': 'Quest linked to badge successfully',
        'badge_quest': result.data[0]
    }), 201


@bp.route('/admin/<badge_id>/quests/<quest_id>', methods=['DELETE'])
@require_admin
def unlink_quest_from_badge(user_id, badge_id, quest_id):
    """
    Remove a quest from a badge (admin only).

    Path params:
        badge_id: Badge UUID
        quest_id: Quest UUID
    """
    from database import get_supabase_admin_client

    supabase = get_supabase_admin_client()
    result = supabase.table('badge_quests')\
        .delete()\
        .eq('badge_id', badge_id)\
        .eq('quest_id', quest_id)\
        .execute()

    return jsonify({
        'success': True,
        'message': 'Quest unlinked from badge successfully'
    }), 200
