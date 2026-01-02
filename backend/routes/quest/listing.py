"""
Quest Listing API endpoints.
Handles quest listing, filtering, and pagination with organization-aware visibility.

Part of the quests.py refactoring (P2-ARCH-1).
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_client, get_supabase_admin_client
from repositories.quest_repository import QuestRepository
from utils.source_utils import get_quest_header_image
from services.quest_optimization import quest_optimization_service
from utils.validation.sanitizers import sanitize_search_input, sanitize_integer
from utils.logger import get_logger
from utils.api_response_v1 import paginated_response, error_response, success_response
from utils.pagination import get_cursor_params, paginate_cursor, build_cursor_meta

logger = get_logger(__name__)

bp = Blueprint('quest_listing', __name__, url_prefix='/api/quests')


@bp.route('', methods=['GET'])
def list_quests():
    """
    List all active quests with their tasks.
    Public endpoint - no auth required.
    Includes user enrollment data if authenticated.

    Supports two pagination modes:
    1. Cursor-based (recommended): ?limit=20&cursor=<encoded>
    2. Legacy page-based: ?page=2&per_page=20
    """
    try:
        # Check if user is authenticated (prefer cookies, fallback to header)
        from utils.session_manager import session_manager
        user_id = session_manager.get_effective_user_id()

        # Fallback to Authorization header if no cookie session
        if not user_id:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                try:
                    from utils.auth.token_utils import verify_token
                    token = auth_header.split(' ')[1]
                    user_id = verify_token(token)
                except Exception as e:
                    logger.error(f"Auth check failed: {e}")
                    pass  # Continue without auth

        supabase = get_supabase_client()

        # Detect pagination mode: cursor or page-based
        cursor_param = request.args.get('cursor')
        use_cursor_pagination = cursor_param is not None or 'limit' in request.args

        if use_cursor_pagination:
            # Cursor-based pagination (new, recommended)
            cursor, limit = get_cursor_params(default_limit=20, max_limit=100)
            # Set defaults for page/per_page in case code paths need them
            page = 1
            per_page = limit
            logger.info(f"[PAGINATION] Using cursor-based pagination (limit={limit}, has_cursor={cursor is not None})")
        else:
            # Legacy page/per_page pagination
            page = sanitize_integer(request.args.get('page', 1), default=1, min_val=1)
            per_page = sanitize_integer(request.args.get('per_page', 12), default=12, min_val=1, max_val=100)
            limit = per_page  # For consistency
            logger.info(f"[PAGINATION] Using legacy page-based pagination (page={page}, per_page={per_page})")

        search = sanitize_search_input(request.args.get('search', ''))
        pillar_filter = sanitize_search_input(request.args.get('pillar', ''), max_length=50)
        subject_filter = sanitize_search_input(request.args.get('subject', ''), max_length=50)
        topic_filter = sanitize_search_input(request.args.get('topic', ''), max_length=50)
        subtopic_filter = sanitize_search_input(request.args.get('subtopic', ''), max_length=50)
        admin_view = request.args.get('admin_view', '').lower() == 'true'

        # Log search parameter for debugging
        if search:
            logger.info(f"[SEARCH DEBUG] Search term received: '{search}'")

        # Calculate offset for legacy pagination
        if not use_cursor_pagination:
            offset = (page - 1) * per_page

        # Build base query with joins for filtering
        # First, we need to filter quests based on their tasks
        filtered_quest_ids = None

        # Use optimized filtering service
        filtered_quest_ids = quest_optimization_service.get_quest_filtering_optimization(
            pillar_filter, subject_filter
        )

        # Handle empty filter results
        if filtered_quest_ids is not None and len(filtered_quest_ids) == 0:
            if use_cursor_pagination:
                return success_response(
                    data=[],
                    meta={'has_more': False},
                    links={'self': '/api/quests', 'next': None}
                )
            else:
                return paginated_response(
                    data=[],
                    page=page,
                    per_page=per_page,
                    total=0,
                    base_url='/api/quests'
                )

        # Build main quest query
        # Note: In V3 personalized system, quests don't have quest_tasks
        # Users get personalized tasks when they enroll

        # Apply organization-aware visibility filter
        if user_id:
            # Authenticated user: Use repository method for organization-aware filtering
            quest_repo = QuestRepository(user_id=user_id)

            # Prepare filters for repository method
            filters = {}
            if pillar_filter:
                filters['pillar'] = pillar_filter
            if search:
                filters['search'] = search
            if topic_filter:
                filters['topic'] = topic_filter
            if subtopic_filter:
                filters['subtopic'] = subtopic_filter

            # Use organization-aware filtering from repository
            # This respects the user's organization quest visibility policy
            logger.warning(f"[DEBUG] Calling get_quests_for_user: user_id={user_id}, filters={filters}, page={page}, limit={per_page}")
            org_result = quest_repo.get_quests_for_user(
                user_id=user_id,
                filters=filters,
                page=page,
                limit=per_page
            )
            logger.warning(f"[DEBUG] get_quests_for_user returned {len(org_result.get('quests', []))} quests, total={org_result.get('total', 0)}")

            # Return the organization-filtered result
            # Process quest data the same way
            quests = []
            for quest in org_result['quests']:
                quest['total_xp'] = 0
                quest['task_count'] = 0

                # Add source header image if no custom header exists
                if not quest.get('header_image_url') and quest.get('source'):
                    source_header = get_quest_header_image(quest)
                    if source_header:
                        quest['header_image_url'] = source_header

                quests.append(quest)

            # Add user enrollment data
            if quests:
                logger.info(f"[OPTIMIZATION] Using batch queries for {len(quests)} quests")
                quests = quest_optimization_service.enrich_quests_with_user_data(quests, user_id)

            # Return paginated response based on mode
            if use_cursor_pagination:
                # Note: Repository method doesn't support cursor pagination yet
                # Fall back to legacy pagination for authenticated users
                # TODO: Add cursor pagination support to QuestRepository.get_quests_for_user()
                logger.warning("[PAGINATION] Repository doesn't support cursor pagination yet, using page-based")
                return paginated_response(
                    data=quests,
                    page=page if not use_cursor_pagination else 1,
                    per_page=per_page if not use_cursor_pagination else limit,
                    total=org_result['total'],
                    base_url='/api/quests'
                )
            else:
                return paginated_response(
                    data=quests,
                    page=page,
                    per_page=per_page,
                    total=org_result['total'],
                    base_url='/api/quests'
                )

        # Anonymous user: only show global public quests
        query = supabase.table('quests')\
            .select('*', count='exact')\
            .eq('is_active', True)\
            .eq('is_public', True)\
            .is_('organization_id', 'null')

        # Apply quest ID filter if we have filters applied
        if filtered_quest_ids is not None:
            quest_ids_list = list(filtered_quest_ids)
            if quest_ids_list:
                query = query.in_('id', quest_ids_list)
            else:
                # No matching quests - return empty
                if use_cursor_pagination:
                    return success_response(
                        data=[],
                        meta={'has_more': False},
                        links={'self': '/api/quests', 'next': None}
                    )
                else:
                    return paginated_response(
                        data=[],
                        page=page,
                        per_page=per_page,
                        total=0,
                        base_url='/api/quests'
                    )

        # Apply search filter if provided (search in title and big_idea)
        if search:
            logger.info(f"[SEARCH DEBUG] Applying search filter: '{search}'")
            # Search title and big_idea using OR filter
            query = query.or_(f"title.ilike.%{search}%,big_idea.ilike.%{search}%")
            logger.info(f"[SEARCH DEBUG] Query after filter applied")

        # Apply topic filter if provided
        if topic_filter:
            logger.info(f"[TOPIC DEBUG] Applying topic filter: '{topic_filter}'")
            # Filter by topic_primary (main category)
            query = query.eq('topic_primary', topic_filter)

        # Apply subtopic filter if provided
        if subtopic_filter:
            logger.info(f"[SUBTOPIC DEBUG] Applying subtopic filter: '{subtopic_filter}'")
            # Filter by topics array (contains subtopic)
            query = query.contains('topics', [subtopic_filter])

        # Apply ordering and pagination based on mode
        if use_cursor_pagination:
            # Cursor-based pagination
            query, cursor_meta = paginate_cursor(
                query,
                cursor=cursor,
                limit=limit,
                order_column='created_at',
                id_column='id'
            )
            result = query.execute()
        else:
            # Legacy page/per_page pagination
            query = query.order('created_at', desc=True)
            try:
                query = query.range(offset, offset + per_page - 1)
                result = query.execute()
            except Exception as e:
                # Handle 416 "Requested Range Not Satisfiable" errors
                if "416" in str(e) or "Requested Range Not Satisfiable" in str(e):
                    # Return empty results when offset exceeds total count
                    return paginated_response(
                        data=[],
                        page=page,
                        per_page=per_page,
                        total=0,
                        base_url='/api/quests'
                    )
                else:
                    # Re-raise other exceptions
                    raise e

        # Process quest data
        quests = []
        for quest in result.data:
            # In V3 personalized system, XP/tasks are user-specific
            # We'll show placeholders here and populate with actual data
            # when user enrolls
            quest['total_xp'] = 0  # Will be calculated when user personalizes
            quest['task_count'] = 0  # Will be set during personalization
            # DON'T initialize pillar_breakdown here - it will be set by optimization service
            # for enrolled quests only. Unenrolled quests won't have pillar_breakdown since
            # tasks are personalized and don't exist until enrollment.

            # Add source header image if no custom header exists
            if not quest.get('header_image_url') and quest.get('source'):
                source_header = get_quest_header_image(quest)
                if source_header:
                    quest['header_image_url'] = source_header

            # Add quest to list (user enrollment data will be added in batch)
            quests.append(quest)

        # OPTIMIZATION: Add user enrollment data using batch queries instead of N+1
        if user_id and quests:
            logger.info(f"[OPTIMIZATION] Using batch queries for {len(quests)} quests instead of {len(quests) * 2} individual queries")
            quests = quest_optimization_service.enrich_quests_with_user_data(quests, user_id)

        # DEBUG: Log all quests to verify pillar_breakdown is in response
        if quests:
            for idx, q in enumerate(quests[:5]):  # Log first 5 quests
                logger.info(f"[API RESPONSE] Quest {idx}: id={q.get('id', 'no-id')[:8]}, title={q.get('title', 'No title')[:30]}, pillar_breakdown={q.get('pillar_breakdown', {})}, has_enrollment={bool(q.get('user_enrollment') or q.get('completed_enrollment'))}")

        # Return paginated response based on mode
        if use_cursor_pagination:
            # Cursor-based pagination response
            data, meta, links = build_cursor_meta(
                items=quests,
                limit=limit,
                base_url='/api/quests'
            )
            return success_response(
                data=data,
                meta=meta,
                links=links
            )
        else:
            # Legacy page/per_page pagination response
            return paginated_response(
                data=quests,
                page=page,
                per_page=per_page,
                total=result.count,
                base_url='/api/quests'
            )

    except Exception as e:
        logger.error(f"Error listing quests: {str(e)}")
        return error_response(
            code='QUEST_LISTING_ERROR',
            message='Failed to fetch quests',
            status=500
        )


@bp.route('/sources', methods=['GET'])
def get_quest_sources():
    """
    Public endpoint to get quest sources with their header images.
    Used by frontend to display source-based header images.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get all sources with their header images (only public data)
        response = supabase.table('quest_sources')\
            .select('id, name, header_image_url')\
            .execute()

        sources = response.data if response.data else []

        return jsonify({
            'sources': sources,
            'total': len(sources)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching public quest sources: {str(e)}")
        return jsonify({'error': 'Failed to fetch quest sources'}), 500


@bp.route('/topics', methods=['GET'])
def get_quest_topics():
    """
    Get topic statistics for quest discovery map.
    Returns counts of quests per topic category.
    Public endpoint - no auth required.
    """
    try:
        from services.topic_generation_service import get_topic_generation_service

        topic_service = get_topic_generation_service()
        stats = topic_service.get_topic_stats()

        if stats['success']:
            return jsonify({
                'success': True,
                'topics': stats['topics'],
                'total': stats['total']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': stats.get('error', 'Failed to get topic stats'),
                'topics': [],
                'total': 0
            }), 500

    except Exception as e:
        logger.error(f"Error fetching topic stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch topic statistics',
            'topics': [],
            'total': 0
        }), 500


@bp.route('/topics/backfill', methods=['POST'])
def backfill_quest_topics():
    """
    Admin endpoint to backfill topics for all quests.
    Requires superadmin role.
    """
    try:
        from utils.auth.decorators import require_role
        from functools import wraps

        # Check for superadmin
        from utils.session_manager import session_manager
        user_id = session_manager.get_effective_user_id()

        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401

        # Verify superadmin role
        supabase = get_supabase_admin_client()
        user_result = supabase.table('users').select('role').eq('id', user_id).single().execute()

        if not user_result.data or user_result.data.get('role') != 'superadmin':
            return jsonify({'error': 'Superadmin access required'}), 403

        from services.topic_generation_service import get_topic_generation_service

        topic_service = get_topic_generation_service()
        result = topic_service.backfill_all_quests()

        return jsonify(result), 200 if result['success'] else 500

    except Exception as e:
        logger.error(f"Error backfilling topics: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to backfill topics: {str(e)}'
        }), 500
