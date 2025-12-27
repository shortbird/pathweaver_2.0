"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Primarily uses BadgeService for all business logic (service layer pattern)
- BadgeRepository used for some operations (lines 437-438)
- Admin endpoints have 5 direct DB calls (lines 478, 522, 544, 573, 603) but acceptable
- Service layer is the preferred pattern over direct repository usage
- Complex badge progression logic properly encapsulated in BadgeService

Badge Routes
API endpoints for badge management and progression tracking.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth, require_admin
from services.badge_service import BadgeService
from repositories.badge_repository import BadgeRepository
from repositories.base_repository import NotFoundError, DatabaseError

from utils.logger import get_logger
from repositories import (
    BadgeRepository,
    QuestRepository,
    TaskCompletionRepository,
    TaskRepository,
    UserRepository
)

logger = get_logger(__name__)

bp = Blueprint('badges', __name__, url_prefix='/api/badges')


# Using repository pattern for database access
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
        user_id = session_manager.get_effective_user_id()  # Use effective user for masquerade support
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
    from database import get_user_client

    try:
        # Tier check removed - all users can select badges (Phase 2 refactoring)
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
        logger.error(f"Error selecting badge: {str(e)}")
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
    from services.badge_service import BadgeService

    # Use badge service for user badge queries
    status = request.args.get('status')

    try:
        # Get user badges using service
        if status == 'active':
            user_badges = BadgeService.get_user_active_badges(target_user_id)
            return jsonify({
                'success': True,
                'user_badges': user_badges,
                'active_badges': user_badges,
                'count': len(user_badges)
            }), 200

        elif status == 'completed':
            user_badges = BadgeService.get_user_completed_badges(target_user_id)
            return jsonify({
                'success': True,
                'user_badges': user_badges,
                'completed_badges': user_badges,
                'count': len(user_badges)
            }), 200

        else:
            # Get both active and completed
            active = BadgeService.get_user_active_badges(target_user_id)
            completed = BadgeService.get_user_completed_badges(target_user_id)
            all_badges = active + completed

            return jsonify({
                'success': True,
                'user_badges': all_badges,
                'active_badges': active,
                'completed_badges': completed,
                'active_count': len(active),
                'completed_count': len(completed)
            }), 200

    except DatabaseError as e:
        logger.error(f"Database error getting user badges: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get user badges'
        }), 500
    except Exception as e:
        logger.error(f"Error getting user badges: {str(e)}")
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


@bp.route('/user/<target_user_id>', methods=['GET'])
def get_user_badges_public(target_user_id):
    """
    Get user's badges for public viewing (diploma page).
    Returns all badges with is_earned status for display on public portfolios.

    Path params:
        target_user_id: UUID of user whose badges to retrieve

    Returns:
        {
            'success': True,
            'user_badges': [
                {
                    'id': badge_id,
                    'name': 'Badge Name',
                    'is_earned': True/False,
                    'earned_at': timestamp or None,
                    'progress': {...}
                }
            ]
        }
    """
    try:
        # Admin client: Public endpoint access (ADR-002, Rule 2)
        from database import get_supabase_admin_client

        supabase = get_supabase_admin_client()

        # Get all user's badge progress (active and completed)
        user_badges_result = supabase.table('user_badges')\
            .select('*, badges(*)')\
            .eq('user_id', target_user_id)\
            .execute()

        user_badges_data = []

        for ub in user_badges_result.data:
            badge = ub.get('badges', {})
            if not badge:
                continue

            badge_data = {
                'id': badge.get('id'),
                'name': badge.get('name'),
                'description': badge.get('description'),
                'identity_statement': badge.get('identity_statement'),
                'pillar_primary': badge.get('pillar_primary'),
                'image_url': badge.get('image_url'),
                'is_earned': ub.get('completed_at') is not None,
                'earned_at': ub.get('completed_at'),
                'started_at': ub.get('started_at'),
                'quests_completed': ub.get('quests_completed', 0),
                'xp_earned': ub.get('xp_earned', 0),
                'min_quests': badge.get('min_quests', 0),
                'min_xp': badge.get('min_xp', 0)
            }

            user_badges_data.append(badge_data)

        # Sort: earned badges first, then by earned date (most recent first)
        user_badges_data.sort(
            key=lambda x: (
                not x['is_earned'],  # False (earned) comes before True (not earned)
                -(x['earned_at'] or '').replace('T', ' ') if x['earned_at'] else ''
            )
        )

        return jsonify({
            'success': True,
            'user_badges': user_badges_data,
            'count': len(user_badges_data),
            'earned_count': sum(1 for b in user_badges_data if b['is_earned'])
        }), 200

    except Exception as e:
        logger.error(f"Error fetching user badges for {target_user_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch user badges',
            'user_badges': []
        }), 500


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
        'is_active': data.get('status', 'active') == 'active'  # Convert status to is_active boolean
    }

    try:
        # Use repository to create badge
        supabase = get_supabase_admin_client()
        badge_repo = BadgeRepository(user_id=None)  # Admin client access
        badge = badge_repo.create(badge_data)

        return jsonify({
            'success': True,
            'message': 'Badge created successfully',
            'badge': badge
        }), 201

    except DatabaseError as e:
        logger.error(f"Database error creating badge: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to create badge'
        }), 500
    except Exception as e:
        logger.error(f"Error creating badge: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to create badge: {str(e)}'
        }), 500


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


@bp.route('/admin/<badge_id>/refresh-image', methods=['POST'])
@require_admin
def refresh_badge_image(user_id, badge_id):
    """
    Refresh the badge image by fetching a new one from Pexels.

    Path params:
        badge_id: Badge UUID
    """
    from database import get_supabase_admin_client
    from services.image_service import search_badge_image
    from datetime import datetime

    supabase = get_supabase_admin_client()

    try:
        # Get badge
        badge = supabase.table('badges').select('*').eq('id', badge_id).single().execute()
        if not badge.data:
            return jsonify({
                'success': False,
                'error': 'Badge not found'
            }), 404

        badge_data = badge.data

        # Fetch new image using badge name and identity statement
        image_url = search_badge_image(
            badge_data['name'],
            badge_data['identity_statement'],
            badge_data.get('pillar_primary')
        )

        if not image_url:
            return jsonify({
                'success': False,
                'error': 'Could not find a suitable image for this badge'
            }), 404

        # Update badge with new image
        update_data = {
            'image_url': image_url,
            'image_generated_at': datetime.utcnow().isoformat(),
            'image_generation_status': 'success',
            'updated_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('badges').update(update_data).eq('id', badge_id).execute()

        return jsonify({
            'success': True,
            'message': 'Badge image refreshed successfully',
            'image_url': image_url
        }), 200

    except Exception as e:
        logger.error(f"Error refreshing badge image: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to refresh badge image: {str(e)}'
        }), 500


@bp.route('/admin/batch-generate-images', methods=['POST'])
@require_admin
def batch_generate_badge_images(user_id):
    """
    Generate images for multiple badges.

    Request body:
    {
        "badge_ids": ["id1", "id2", ...],  # Optional, if not provided processes all without images
        "skip_existing": true,  # Default true - skip badges that already have images
        "max_count": 50  # Optional limit on number of badges to process
    }
    """
    from database import get_supabase_admin_client
    from services.image_service import search_badge_image
    from services.api_usage_tracker import pexels_tracker
    from datetime import datetime

    supabase = get_supabase_admin_client()

    try:
        data = request.get_json() or {}
        badge_ids = data.get('badge_ids', [])
        skip_existing = data.get('skip_existing', True)
        max_count = data.get('max_count', 50)

        # Build query
        query = supabase.table('badges').select('id, name, identity_statement, pillar_primary, image_url')

        # Filter by badge_ids if provided
        if badge_ids:
            query = query.in_('id', badge_ids)

        # Filter out badges that already have images if skip_existing=true
        if skip_existing:
            query = query.is_('image_url', 'null')

        # Limit results
        query = query.limit(max_count)

        badges = query.execute()

        if not badges.data:
            return jsonify({
                'success': True,
                'message': 'No badges found that need images',
                'processed': 0,
                'skipped': 0,
                'failed': 0
            }), 200

        # Check if we have enough API capacity
        needed_calls = len(badges.data)
        usage = pexels_tracker.get_usage()

        if usage['remaining'] < needed_calls:
            return jsonify({
                'success': False,
                'error': f'Not enough API capacity. Need {needed_calls} calls but only {usage["remaining"]} remaining.',
                'usage': usage
            }), 429

        # Process each badge
        processed = 0
        skipped = 0
        failed = 0
        results = []

        for badge in badges.data:
            try:
                # Skip if already has image and skip_existing is true
                if skip_existing and badge.get('image_url'):
                    skipped += 1
                    continue

                # Generate image
                image_url = search_badge_image(
                    badge['name'],
                    badge['identity_statement'],
                    badge.get('pillar_primary')
                )

                if image_url:
                    # Update badge with image
                    update_result = supabase.table('badges').update({
                        'image_url': image_url,
                        'image_generated_at': datetime.utcnow().isoformat(),
                        'image_generation_status': 'success',
                        'updated_at': datetime.utcnow().isoformat()
                    }).eq('id', badge['id']).execute()

                    processed += 1
                    results.append({
                        'badge_id': badge['id'],
                        'name': badge['name'],
                        'status': 'success',
                        'image_url': image_url
                    })
                else:
                    failed += 1
                    # Mark as failed
                    supabase.table('badges').update({
                        'image_generation_status': 'failed',
                        'image_generated_at': datetime.utcnow().isoformat(),
                        'updated_at': datetime.utcnow().isoformat()
                    }).eq('id', badge['id']).execute()

                    results.append({
                        'badge_id': badge['id'],
                        'name': badge['name'],
                        'status': 'failed',
                        'error': 'No image found'
                    })

            except Exception as e:
                failed += 1
                logger.error(f"Error processing badge {badge['id']}: {str(e)}")
                results.append({
                    'badge_id': badge['id'],
                    'name': badge['name'],
                    'status': 'failed',
                    'error': str(e)
                })

        # Get final usage
        final_usage = pexels_tracker.get_usage()

        return jsonify({
            'success': True,
            'message': f'Processed {processed} badges, skipped {skipped}, failed {failed}',
            'processed': processed,
            'skipped': skipped,
            'failed': failed,
            'results': results,
            'usage': final_usage
        }), 200

    except Exception as e:
        logger.error(f"Error in bulk badge image generation: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to generate images: {str(e)}'
        }), 500


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
