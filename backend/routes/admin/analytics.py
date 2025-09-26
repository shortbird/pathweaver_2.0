"""
Admin Analytics Routes

Provides comprehensive analytics data for the admin dashboard including
real-time metrics, user engagement, quest completion rates, and system health.
"""

from flask import Blueprint, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from datetime import datetime, timedelta
import json
import sys

bp = Blueprint('admin_analytics', __name__, url_prefix='/api/v3/admin/analytics')

@bp.route('/overview', methods=['GET'])
@require_admin
def get_overview_metrics(user_id):
    """Get key dashboard metrics including active users, quest completions, and XP stats"""
    supabase = get_supabase_admin_client()

    try:
        now = datetime.utcnow()
        today = now.date()
        week_ago = (now - timedelta(days=7)).date()
        month_ago = (now - timedelta(days=30)).date()

        # Get total users
        total_users_result = supabase.table('users').select('id', count='exact').execute()
        total_users = total_users_result.count or 0

        # Get new users this week
        new_users_week = supabase.table('users').select('id', count='exact')\
            .gte('created_at', week_ago.isoformat()).execute()
        new_users_count = new_users_week.count or 0

        # Get active users (active within 7 days)
        active_users_result = supabase.table('users').select('id', count='exact')\
            .gte('last_active', week_ago.isoformat()).execute()
        active_users = active_users_result.count or 0

        # Get quest completions this week
        quest_completions = supabase.table('quest_task_completions').select('id', count='exact')\
            .gte('completed_at', week_ago.isoformat()).execute()
        completions_week = quest_completions.count or 0

        # Get quest completions today
        quest_completions_today = supabase.table('quest_task_completions').select('id', count='exact')\
            .gte('completed_at', today.isoformat()).execute()
        completions_today = quest_completions_today.count or 0

        # Get total XP earned this week
        xp_week = supabase.table('quest_task_completions')\
            .select('quest_tasks!inner(xp_value)')\
            .gte('completed_at', week_ago.isoformat()).execute()

        total_xp_week = sum([completion['quest_tasks']['xp_value'] for completion in xp_week.data]) if xp_week.data else 0

        # Get pending quest submissions
        pending_submissions = supabase.table('quest_submissions').select('id', count='exact')\
            .eq('status', 'pending').execute()
        pending_count = pending_submissions.count or 0

        # Get subscription distribution
        subscription_stats = {}
        for tier in ['explorer', 'supported', 'academy']:
            tier_count = supabase.table('users').select('id', count='exact')\
                .eq('subscription_tier', tier).execute()
            subscription_stats[tier] = tier_count.count or 0

        # Calculate engagement rate (active users / total users)
        engagement_rate = round((active_users / total_users * 100) if total_users > 0 else 0, 1)

        return jsonify({
            'success': True,
            'data': {
                'total_users': total_users,
                'active_users': active_users,
                'new_users_week': new_users_count,
                'quest_completions_today': completions_today,
                'quest_completions_week': completions_week,
                'total_xp_week': total_xp_week,
                'pending_submissions': pending_count,
                'engagement_rate': engagement_rate,
                'subscription_distribution': subscription_stats,
                'last_updated': now.isoformat()
            }
        })

    except Exception as e:
        print(f"Error getting overview metrics: {str(e)}", file=sys.stderr, flush=True)
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve overview metrics'
        }), 500

@bp.route('/activity', methods=['GET'])
@require_admin
def get_recent_activity(user_id):
    """Get recent platform activity for real-time feed"""
    supabase = get_supabase_admin_client()

    try:
        # Get recent quest completions
        recent_completions = supabase.table('quest_task_completions')\
            .select('*, users!inner(first_name, last_name), quest_tasks!inner(title), quests!inner(title)')\
            .order('completed_at', desc=True)\
            .limit(10).execute()

        # Get recent user signups
        recent_users = supabase.table('users')\
            .select('first_name, last_name, created_at, subscription_tier')\
            .order('created_at', desc=True)\
            .limit(5).execute()

        # Get recent quest submissions
        recent_submissions = supabase.table('quest_submissions')\
            .select('*, users!inner(first_name, last_name)')\
            .order('created_at', desc=True)\
            .limit(5).execute()

        # Format activity feed
        activities = []

        # Add completions
        for completion in recent_completions.data or []:
            activities.append({
                'type': 'quest_completion',
                'timestamp': completion['completed_at'],
                'user_name': f"{completion['users']['first_name']} {completion['users']['last_name']}",
                'description': f"completed task '{completion['quest_tasks']['title']}' in quest '{completion['quests']['title']}'"
            })

        # Add new users
        for user in recent_users.data or []:
            activities.append({
                'type': 'user_signup',
                'timestamp': user['created_at'],
                'user_name': f"{user['first_name']} {user['last_name']}",
                'description': f"joined Optio with {user['subscription_tier']} subscription"
            })

        # Add quest submissions
        for submission in recent_submissions.data or []:
            activities.append({
                'type': 'quest_submission',
                'timestamp': submission['created_at'],
                'user_name': f"{submission['users']['first_name']} {submission['users']['last_name']}",
                'description': f"submitted custom quest: '{submission['title']}'"
            })

        # Sort by timestamp
        activities.sort(key=lambda x: x['timestamp'], reverse=True)

        return jsonify({
            'success': True,
            'data': activities[:20]  # Return top 20 recent activities
        })

    except Exception as e:
        print(f"Error getting recent activity: {str(e)}", file=sys.stderr, flush=True)
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve recent activity'
        }), 500

@bp.route('/trends', methods=['GET'])
@require_admin
def get_trends_data(user_id):
    """Get historical trends data for charts"""
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

        # Get XP distribution by pillar (aggregated approach)
        pillar_totals = {
            'STEM and Logic': 0,
            'Life and Wellness': 0,
            'Language and Communication': 0,
            'Society and Culture': 0,
            'Arts and Creativity': 0
        }

        # Get all XP records and aggregate them client-side to avoid URL encoding issues
        try:
            all_xp_result = supabase.table('user_skill_xp')\
                .select('pillar, xp_amount')\
                .execute()

            # Aggregate XP by pillar
            for record in all_xp_result.data or []:
                pillar = record.get('pillar')
                xp_amount = record.get('xp_amount', 0)
                if pillar in pillar_totals:
                    pillar_totals[pillar] += xp_amount

        except Exception as e:
            print(f"Error getting XP data: {e}", file=sys.stderr, flush=True)
            # Keep default zeros if there's an error

        # Get most popular quests (by completion count) - use client-side aggregation
        try:
            all_completions = supabase.table('quest_task_completions')\
                .select('quests!inner(id, title)')\
                .execute()

            # Count completions per quest on client side
            quest_counts = {}
            for completion in all_completions.data or []:
                quest_id = completion['quests']['id']
                quest_title = completion['quests']['title']
                if quest_id not in quest_counts:
                    quest_counts[quest_id] = {'id': quest_id, 'title': quest_title, 'count': 0}
                quest_counts[quest_id]['count'] += 1

            # Sort by count and take top 5
            popular_quests_data = sorted(quest_counts.values(), key=lambda x: x['count'], reverse=True)[:5]
        except Exception as e:
            print(f"Error getting popular quests: {e}", file=sys.stderr, flush=True)
            popular_quests_data = []

        return jsonify({
            'success': True,
            'data': {
                'daily_signups': daily_signups,
                'daily_completions': daily_completions,
                'xp_by_pillar': pillar_totals,
                'popular_quests': popular_quests_data,
                'date_range': {
                    'start': start_date.isoformat(),
                    'end': end_date.isoformat()
                }
            }
        })

    except Exception as e:
        print(f"Error getting trends data: {str(e)}", file=sys.stderr, flush=True)
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve trends data'
        }), 500

@bp.route('/health', methods=['GET'])
@require_admin
def get_system_health(user_id):
    """Get system health indicators and alerts"""
    supabase = get_supabase_admin_client()

    try:
        now = datetime.utcnow()
        week_ago = now - timedelta(days=7)

        # Check for inactive users (no activity in 30+ days)
        inactive_threshold = now - timedelta(days=30)
        inactive_users = supabase.table('users').select('id', count='exact')\
            .lt('last_active', inactive_threshold.isoformat()).execute()

        # Check for stalled quests (started but no progress in 14+ days)
        stalled_threshold = now - timedelta(days=14)
        stalled_quests = supabase.table('user_quests')\
            .select('user_id, quest_id', count='exact')\
            .eq('is_active', True)\
            .is_('completed_at', 'null')\
            .lt('started_at', stalled_threshold.isoformat()).execute()

        # Check quest submission backlog
        old_submissions = supabase.table('quest_submissions').select('id', count='exact')\
            .eq('status', 'pending')\
            .lt('created_at', week_ago.isoformat()).execute()

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

        return jsonify({
            'success': True,
            'data': {
                'health_score': health_score,
                'alerts': alerts,
                'metrics': {
                    'inactive_users': inactive_users.count or 0,
                    'stalled_quests': stalled_quests.count or 0,
                    'old_submissions': old_submissions.count or 0
                },
                'last_checked': now.isoformat()
            }
        })

    except Exception as e:
        print(f"Error getting system health: {str(e)}", file=sys.stderr, flush=True)
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve system health'
        }), 500