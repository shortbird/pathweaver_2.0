"""
Public Subscription Tiers Routes

Provides read-only access to active subscription tiers for frontend display.
This endpoint is public and cached for performance.
"""

from flask import Blueprint, jsonify
from database import get_supabase_client
from functools import lru_cache
from datetime import datetime, timedelta

bp = Blueprint('tiers', __name__)

# Cache tier data for 5 minutes
_tier_cache = {'data': None, 'timestamp': None}
CACHE_DURATION = timedelta(minutes=5)

@bp.route('/api/tiers', methods=['GET'])
def get_active_tiers():
    """Get all active subscription tiers for public display"""
    global _tier_cache

    try:
        # Check cache
        now = datetime.now()
        if (_tier_cache['data'] is not None and
            _tier_cache['timestamp'] is not None and
            now - _tier_cache['timestamp'] < CACHE_DURATION):
            return jsonify(_tier_cache['data']), 200

        # Fetch from database
        supabase = get_supabase_client()
        response = supabase.table('subscription_tiers')\
            .select('*')\
            .eq('is_active', True)\
            .order('sort_order')\
            .execute()

        # Update cache
        _tier_cache['data'] = response.data
        _tier_cache['timestamp'] = now

        return jsonify(response.data), 200

    except Exception as e:
        print(f"Error fetching tiers: {str(e)}")
        return jsonify({'error': 'Failed to fetch subscription tiers'}), 500


@bp.route('/api/tiers/clear-cache', methods=['POST'])
def clear_tier_cache():
    """Clear the tier cache (useful after admin updates)"""
    global _tier_cache
    _tier_cache = {'data': None, 'timestamp': None}
    return jsonify({'message': 'Tier cache cleared'}), 200
