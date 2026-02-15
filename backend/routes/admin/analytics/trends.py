"""
Analytics Trends Endpoint

Provides historical trends data using shared cache.
Optimized with AnalyticsDataCacheService.
"""

from flask import jsonify
from datetime import datetime, timedelta
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.logger import get_logger

from . import bp

logger = get_logger(__name__)


@bp.route('/trends', methods=['GET'])
@require_admin
def get_trends_data(user_id):
    """Get historical trends data using shared cache (optimized Month 6)"""
    from services.analytics_data_cache_service import AnalyticsDataCacheService

    supabase = get_supabase_admin_client()
    cache_service = AnalyticsDataCacheService(supabase, ttl_seconds=120)

    try:
        # Get trends data from shared cache
        trends_data = cache_service.get_trends_data(days_back=30)

        # Popular quests simplified - return empty to avoid foreign key issues
        popular_quests_data = []

        result_data = {
            'daily_signups': trends_data['daily_signups'],
            'daily_completions': trends_data['daily_completions'],
            'xp_by_pillar': trends_data['xp_by_pillar'],
            'popular_quests': popular_quests_data,
            'date_range': trends_data['date_range']
        }

        return jsonify({'success': True, 'data': result_data})

    except Exception as e:
        logger.error(f"Error getting trends data: {str(e)}")
        return jsonify({
            'success': True,
            'data': {
                'daily_signups': {},
                'daily_completions': {},
                'xp_by_pillar': {
                    'stem': 0,
                    'wellness': 0,
                    'communication': 0,
                    'civics': 0,
                    'art': 0
                },
                'popular_quests': [],
                'date_range': {
                    'start': (datetime.utcnow() - timedelta(days=30)).date().isoformat(),
                    'end': datetime.utcnow().date().isoformat()
                }
            }
        })
