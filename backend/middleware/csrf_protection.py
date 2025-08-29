"""
CSRF Protection middleware for the Flask application.
Uses Flask-WTF for CSRF token management.

Note: This module is optional. The application will function without it
since JWT-based authentication is inherently CSRF-resistant.
"""

import os

try:
    from flask_wtf.csrf import CSRFProtect, generate_csrf, validate_csrf
    CSRF_AVAILABLE = True
    csrf = CSRFProtect()
except ImportError:
    CSRF_AVAILABLE = False
    csrf = None
    print("Flask-WTF not installed. CSRF protection will be disabled.")

def init_csrf(app):
    """
    Initialize CSRF protection for the Flask app.
    
    Args:
        app: Flask application instance
    """
    if not CSRF_AVAILABLE:
        print("Warning: CSRF protection not available - Flask-WTF not installed")
        return None
    # Configure CSRF settings
    app.config['WTF_CSRF_ENABLED'] = True
    app.config['WTF_CSRF_TIME_LIMIT'] = None  # No time limit for tokens
    app.config['WTF_CSRF_CHECK_DEFAULT'] = False  # We'll manually check for API routes
    
    # Configure CSRF headers for API usage
    app.config['WTF_CSRF_HEADERS'] = ['X-CSRF-Token', 'X-CSRFToken']
    app.config['WTF_CSRF_METHODS'] = ['POST', 'PUT', 'PATCH', 'DELETE']
    
    # Use secure cookies in production
    app.config['WTF_CSRF_SSL_STRICT'] = os.getenv('FLASK_ENV') == 'production'
    
    # Initialize CSRF protection
    csrf.init_app(app)
    
    # Exempt certain endpoints from CSRF protection
    # These are typically public endpoints or endpoints with their own auth
    exempt_endpoints = [
        'auth.login',  # Login uses username/password auth
        'auth.register',  # Registration is public
        'auth.refresh',  # Token refresh uses refresh token
        'health_check',  # Health check is public
        'test_config',  # Test endpoint
        # Webhook endpoints (if any) that use signature verification
        'subscriptions.stripe_webhook',  # Stripe webhook uses signature verification
    ]
    
    for endpoint in exempt_endpoints:
        csrf.exempt(app.view_functions.get(endpoint))
    
    return csrf

def get_csrf_token():
    """
    Generate a new CSRF token.
    
    Returns:
        str: CSRF token or None if not available
    """
    if not CSRF_AVAILABLE:
        return None
    return generate_csrf()

def validate_csrf_token(token):
    """
    Validate a CSRF token.
    
    Args:
        token: The token to validate
        
    Returns:
        bool: True if valid, False otherwise
    """
    if not CSRF_AVAILABLE:
        return False
    try:
        validate_csrf(token)
        return True
    except:
        return False