"""
Development utilities - for testing and admin use
"""
from flask import Blueprint, request, jsonify
import os
import hashlib
from middleware.rate_limiter import rate_limiter

bp = Blueprint('dev_utils', __name__)

# Simple password hash for admin access (Test123!)
ADMIN_RESET_PASSWORD_HASH = "9b1810e1fcb0cbf9e996ff7c288f356f4f3758cb3edb1d8f15311f7d381e4b33"  # SHA256 of "Test123!"

def verify_admin_password(password):
    """Verify the admin password for rate limit reset"""
    if not password:
        return False
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    return password_hash == ADMIN_RESET_PASSWORD_HASH

@bp.route('/reset-rate-limit', methods=['POST'])
def reset_rate_limit():
    """
    Reset rate limit for testing purposes
    Requires password in production
    """
    # In production, require password
    if os.getenv('FLASK_ENV') != 'development':
        data = request.json or {}
        if not verify_admin_password(data.get('password')):
            return jsonify({'error': 'Invalid password'}), 403
    
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
    Requires password in production
    """
    # In production, require password
    if os.getenv('FLASK_ENV') != 'development':
        data = request.json or {}
        password = data.get('password')
        if not verify_admin_password(password):
            # Debug info - remove after testing
            import hashlib
            provided_hash = hashlib.sha256(password.encode()).hexdigest() if password else 'No password provided'
            return jsonify({
                'error': 'Invalid password',
                'debug': {
                    'env': os.getenv('FLASK_ENV'),
                    'password_provided': bool(password),
                    'expected_hash': ADMIN_RESET_PASSWORD_HASH[:10] + '...',
                    'provided_hash': provided_hash[:10] + '...' if password else provided_hash
                }
            }), 403
    
    # Clear all rate limit data
    rate_limiter.requests.clear()
    rate_limiter.blocked_ips.clear()
    
    return jsonify({
        'message': 'All rate limits have been reset',
        'status': 'success'
    }), 200