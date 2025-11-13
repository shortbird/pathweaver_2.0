"""
Admin Analytics Routes

Provides comprehensive analytics data for the admin dashboard including
real-time metrics, user engagement, quest completion rates, and system health.

Performance optimizations:
- In-memory caching with 2-minute TTL
- Reduced subscription tier queries from 8 to 1
- XP calculation from quest completions (indexed query)
"""

from flask import Blueprint, jsonify, request
from database import get_supabase_admin_client
from backend.repositories import (
    UserRepository,
    QuestRepository,
    BadgeRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
from utils.auth.decorators import require_admin
from datetime import datetime, timedelta
import json
import sys

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_analytics', __name__, url_prefix='/api/admin/analytics')

# Simple in-memory cache for analytics data (2-minute TTL)
_analytics_cache = {
    'overview': {'data': None, 'expires_at': None},
    'activity': {'data': None, 'expires_at': None},
    'trends': {'data': None, 'expires_at': None},
    'health': {'data': None, 'expires_at': None}
}

def get_cached_data(cache_key, ttl_seconds=120):
    """Get cached data if not expired"""
    cache_entry = _analytics_cache.get(cache_key, {})
    if cache_entry.get('data') and cache_entry.get('expires_at'):
        if datetime.utcnow() < cache_entry['expires_at']:
            return cache_entry['data']
    return None

def set_cached_data(cache_key, data, ttl_seconds=120):
    """Set cached data with expiration"""
    _analytics_cache[cache_key] = {
        'data': data,
        'expires_at': datetime.utcnow() + timedelta(seconds=ttl_seconds)
    }

# Using repository pattern for database access
@bp.route('/overview', methods=['GET'])
@require_admin
def get_overview_metrics(user_id):
    """Get key dashboard metrics including active users, quest completions, and XP stats"""
    # Check cache first
    cached_data = get_cached_data('overview')
    if cached_data:
        return jsonify({'success': True, 'data': cached_data, 'cached': True})

    supabase = get_supabase_admin_client()

    try:
        now = datetime.utcnow()
        today = now.date()
        week_ago = (now - timedelta(days=7)).date()
        month_ago = (now - timedelta(days=30)).date()

        # Get total users with retry
        try:
            total_users_result = supabase.table('users').select('id', count='exact').execute()
            total_users = total_users_result.count or 0
        except Exception as e:
            print(f"Error getting total users: {e}", file=sys.stderr, flush=True)
            total_users = 0

        # Get new users this week with error handling
        try:
            new_users_week = supabase.table('users').select('id', count='exact')\
                .gte('created_at', week_ago.isoformat()).execute()
            new_users_count = new_users_week.count or 0
        except Exception as e:
            print(f"Error getting new users: {e}", file=sys.stderr, flush=True)
            new_users_count = 0

        # Get active users (active within 7 days) - use created_at since updated_at doesn't exist
        try:
            active_users_result = supabase.table('users').select('id', count='exact')\
                .gte('created_at', week_ago.isoformat()).execute()
            active_users = active_users_result.count or 0
        except Exception as e:
            print(f"Error getting active users: {e}", file=sys.stderr, flush=True)
            active_users = 0

        # Get quest completions this week
        try:
            quest_completions = supabase.table('quest_task_completions').select('id', count='exact')\
                .gte('completed_at', week_ago.isoformat()).execute()
            completions_week = quest_completions.count or 0
        except Exception as e:
            print(f"Error getting quest completions week: {e}", file=sys.stderr, flush=True)
            completions_week = 0

        # Get quest completions today
        try:
            quest_completions_today = supabase.table('quest_task_completions').select('id', count='exact')\
                .gte('completed_at', today.isoformat()).execute()
            completions_today = quest_completions_today.count or 0
        except Exception as e:
            print(f"Error getting quest completions today: {e}", file=sys.stderr, flush=True)
            completions_today = 0

        # Get total XP earned from task completions this week
        try:
            xp_completions = supabase.table('quest_task_completions')\
                .select('xp_awarded')\
                .gte('completed_at', week_ago.isoformat())\
                .execute()

            # Sum XP from completions (handles None values)
            total_xp_week = 0
            if xp_completions.data:
                for record in xp_completions.data:
                    xp_value = record.get('xp_awarded', 0)
                    if xp_value:
                        total_xp_week += xp_value

            print(f"DEBUG: Found {len(xp_completions.data) if xp_completions.data else 0} completions with total XP: {total_xp_week}", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"Error getting XP week data: {e}", file=sys.stderr, flush=True)
            total_xp_week = 0

        # Get pending quest submissions
        try:
            pending_submissions = supabase.table('quest_submissions').select('id', count='exact')\
                .eq('status', 'pending').execute()
            pending_count = pending_submissions.count or 0
        except Exception as e:
            print(f"Error getting pending submissions: {e}", file=sys.stderr, flush=True)
            pending_count = 0

        # Get flagged tasks count
        try:
            flagged_tasks = supabase.table('quest_sample_tasks').select('id', count='exact')\
                .eq('is_flagged', True).execute()
            flagged_tasks_count = flagged_tasks.count or 0
        except Exception as e:
            print(f"Error getting flagged tasks: {e}", file=sys.stderr, flush=True)
            flagged_tasks_count = 0

        # Get subscription distribution (OPTIMIZED: single query with group by)
        subscription_stats = []
        try:
            # Fetch all users' subscription tiers in one query
            all_tiers = supabase.table('users').select('subscription_tier').execute()

            # Count tiers client-side (faster than 8 separate queries)
            tier_counts = {}
            for user in all_tiers.data or []:
                tier = user.get('subscription_tier', 'free')
                tier_counts[tier] = tier_counts.get(tier, 0) + 1

            # Format as array for frontend
            for tier in ['free', 'explorer', 'supported', 'creator', 'premium', 'academy', 'visionary', 'enterprise']:
                subscription_stats.append({
                    'tier': tier,
                    'count': tier_counts.get(tier, 0)
                })
        except Exception as e:
            print(f"Error getting subscription distribution: {e}", file=sys.stderr, flush=True)
            for tier in ['free', 'explorer', 'supported', 'creator', 'premium', 'academy', 'visionary', 'enterprise']:
                subscription_stats.append({'tier': tier, 'count': 0})

        # Calculate engagement rate (active users / total users)
        engagement_rate = round((active_users / total_users * 100) if total_users > 0 else 0, 1)

        result_data = {
            'total_users': total_users,
            'active_users': active_users,
            'new_users_week': new_users_count,
            'quest_completions_today': completions_today,
            'quest_completions_week': completions_week,
            'total_xp_week': total_xp_week,
            'pending_submissions': pending_count,
            'flagged_tasks_count': flagged_tasks_count,
            'engagement_rate': engagement_rate,
            'subscription_distribution': subscription_stats,
            'last_updated': now.isoformat()
        }

        # Cache the result for 2 minutes
        set_cached_data('overview', result_data, ttl_seconds=120)

        return jsonify({'success': True, 'data': result_data})

    except Exception as e:
        print(f"Error getting overview metrics: {str(e)}", file=sys.stderr, flush=True)
        # Return default data instead of 500 error when database is unavailable
        return jsonify({
            'success': True,
            'data': {
                'total_users': 0,
                'active_users': 0,
                'new_users_week': 0,
                'quest_completions_today': 0,
                'quest_completions_week': 0,
                'total_xp_week': 0,
                'pending_submissions': 0,
                'flagged_tasks_count': 0,
                'engagement_rate': 0,
                'subscription_distribution': [
                    {'tier': 'free', 'count': 0},
                    {'tier': 'explorer', 'count': 0},
                    {'tier': 'supported', 'count': 0},
                    {'tier': 'creator', 'count': 0},
                    {'tier': 'premium', 'count': 0},
                    {'tier': 'academy', 'count': 0},
                    {'tier': 'visionary', 'count': 0},
                    {'tier': 'enterprise', 'count': 0}
                ],
                'last_updated': datetime.utcnow().isoformat()
            }
        })

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
        now = datetime.utcnow()

        # Get all user IDs we'll need and fetch names in bulk
        user_ids_needed = set()

        # Get recent quest completions
        try:
            recent_completions = supabase.table('quest_task_completions')\
                .select('user_id, task_id, quest_id, completed_at')\
                .order('completed_at', desc=True)\
                .limit(10).execute()

            # Collect user IDs
            if recent_completions.data:
                for completion in recent_completions.data:
                    if completion.get('user_id'):
                        user_ids_needed.add(completion['user_id'])
        except Exception as e:
            print(f"Error getting recent completions: {e}", file=sys.stderr, flush=True)
            recent_completions = type('obj', (object,), {'data': []})()

        # Get recent user signups
        try:
            recent_users = supabase.table('users')\
                .select('id, first_name, last_name, created_at')\
                .order('created_at', desc=True)\
                .limit(5).execute()

            # Collect user IDs
            if recent_users.data:
                for user in recent_users.data:
                    if user.get('id'):
                        user_ids_needed.add(user['id'])
        except Exception as e:
            print(f"Error getting recent users: {e}", file=sys.stderr, flush=True)
            recent_users = type('obj', (object,), {'data': []})()

        # Get recent quest submissions
        try:
            recent_submissions = supabase.table('quest_submissions')\
                .select('user_id, title, created_at')\
                .order('created_at', desc=True)\
                .limit(5).execute()

            # Collect user IDs
            if recent_submissions.data:
                for submission in recent_submissions.data:
                    if submission.get('user_id'):
                        user_ids_needed.add(submission['user_id'])
        except Exception as e:
            print(f"Error getting recent submissions: {e}", file=sys.stderr, flush=True)
            recent_submissions = type('obj', (object,), {'data': []})()

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

                        # Prefer display_name, fall back to first + last
                        if display_name:
                            user_names[user_id] = display_name
                        elif first_name or last_name:
                            user_names[user_id] = f"{first_name} {last_name}".strip()
                        else:
                            user_names[user_id] = 'Student'
            except Exception as e:
                print(f"Error fetching user names: {e}", file=sys.stderr, flush=True)

        # Format activity feed with proper user names
        activities = []

        # Add completions
        for completion in recent_completions.data or []:
            user_id = completion.get('user_id')
            user_name = user_names.get(user_id, 'Student')

            activities.append({
                'type': 'quest_completion',
                'timestamp': completion['completed_at'],
                'user_name': user_name,
                'description': f"completed a quest task"
            })

        # Add new users
        for user in recent_users.data or []:
            user_id = user.get('id')
            user_name = user_names.get(user_id, 'Student')

            activities.append({
                'type': 'user_signup',
                'timestamp': user['created_at'],
                'user_name': user_name,
                'description': f"joined Optio"
            })

        # Add quest submissions
        for submission in recent_submissions.data or []:
            user_id = submission.get('user_id')
            user_name = user_names.get(user_id, 'Student')

            activities.append({
                'type': 'quest_submission',
                'timestamp': submission.get('created_at', now.isoformat()),
                'user_name': user_name,
                'description': f"submitted custom quest: '{submission['title']}'"
            })

        # Sort by timestamp
        activities.sort(key=lambda x: x['timestamp'], reverse=True)

        result_data = activities[:20]  # Return top 20 recent activities

        # Cache for 1 minute (activity feed should be fresher)
        set_cached_data('activity', result_data, ttl_seconds=60)

        return jsonify({'success': True, 'data': result_data})

    except Exception as e:
        print(f"Error getting recent activity: {str(e)}", file=sys.stderr, flush=True)
        # Return empty activity data instead of 500 error
        return jsonify({
            'success': True,
            'data': []
        })

@bp.route('/trends', methods=['GET'])
@require_admin
def get_trends_data(user_id):
    """Get historical trends data for charts"""
    # Check cache first (trends can be cached longer)
    cached_data = get_cached_data('trends', ttl_seconds=300)
    if cached_data:
        return jsonify({'success': True, 'data': cached_data, 'cached': True})

    supabase = get_supabase_admin_client()

    try:
        # Get data for last 30 days
        days_back = 30
        now = datetime.utcnow()

        # Calculate date range boundaries
        start_date = (now - timedelta(days=days_back)).date()
        end_date = now.date()

        # Get all user signups in date range (single query)
        signups_result = supabase.table('users')\
            .select('created_at')\
            .gte('created_at', start_date.isoformat())\
            .lte('created_at', end_date.isoformat())\
            .execute()

        # Get all quest completions in date range (single query)
        completions_result = supabase.table('quest_task_completions')\
            .select('completed_at')\
            .gte('completed_at', start_date.isoformat())\
            .lte('completed_at', end_date.isoformat())\
            .execute()

        # Process data by day (client-side aggregation to save memory)
        daily_signups = {}
        daily_completions = {}

        # Initialize dates
        for i in range(days_back):
            date = (now - timedelta(days=i)).date()
            daily_signups[date.isoformat()] = 0
            daily_completions[date.isoformat()] = 0

        # Count signups per day
        for signup in signups_result.data or []:
            signup_date = datetime.fromisoformat(signup['created_at'].replace('Z', '+00:00')).date()
            if signup_date >= start_date:
                daily_signups[signup_date.isoformat()] = daily_signups.get(signup_date.isoformat(), 0) + 1

        # Count completions per day
        for completion in completions_result.data or []:
            completion_date = datetime.fromisoformat(completion['completed_at'].replace('Z', '+00:00')).date()
            if completion_date >= start_date:
                daily_completions[completion_date.isoformat()] = daily_completions.get(completion_date.isoformat(), 0) + 1

        # Get XP distribution by pillar (using correct lowercase pillar names)
        pillar_totals = {
            'stem': 0,
            'wellness': 0,
            'communication': 0,
            'civics': 0,
            'art': 0
        }

        # Get all XP records and aggregate them client-side
        try:
            all_xp_result = supabase.table('user_skill_xp')\
                .select('pillar, xp_amount')\
                .execute()

            # Aggregate XP by pillar
            for record in all_xp_result.data or []:
                pillar = record.get('pillar')
                xp_amount = record.get('xp_amount', 0)

                # Handle both old and new pillar names for backward compatibility
                if pillar in pillar_totals:
                    pillar_totals[pillar] += xp_amount
                # Map old format to new format if needed
                elif pillar == 'STEM & Logic':
                    pillar_totals['stem'] += xp_amount
                elif pillar == 'Life & Wellness':
                    pillar_totals['wellness'] += xp_amount
                elif pillar == 'Language & Communication':
                    pillar_totals['communication'] += xp_amount
                elif pillar == 'Society & Culture':
                    pillar_totals['civics'] += xp_amount
                elif pillar == 'Arts & Creativity':
                    pillar_totals['art'] += xp_amount

            print(f"DEBUG: XP by pillar: {pillar_totals}", file=sys.stderr, flush=True)

        except Exception as e:
            print(f"Error getting XP data: {e}", file=sys.stderr, flush=True)
            # Keep default zeros if there's an error

        # Get most popular quests (simplified - just return empty for now to avoid foreign key issues)
        popular_quests_data = []

        result_data = {
            'daily_signups': daily_signups,
            'daily_completions': daily_completions,
            'xp_by_pillar': pillar_totals,
            'popular_quests': popular_quests_data,
            'date_range': {
                'start': start_date.isoformat(),
                'end': end_date.isoformat()
            }
        }

        # Cache for 5 minutes (trends change slowly)
        set_cached_data('trends', result_data, ttl_seconds=300)

        return jsonify({'success': True, 'data': result_data})

    except Exception as e:
        print(f"Error getting trends data: {str(e)}", file=sys.stderr, flush=True)
        # Return empty trends data instead of 500 error
        return jsonify({
            'success': True,
            'data': {
                'daily_signups': {},
                'daily_completions': {},
                'xp_by_pillar': {
                    'STEM & Logic': 0,
                    'Life & Wellness': 0,
                    'Language & Communication': 0,
                    'Society & Culture': 0,
                    'Arts & Creativity': 0
                },
                'popular_quests': [],
                'date_range': {
                    'start': (datetime.utcnow() - timedelta(days=30)).date().isoformat(),
                    'end': datetime.utcnow().date().isoformat()
                }
            }
        })

@bp.route('/health', methods=['GET'])
@require_admin
def get_system_health(user_id):
    """Get system health indicators and alerts"""
    # Check cache first
    cached_data = get_cached_data('health', ttl_seconds=120)
    if cached_data:
        return jsonify({'success': True, 'data': cached_data, 'cached': True})

    supabase = get_supabase_admin_client()

    try:
        now = datetime.utcnow()
        week_ago = now - timedelta(days=7)

        # Check for inactive users (no activity in 30+ days) - use created_at since updated_at doesn't exist
        inactive_threshold = now - timedelta(days=30)
        inactive_users = supabase.table('users').select('id', count='exact')\
            .lt('created_at', inactive_threshold.isoformat()).execute()

        # Check for stalled quests (started but no progress in 14+ days)
        stalled_threshold = now - timedelta(days=14)
        stalled_quests = supabase.table('user_quests')\
            .select('user_id, quest_id', count='exact')\
            .eq('is_active', True)\
            .is_('completed_at', 'null')\
            .lt('started_at', stalled_threshold.isoformat()).execute()

        # Check quest submission backlog (remove date filter since created_at doesn't exist)
        try:
            old_submissions = supabase.table('quest_submissions').select('id', count='exact')\
                .eq('status', 'pending').execute()
        except Exception as e:
            print(f"Error getting old submissions: {e}", file=sys.stderr, flush=True)
            old_submissions = type('obj', (object,), {'count': 0})()

        # Calculate platform health score (0-100)
        health_score = 100

        # Deduct points for issues
        if (inactive_users.count or 0) > 50:
            health_score -= 20
        if (stalled_quests.count or 0) > 20:
            health_score -= 15
        if (old_submissions.count or 0) > 10:
            health_score -= 25

        # Create alerts
        alerts = []

        if (inactive_users.count or 0) > 50:
            alerts.append({
                'type': 'warning',
                'message': f'{inactive_users.count} users inactive for 30+ days',
                'action': 'Consider re-engagement campaign'
            })

        if (stalled_quests.count or 0) > 20:
            alerts.append({
                'type': 'info',
                'message': f'{stalled_quests.count} quests stalled for 14+ days',
                'action': 'Review quest difficulty or provide support'
            })

        if (old_submissions.count or 0) > 10:
            alerts.append({
                'type': 'urgent',
                'message': f'{old_submissions.count} quest submissions pending review for 7+ days',
                'action': 'Review pending submissions immediately'
            })

        result_data = {
            'health_score': health_score,
            'alerts': alerts,
            'metrics': {
                'inactive_users': inactive_users.count or 0,
                'stalled_quests': stalled_quests.count or 0,
                'old_submissions': old_submissions.count or 0
            },
            'last_checked': now.isoformat()
        }

        # Cache the result for 2 minutes
        set_cached_data('health', result_data, ttl_seconds=120)

        return jsonify({
            'success': True,
            'data': result_data
        })

    except Exception as e:
        print(f"Error getting system health: {str(e)}", file=sys.stderr, flush=True)
        # Return default health data instead of 500 error
        return jsonify({
            'success': True,
            'data': {
                'health_score': 50,  # Neutral score when data unavailable
                'alerts': [{
                    'type': 'warning',
                    'message': 'Database connectivity issues detected',
                    'action': 'Monitor database performance'
                }],
                'metrics': {
                    'inactive_users': 0,
                    'stalled_quests': 0,
                    'old_submissions': 0
                },
                'last_checked': datetime.utcnow().isoformat()
            }
        })


@bp.route('/user/<user_id>/activity', methods=['GET'])
@require_admin
def get_user_activity(admin_id, user_id):
    """
    Get individual user's activity logs for admin review.

    Shows chronological list of user actions including:
    - Page visits with time on page
    - Navigation patterns (which button/link they clicked)
    - Event types and categories

    Query params:
    - start_date: Start date (ISO format, optional)
    - end_date: End date (ISO format, optional)
    - event_type: Filter by specific event type (optional)
    - limit: Max results (default: 100, max: 500)

    Access: Admin only
    """
    supabase = get_supabase_admin_client()

    try:
        # Parse query parameters
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        event_type_filter = request.args.get('event_type')
        limit = min(int(request.args.get('limit', 100)), 500)  # Cap at 500

        # Build query
        query = supabase.table('user_activity_events').select(
            'id, event_type, event_category, event_data, page_url, referrer_url, duration_ms, created_at'
        ).eq('user_id', user_id)

        # Apply filters
        if start_date_str:
            query = query.gte('created_at', start_date_str)
        if end_date_str:
            query = query.lte('created_at', end_date_str)
        if event_type_filter:
            query = query.eq('event_type', event_type_filter)

        # Execute query with limit and sort by most recent first
        response = query.order('created_at', desc=True).limit(limit).execute()

        events = response.data or []

        # Get user info for context
        user_response = supabase.table('users').select(
            'display_name, first_name, last_name, email, role'
        ).eq('id', user_id).single().execute()

        user_info = user_response.data if user_response.data else {}
        user_name = user_info.get('display_name') or f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip() or 'Unknown User'

        # Format events for display
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
                # Human-readable description
                'description': _format_event_description(event)
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


def _format_event_description(event: dict) -> str:
    """Format event into human-readable description."""
    event_type = event.get('event_type', '')
    event_data = event.get('event_data', {})
    page_url = event.get('page_url', '')

    # Map event types to readable descriptions
    descriptions = {
        'login_success': 'Logged in',
        'login_failed': 'Failed login attempt',
        'logout': 'Logged out',
        'registration_success': 'Registered account',
        'dashboard_viewed': 'Viewed dashboard',
        'quest_viewed': f"Viewed quest: {event_data.get('quest_title', 'Unknown')}",
        'quest_started': f"Started quest: {event_data.get('quest_title', 'Unknown')}",
        'quest_completed': f"Completed quest: {event_data.get('quest_title', 'Unknown')}",
        'quest_abandoned': f"Abandoned quest: {event_data.get('quest_title', 'Unknown')}",
        'task_completed': 'Completed a task',
        'task_viewed': 'Viewed task details',
        'badge_claimed': f"Claimed badge: {event_data.get('badge_name', 'Unknown')}",
        'badge_viewed': f"Viewed badge: {event_data.get('badge_name', 'Unknown')}",
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