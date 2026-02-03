"""
User Global Engagement API endpoint.
Provides rhythm/engagement metrics across all quests for the dashboard.
"""

from flask import Blueprint, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.logger import get_logger
from datetime import datetime, timedelta, date as date_type
from collections import defaultdict

logger = get_logger(__name__)

bp = Blueprint('user_engagement', __name__)


def calculate_intensity(activity_count: int) -> int:
    """Map activity count to 0-4 intensity for heat map."""
    if activity_count == 0:
        return 0
    if activity_count == 1:
        return 1
    if activity_count == 2:
        return 2
    if activity_count <= 4:
        return 3
    return 4


def calculate_rhythm_state(activity_dates: list, today: date_type) -> dict:
    """
    Determine rhythm state based on activity patterns.
    All states are framed positively.
    """
    if not activity_dates:
        return {
            "state": "ready_to_begin",
            "state_display": "Ready to Begin",
            "message": "Your learning adventure awaits",
            "pattern_description": "Start exploring when you're ready"
        }

    # Convert to date objects if needed
    converted_dates = []
    for d in activity_dates:
        if isinstance(d, date_type):
            converted_dates.append(d)
        elif isinstance(d, str):
            converted_dates.append(datetime.fromisoformat(d.replace('Z', '+00:00')).date())
        elif hasattr(d, 'date'):
            converted_dates.append(d.date())
        else:
            converted_dates.append(d)
    activity_dates = sorted(converted_dates)

    most_recent = max(activity_dates)
    days_since_last = (today - most_recent).days

    # Get activity in different time windows
    last_14_days = [d for d in activity_dates if (today - d).days <= 14]
    last_7_days = [d for d in activity_dates if (today - d).days <= 7]
    previous_14_days = [d for d in activity_dates if 14 < (today - d).days <= 28]

    # Fresh return: Activity in last 3 days after 7+ day gap
    if len(activity_dates) >= 2 and days_since_last <= 3:
        sorted_dates = sorted(activity_dates, reverse=True)
        if len(sorted_dates) >= 2:
            gap_before_return = (sorted_dates[0] - sorted_dates[1]).days
            if gap_before_return >= 7:
                return {
                    "state": "fresh_return",
                    "state_display": "Welcome Back",
                    "message": "Great to see you again",
                    "pattern_description": f"Returning after a {gap_before_return}-day refresh"
                }

    # In flow: Consistent engagement
    if len(last_14_days) >= 3 and days_since_last <= 5:
        if len(last_14_days) >= 2:
            sorted_recent = sorted(last_14_days)
            gaps = [(sorted_recent[i+1] - sorted_recent[i]).days for i in range(len(sorted_recent)-1)]
            avg_gap = sum(gaps) / len(gaps) if gaps else 0
            if avg_gap <= 5:
                return {
                    "state": "in_flow",
                    "state_display": "In Flow",
                    "message": "You're in a consistent rhythm",
                    "pattern_description": "Engaging regularly"
                }

    # Building momentum: Increasing frequency
    if len(last_14_days) > len(previous_14_days) and days_since_last <= 7:
        return {
            "state": "building",
            "state_display": "Building Momentum",
            "message": "Your learning energy is growing",
            "pattern_description": "You're picking up the pace"
        }

    # Resting: 4-14 days since last activity
    if 4 <= days_since_last <= 14:
        return {
            "state": "resting",
            "state_display": "Resting",
            "message": "Learning has natural rhythms",
            "pattern_description": "Taking time to absorb what you've learned"
        }

    # Long gap
    if days_since_last > 14:
        return {
            "state": "ready_when_you_are",
            "state_display": "Ready to Begin",
            "message": "Your learning journey awaits",
            "pattern_description": "Pick up where you left off"
        }

    # Default
    return {
        "state": "finding_rhythm",
        "state_display": "Finding Your Rhythm",
        "message": "Every step counts",
        "pattern_description": "Discovering what works for you"
    }


@bp.route('/me/engagement', methods=['GET'])
@require_auth
def get_user_engagement(user_id: str):
    """
    Get global engagement metrics for the current user across all quests.
    """
    try:
        supabase = get_supabase_admin_client()
        today = datetime.now().date()

        # Get task completions across ALL quests (last 12 weeks)
        twelve_weeks_ago = today - timedelta(weeks=12)

        completions = supabase.table('quest_task_completions')\
            .select('completed_at')\
            .eq('user_id', user_id)\
            .gte('completed_at', twelve_weeks_ago.isoformat())\
            .execute()

        # Get activity events (task views, evidence uploads, tutor chats)
        events = supabase.table('user_activity_events')\
            .select('event_type, created_at')\
            .eq('user_id', user_id)\
            .in_('event_type', ['task_completed', 'evidence_uploaded', 'tutor_message_sent', 'quest_viewed', 'task_viewed'])\
            .gte('created_at', twelve_weeks_ago.isoformat())\
            .execute()

        # Aggregate activities by date
        daily_activities = defaultdict(lambda: {'count': 0, 'activities': set()})
        all_activity_dates = set()

        # Add completions
        for completion in (completions.data or []):
            completed_at = completion.get('completed_at')
            if completed_at:
                date_str = completed_at[:10]
                daily_activities[date_str]['count'] += 1
                daily_activities[date_str]['activities'].add('task_completed')
                all_activity_dates.add(datetime.strptime(date_str, '%Y-%m-%d').date())

        # Add events
        for event in (events.data or []):
            created_at = event.get('created_at')
            if created_at:
                date_str = created_at[:10]
                daily_activities[date_str]['count'] += 1
                daily_activities[date_str]['activities'].add(event.get('event_type'))
                all_activity_dates.add(datetime.strptime(date_str, '%Y-%m-%d').date())

        # Determine calendar range
        if all_activity_dates:
            first_activity = min(all_activity_dates)
            days_active = (today - first_activity).days + 1
            weeks_active = min(max(1, (days_active + 6) // 7), 12)
        else:
            first_activity = today
            weeks_active = 1

        # Build calendar data
        calendar_start = first_activity
        calendar_days = []

        current_date = calendar_start
        while current_date <= today:
            date_str = current_date.strftime('%Y-%m-%d')
            day_data = daily_activities.get(date_str, {'count': 0, 'activities': set()})

            calendar_days.append({
                'date': date_str,
                'activity_count': day_data['count'],
                'intensity': calculate_intensity(day_data['count']),
                'activities': list(day_data['activities'])
            })
            current_date += timedelta(days=1)

        # Calculate rhythm state
        rhythm = calculate_rhythm_state(list(all_activity_dates), today)

        # Summary stats
        last_week_dates = [d for d in all_activity_dates if (today - d).days <= 7]
        last_month_dates = [d for d in all_activity_dates if (today - d).days <= 30]

        return jsonify({
            'success': True,
            'engagement': {
                'calendar': {
                    'first_activity_date': first_activity.isoformat() if all_activity_dates else None,
                    'weeks_active': weeks_active,
                    'days': calendar_days
                },
                'rhythm': rhythm,
                'summary': {
                    'active_days_last_week': len(last_week_dates),
                    'active_days_last_month': len(last_month_dates),
                    'last_activity_date': max(all_activity_dates).isoformat() if all_activity_dates else None,
                    'total_activities': sum(d['count'] for d in daily_activities.values())
                }
            }
        })

    except Exception as e:
        logger.error(f"Error getting user engagement: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch engagement data'
        }), 500
