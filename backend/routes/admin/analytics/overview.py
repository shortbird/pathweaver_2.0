"""
Analytics Overview Endpoint

Provides key dashboard metrics using shared data cache.
Optimized with AnalyticsDataCacheService to reduce queries.
"""

from flask import jsonify
from datetime import datetime
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.logger import get_logger

from . import bp

logger = get_logger(__name__)


@bp.route('/overview', methods=['GET'])
@require_admin
def get_overview_metrics(user_id):
    """Get key dashboard metrics using shared base data cache (optimized Month 6)"""
    from services.analytics_data_cache_service import AnalyticsDataCacheService

    supabase = get_supabase_admin_client()
    cache_service = AnalyticsDataCacheService(supabase, ttl_seconds=120)

    try:
        # Get all base analytics data from shared cache (2-3 queries instead of 7+)
        base_data = cache_service.get_base_analytics_data()

        # Quest submissions feature removed - users can create their own quests directly
        pending_count = 0

        # Subscription tiers removed in Phase 1 refactoring (January 2025)
        subscription_stats = []

        result_data = {
            'total_users': base_data['total_users'],
            'active_users': base_data['active_users'],
            'new_users_week': base_data['new_users_week'],
            'quest_completions_today': base_data['quest_completions_today'],
            'quest_completions_week': base_data['quest_completions_week'],
            'total_xp_week': base_data['total_xp_week'],
            'pending_submissions': pending_count,
            'flagged_tasks_count': base_data['flagged_tasks_count'],
            'engagement_rate': base_data['engagement_rate'],
            'subscription_distribution': subscription_stats,
            'last_updated': base_data['last_updated']
        }

        return jsonify({'success': True, 'data': result_data})

    except Exception as e:
        logger.error(f"Error getting overview metrics: {str(e)}")
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
                'subscription_distribution': [],
                'last_updated': datetime.utcnow().isoformat()
            }
        })
