"""
Analytics Activity Endpoints

Handles recent platform activity feed and individual user activity logs.
"""

from flask import jsonify, request
from datetime import datetime
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.logger import get_logger

from . import bp, get_cached_data, set_cached_data

logger = get_logger(__name__)


@bp.route('/activity', methods=['GET'])
@require_admin
def get_recent_activity(user_id):
    """Get recent platform activity for real-time feed"""
    # Check cache first (shorter TTL for activity feed)
    cached_data = get_cached_data('activity', ttl_seconds=60)
    if cached_data:
        return jsonify({'success': True, 'data': cached_data, 'cached': True})

    supabase = get_supabase_admin_client()

    try:
        # Get all user IDs we'll need and fetch names in bulk
        user_ids_needed = set()

        # Get recent quest completions
        try:
            recent_completions = supabase.table('quest_task_completions')\
                .select('user_id, task_id, quest_id, completed_at')\
                .order('completed_at', desc=True)\
                .limit(10).execute()

            if recent_completions.data:
                for completion in recent_completions.data:
                    if completion.get('user_id'):
                        user_ids_needed.add(completion['user_id'])
        except Exception as e:
            logger.error(f"Error getting recent completions: {e}")
            recent_completions = type('obj', (object,), {'data': []})()

        # Get recent user signups
        try:
            recent_users = supabase.table('users')\
                .select('id, first_name, last_name, created_at')\
                .order('created_at', desc=True)\
                .limit(5).execute()

            if recent_users.data:
                for user in recent_users.data:
                    if user.get('id'):
                        user_ids_needed.add(user['id'])
        except Exception as e:
            logger.error(f"Error getting recent users: {e}")
            recent_users = type('obj', (object,), {'data': []})()

        # Fetch all user names in one query
        user_names = {}
        if user_ids_needed:
            try:
                users_result = supabase.table('users')\
                    .select('id, first_name, last_name, display_name')\
                    .in_('id', list(user_ids_needed))\
                    .execute()

                if users_result.data:
                    for user in users_result.data:
                        user_id = user.get('id')
                        display_name = user.get('display_name')
                        first_name = user.get('first_name', '')
                        last_name = user.get('last_name', '')

                        if display_name:
                            user_names[user_id] = display_name
                        elif first_name or last_name:
                            user_names[user_id] = f"{first_name} {last_name}".strip()
                        else:
                            user_names[user_id] = 'Student'
            except Exception as e:
                logger.error(f"Error fetching user names: {e}")

        # Format activity feed with proper user names
        activities = []

        for completion in recent_completions.data or []:
            user_id = completion.get('user_id')
            user_name = user_names.get(user_id, 'Student')

            activities.append({
                'type': 'quest_completion',
                'timestamp': completion['completed_at'],
                'user_name': user_name,
                'description': f"completed a quest task"
            })

        for user in recent_users.data or []:
            user_id = user.get('id')
            user_name = user_names.get(user_id, 'Student')

            activities.append({
                'type': 'user_signup',
                'timestamp': user['created_at'],
                'user_name': user_name,
                'description': f"joined Optio"
            })

        # Sort by timestamp
        activities.sort(key=lambda x: x['timestamp'], reverse=True)

        result_data = activities[:20]

        # Cache for 1 minute
        set_cached_data('activity', result_data, ttl_seconds=60)

        return jsonify({'success': True, 'data': result_data})

    except Exception as e:
        logger.error(f"Error getting recent activity: {str(e)}")
        return jsonify({'success': True, 'data': []})


@bp.route('/user/<user_id>/activity', methods=['GET'])
@require_admin
def get_user_activity(admin_id, user_id):
    """
    Get individual user's activity logs for admin review.

    Query params:
    - start_date: Start date (ISO format, optional)
    - end_date: End date (ISO format, optional)
    - event_type: Filter by specific event type (optional)
    - limit: Max results (default: 100, max: 500)
    """
    import uuid

    # Validate UUID format
    try:
        uuid.UUID(user_id)
    except (ValueError, AttributeError):
        return jsonify({
            'success': False,
            'error': f'Invalid user_id format: "{user_id}" is not a valid UUID'
        }), 400

    supabase = get_supabase_admin_client()

    try:
        # Parse query parameters
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        event_type_filter = request.args.get('event_type')
        limit = min(int(request.args.get('limit', 100)), 500)

        # Build query
        query = supabase.table('user_activity_events').select(
            'id, event_type, event_category, event_data, page_url, referrer_url, duration_ms, created_at'
        ).eq('user_id', user_id)

        if start_date_str:
            query = query.gte('created_at', start_date_str)
        if end_date_str:
            query = query.lte('created_at', end_date_str)
        if event_type_filter:
            query = query.eq('event_type', event_type_filter)

        response = query.order('created_at', desc=True).limit(limit).execute()
        events = response.data or []

        # Get user info
        user_response = supabase.table('users').select(
            'display_name, first_name, last_name, email, role'
        ).eq('id', user_id).execute()

        user_info = user_response.data[0] if user_response.data else {}
        user_name = user_info.get('display_name') or f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip() or 'Unknown User'

        # Bulk fetch quest and badge names for enrichment
        quest_ids = set()
        badge_ids = set()
        for event in events:
            event_data = event.get('event_data', {})
            if quest_id := event_data.get('quest_id'):
                quest_ids.add(quest_id)
            if badge_id := event_data.get('badge_id'):
                badge_ids.add(badge_id)

        # Filter out non-UUID values
        def is_valid_uuid(value):
            if not isinstance(value, str):
                return False
            try:
                uuid.UUID(value)
                return True
            except (ValueError, AttributeError):
                return False

        quest_ids = {qid for qid in quest_ids if is_valid_uuid(qid)}
        badge_ids = {bid for bid in badge_ids if is_valid_uuid(bid)}

        quest_names = {}
        if quest_ids:
            quests_response = supabase.table('quests').select('id, title').in_('id', list(quest_ids)).execute()
            quest_names = {q['id']: q['title'] for q in (quests_response.data or [])}

        badge_names = {}
        if badge_ids:
            valid_badge_ids = [bid for bid in badge_ids if is_valid_uuid(bid)]
            if valid_badge_ids:
                badges_response = supabase.table('badges').select('id, name').in_('id', valid_badge_ids).execute()
                badge_names = {b['id']: b['name'] for b in (badges_response.data or [])}

        # Format events
        formatted_events = []
        for event in events:
            formatted_events.append({
                'id': event['id'],
                'timestamp': event['created_at'],
                'event_type': event['event_type'],
                'event_category': event['event_category'],
                'page_url': event.get('page_url'),
                'referrer_url': event.get('referrer_url'),
                'duration_ms': event.get('duration_ms'),
                'event_data': event.get('event_data', {}),
                'description': _format_event_description(event, quest_names, badge_names)
            })

        return jsonify({
            'success': True,
            'data': {
                'user': {
                    'id': user_id,
                    'name': user_name,
                    'email': user_info.get('email'),
                    'role': user_info.get('role')
                },
                'events': formatted_events,
                'total_count': len(formatted_events),
                'filters_applied': {
                    'start_date': start_date_str,
                    'end_date': end_date_str,
                    'event_type': event_type_filter,
                    'limit': limit
                }
            }
        })

    except Exception as e:
        logger.error(f"Error fetching user activity for {user_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch user activity'
        }), 500


def _format_event_description(event: dict, quest_names: dict, badge_names: dict) -> str:
    """Format event into human-readable description."""
    event_type = event.get('event_type', '')
    event_data = event.get('event_data', {})
    page_url = event.get('page_url', '')

    quest_id = event_data.get('quest_id')
    quest_name = quest_names.get(quest_id, 'Unknown Quest') if quest_id else 'Unknown Quest'

    badge_id = event_data.get('badge_id')
    badge_name = badge_names.get(badge_id, 'Unknown Badge') if badge_id else 'Unknown Badge'

    descriptions = {
        'login_success': 'Logged in',
        'login_failed': 'Failed login attempt',
        'logout': 'Logged out',
        'registration_success': 'Registered account',
        'dashboard_viewed': 'Viewed dashboard',
        'quest_viewed': f"Viewed quest: {quest_name}",
        'quest_started': f"Started quest: {quest_name}",
        'quest_completed': f"Completed quest: {quest_name}",
        'quest_abandoned': f"Abandoned quest: {quest_name}",
        'task_completed': 'Completed a task',
        'task_viewed': 'Viewed task details',
        'badge_claimed': f"Claimed badge: {badge_name}",
        'badge_viewed': f"Viewed badge: {badge_name}",
        'evidence_uploaded': 'Uploaded evidence file',
        'tutor_opened': 'Opened AI tutor',
        'tutor_message_sent': 'Sent message to AI tutor',
        'tutor_conversation_started': 'Started new tutor conversation',
        'connection_request_sent': 'Sent connection request',
        'connection_accepted': 'Accepted connection request',
        'connection_declined': 'Declined connection request',
        'profile_viewed': 'Viewed user profile',
        'profile_updated': 'Updated profile',
        'portfolio_viewed': 'Viewed portfolio page',
        'parent_dashboard_opened': 'Opened parent dashboard',
        'page_view': f"Viewed page: {page_url}"
    }

    return descriptions.get(event_type, event_type.replace('_', ' ').title())
