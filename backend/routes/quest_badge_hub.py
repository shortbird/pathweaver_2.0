"""
Quest/Badge Hub API
Unified endpoint for the combined quest and badge explorer interface.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_client, get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.validation.sanitizers import sanitize_search_input
from services.badge_service import BadgeService
from typing import Optional

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('quest_badge_hub', __name__, url_prefix='/api/hub')


@bp.route('/badges', methods=['GET'])
def get_badges_for_hub():
    """
    Get badges organized by pillar for the hub carousel view.
    Public endpoint - enriches with user data if authenticated.

    Query params:
        - pillar: Filter by specific pillar (optional)
        - search: Search term for badge name/description (optional)
    """
    try:
        # Check if user is authenticated (optional)
        auth_header = request.headers.get('Authorization')
        user_id = None
        if auth_header and auth_header.startswith('Bearer '):
            try:
                from utils.auth.token_utils import verify_token
                token = auth_header.split(' ')[1]
                user_id = verify_token(token)
            except Exception:
                pass  # Continue without auth

        # Get filter parameters
        pillar_filter = sanitize_search_input(request.args.get('pillar', ''), max_length=50)
        search_term = sanitize_search_input(request.args.get('search', ''))

        # Build filters dict
        filters = {}
        if pillar_filter and pillar_filter != 'ALL':
            filters['pillar'] = pillar_filter

        # Get badges from service (already includes user progress if user_id provided)
        badges = BadgeService.get_available_badges(user_id=user_id, filters=filters if filters else None)

        # Apply search filter if provided (client-side style for consistency)
        if search_term:
            search_lower = search_term.lower()
            badges = [
                b for b in badges
                if search_lower in b.get('name', '').lower()
                or search_lower in b.get('identity_statement', '').lower()
                or search_lower in b.get('description', '').lower()
            ]

        # Group badges by pillar for carousel display (using new single-word pillar names)
        pillar_groups = {
            'stem': [],
            'wellness': [],
            'communication': [],
            'civics': [],
            'art': []
        }

        # Optimization: Fetch all quest counts in bulk to avoid N+1 queries
        badge_ids = [b['id'] for b in badges]
        quest_counts = {}

        if badge_ids:
            # Get quest counts for all badges in one query
            admin_client = get_supabase_admin_client()
            quest_count_result = admin_client.table('badge_quests')\
                .select('badge_id, is_required')\
                .in_('badge_id', badge_ids)\
                .execute()

            # Count quests per badge
            for bq in quest_count_result.data:
                badge_id = bq['badge_id']
                if badge_id not in quest_counts:
                    quest_counts[badge_id] = {'total': 0, 'required': 0}
                quest_counts[badge_id]['total'] += 1
                if bq['is_required']:
                    quest_counts[badge_id]['required'] += 1

        # Import pillar mapping utilities to handle any legacy pillar formats
        from utils.pillar_mapping import normalize_pillar_name, PILLAR_KEYS

        for badge in badges:
            pillar_raw = badge.get('pillar_primary', 'stem')

            # Normalize pillar to new format (handles legacy formats)
            try:
                pillar = normalize_pillar_name(pillar_raw)
            except ValueError:
                # If pillar normalization fails, default to stem
                pillar = 'stem'

            if pillar in pillar_groups:
                # Add quest count info from bulk query
                counts = quest_counts.get(badge['id'], {'total': 0, 'required': 0})
                badge['quest_count'] = counts['total']
                badge['required_quest_count'] = counts['required']

                # Add user progress for display
                if user_id and badge.get('user_progress'):
                    progress = badge['user_progress']
                    badge['progress'] = {
                        'quests_completed': progress.get('quests_completed', 0),
                        'quests_required': badge.get('min_quests', 0),
                        'percentage': progress.get('percentage', 0)
                    }

                pillar_groups[pillar].append(badge)

        # Sort badges within each group by name
        for pillar in pillar_groups:
            pillar_groups[pillar].sort(key=lambda x: x.get('name', ''))

        return jsonify({
            'success': True,
            'badges_by_pillar': pillar_groups,
            'total_badges': len(badges)
        })

    except Exception as e:
        logger.error(f"Error fetching hub badges: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch badges'
        }), 500


@bp.route('/quests', methods=['GET'])
def get_quests_for_hub():
    """
    Get quests for the hub quest view.
    Delegates to existing quest list endpoint with proper formatting.

    Query params:
        - page: Page number (default 1)
        - per_page: Items per page (default 12)
        - search: Search term (optional)
        - pillar: Filter by pillar (optional)
        - sort: Sort order (default 'newest')
    """
    try:
        # This endpoint is essentially a wrapper around the existing quests endpoint
        # We'll import and use the existing quest listing logic
        from routes.quests import list_quests

        # Call the existing quest list endpoint
        return list_quests()

    except Exception as e:
        logger.error(f"Error fetching hub quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch quests'
        }), 500


@bp.route('/stats', methods=['GET'])
@require_auth
def get_hub_stats(user_id: str):
    """
    Get user's hub statistics (badges in progress, quests active, etc.)
    Used for the stats bar at the top of the hub.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get active badges count
        active_badges = supabase.table('user_badges')\
            .select('id', count='exact')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .is_('completed_at', 'null')\
            .execute()

        # Get completed badges count
        completed_badges = supabase.table('user_badges')\
            .select('id', count='exact')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
            .execute()

        # Get active quests count
        active_quests = supabase.table('user_quests')\
            .select('id', count='exact')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .is_('completed_at', 'null')\
            .execute()

        # Get completed quests count
        completed_quests = supabase.table('user_quests')\
            .select('id', count='exact')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
            .execute()

        # Get total XP
        user = supabase.table('users')\
            .select('total_xp, level')\
            .eq('id', user_id)\
            .single()\
            .execute()

        return jsonify({
            'success': True,
            'stats': {
                'active_badges': active_badges.count or 0,
                'completed_badges': completed_badges.count or 0,
                'active_quests': active_quests.count or 0,
                'completed_quests': completed_quests.count or 0,
                'total_xp': user.data.get('total_xp', 0) if user.data else 0,
                'level': user.data.get('level', 1) if user.data else 1
            }
        })

    except Exception as e:
        logger.error(f"Error fetching hub stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch stats'
        }), 500
