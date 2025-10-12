"""
Badge Routes
API endpoints for badge management and progression tracking.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth, require_admin
from services.badge_service import BadgeService

bp = Blueprint('badges', __name__, url_prefix='/api/badges')


@bp.route('/', methods=['GET', 'OPTIONS'])
@bp.route('', methods=['GET', 'OPTIONS'])
def list_badges():
    """
    List all available badges (filtered by user level if authenticated).

    Query params:
        - pillar: Filter by pillar (optional)
        - status: Filter by status (optional)
    """
    # Handle OPTIONS preflight request
    if request.method == 'OPTIONS':
        return '', 200

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
    # Try to get user ID from session (optional - doesn't fail if not logged in)
    from utils.session_manager import session_manager
    user_id = None
    try:
        user_id = session_manager.get_current_user_id()
    except:
        pass  # Not logged in, continue without user context

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
    try:
        user_badge = BadgeService.select_badge(user_id, badge_id)

        return jsonify({
            'success': True,
            'message': 'Badge selected successfully',
            'user_badge': user_badge
        }), 201
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        print(f"Error selecting badge: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to select badge: {str(e)}'
        }), 500


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


@bp.route('/user/<target_user_id>', methods=['GET'])
def get_user_badges_by_id(target_user_id):
    """
    Get a user's active and completed badges by user ID.
    Public endpoint for viewing user badge data (used on diploma page).
    Lightweight version without progress calculation to avoid DB exhaustion.

    Path params:
        target_user_id: User UUID

    Query params:
        - status: 'active' or 'completed' (optional, returns both if not specified)
    """
    from database import get_supabase_admin_client

    supabase = get_supabase_admin_client()
    status = request.args.get('status')

    try:
        # Get user badges with basic badge info (no progress calculation)
        query = supabase.table('user_badges')\
            .select('*, badges(id, name, description, pillar, tier, icon_url, min_quests, min_xp)')\
            .eq('user_id', target_user_id)

        if status == 'active':
            query = query.eq('is_active', True).is_('earned_at', 'null')
        elif status == 'completed':
            query = query.not_.is_('earned_at', 'null')

        result = query.execute()
        user_badges = result.data or []

        # Format response based on status filter
        if status == 'active':
            return jsonify({
                'success': True,
                'user_badges': user_badges,
                'active_badges': user_badges,
                'count': len(user_badges)
            }), 200

        elif status == 'completed':
            return jsonify({
                'success': True,
                'user_badges': user_badges,
                'completed_badges': user_badges,
                'count': len(user_badges)
            }), 200

        else:
            # Separate active and completed
            active = [b for b in user_badges if b.get('earned_at') is None and b.get('is_active')]
            completed = [b for b in user_badges if b.get('earned_at') is not None]

            return jsonify({
                'success': True,
                'user_badges': user_badges,
                'active_badges': active,
                'completed_badges': completed,
                'active_count': len(active),
                'completed_count': len(completed)
            }), 200

    except Exception as e:
        print(f"Error getting user badges: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to get user badges: {str(e)}'
        }), 500


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


@bp.route('/admin/batch-link', methods=['POST'])
@require_admin
def batch_link_quests_to_badges(user_id):
    """
    Batch link multiple quests to badges in one transaction.

    Request body:
        - links: Array of {badge_id, quest_id, is_required, order_index, ai_confidence?, ai_reasoning?}

    Returns:
        Results with success/failure counts and details
    """
    from database import get_supabase_admin_client

    data = request.get_json()

    if not data or 'links' not in data:
        return jsonify({
            'success': False,
            'error': 'Missing required field: links'
        }), 400

    links = data['links']

    if not isinstance(links, list):
        return jsonify({
            'success': False,
            'error': 'links must be an array'
        }), 400

    if len(links) == 0:
        return jsonify({
            'success': False,
            'error': 'links array cannot be empty'
        }), 400

    supabase = get_supabase_admin_client()

    # Validate all links before inserting
    for link in links:
        if 'badge_id' not in link or 'quest_id' not in link:
            return jsonify({
                'success': False,
                'error': 'Each link must have badge_id and quest_id'
            }), 400

    # Insert all links
    links_created = []
    links_failed = []

    for link in links:
        try:
            link_data = {
                'badge_id': link['badge_id'],
                'quest_id': link['quest_id'],
                'is_required': link.get('is_required', False),
                'order_index': link.get('order_index', 0)
            }

            # Add AI metadata if present
            if 'ai_confidence' in link:
                link_data['ai_confidence'] = link['ai_confidence']
            if 'ai_reasoning' in link:
                link_data['ai_reasoning'] = link['ai_reasoning']

            result = supabase.table('badge_quests').insert(link_data).execute()

            if result.data:
                links_created.append({
                    'badge_id': link['badge_id'],
                    'quest_id': link['quest_id']
                })

        except Exception as e:
            links_failed.append({
                'badge_id': link['badge_id'],
                'quest_id': link['quest_id'],
                'error': str(e)
            })

    return jsonify({
        'success': True,
        'links_created': len(links_created),
        'links_failed': len(links_failed),
        'created': links_created,
        'failed': links_failed
    }), 201 if len(links_created) > 0 else 500
