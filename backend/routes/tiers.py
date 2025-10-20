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
    """Get all active subscription tiers for public display

    NOTE: Subscription tiers removed in Phase 1 refactoring (January 2025)
    This endpoint returns empty array to prevent frontend errors.
    Will be completely removed in Phase 2.
    """
    # Return empty array - subscription system removed
    return jsonify([]), 200


@bp.route('/api/tiers/clear-cache', methods=['POST'])
def clear_tier_cache():
    """Clear the tier cache (useful after admin updates)"""
    global _tier_cache
    _tier_cache = {'data': None, 'timestamp': None}
    return jsonify({'message': 'Tier cache cleared'}), 200
