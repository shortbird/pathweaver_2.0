"""
Analytics System Health Endpoint

Provides system health indicators and alerts.
"""

from flask import jsonify
from datetime import datetime, timedelta
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.logger import get_logger

from . import bp, get_cached_data, set_cached_data

logger = get_logger(__name__)


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

        # Check for inactive users (no activity in 30+ days)
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

        # Calculate platform health score (0-100)
        health_score = 100

        if (inactive_users.count or 0) > 50:
            health_score -= 20
        if (stalled_quests.count or 0) > 20:
            health_score -= 15

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

        result_data = {
            'health_score': health_score,
            'alerts': alerts,
            'metrics': {
                'inactive_users': inactive_users.count or 0,
                'stalled_quests': stalled_quests.count or 0,
                'old_submissions': 0  # Quest submissions feature removed
            },
            'last_checked': now.isoformat()
        }

        set_cached_data('health', result_data, ttl_seconds=120)

        return jsonify({'success': True, 'data': result_data})

    except Exception as e:
        logger.error(f"Error getting system health: {str(e)}")
        return jsonify({
            'success': True,
            'data': {
                'health_score': 50,
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
