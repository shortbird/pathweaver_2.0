"""
Development utilities - ONLY for testing
REMOVE OR SECURE IN PRODUCTION!
"""
from flask import Blueprint, request, jsonify
import os
from middleware.rate_limiter import rate_limiter

bp = Blueprint('dev_utils', __name__)

@bp.route('/reset-rate-limit', methods=['POST'])
def reset_rate_limit():
    """
    Reset rate limit for testing purposes
    ONLY WORKS IN DEVELOPMENT MODE
    """
    # Only allow in development
    if os.getenv('FLASK_ENV') != 'development':
        return jsonify({'error': 'This endpoint is only available in development mode'}), 403
    
    # Get IP to reset (default to requester's IP)
    data = request.json or {}
    ip_to_reset = data.get('ip', request.remote_addr)
    
    # Reset the rate limit for this IP
    rate_limiter.reset(ip_to_reset)
    
    return jsonify({
        'message': f'Rate limit reset for IP: {ip_to_reset}',
        'status': 'success'
    }), 200

@bp.route('/reset-all-rate-limits', methods=['POST'])
def reset_all_rate_limits():
    """
    Reset ALL rate limits for testing
    ONLY WORKS IN DEVELOPMENT MODE
    """
    # Only allow in development
    if os.getenv('FLASK_ENV') != 'development':
        return jsonify({'error': 'This endpoint is only available in development mode'}), 403
    
    # Clear all rate limit data
    rate_limiter.requests.clear()
    rate_limiter.blocked_ips.clear()
    
    return jsonify({
        'message': 'All rate limits have been reset',
        'status': 'success'
    }), 200